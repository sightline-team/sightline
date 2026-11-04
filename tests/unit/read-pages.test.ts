import { describe, expect, it } from 'vitest';
import { readPages, type ReadPagesDeps } from '@/features/capture/read_pages';
import { PAGE_JOINER } from '@/features/capture/assemble';
import { TRANSCRIBE_USER_PROMPT } from '@/features/capture/prompts';
import { RunHalt, type AttestationGate, type GateOutcome, type SignatureOutcome, type SignatureVerifier } from '@/lib/near-ai/verification';
import { type NearClient, type NearResponse } from '@/lib/near-ai/client';
import type { AppError, ID, Mode, Page, TrustRecord } from '@/types';

/**
 * The page loop (item **C-02**) — the code that gives `transcribePage` (C-03) and `assembleDocument`
 * (C-11) a caller.
 *
 * A single page's request and its contract are `tests/unit/transcribe.test.ts`; the join and the
 * offsets are `tests/unit/assemble.test.ts`. What only *this* sequence can prove is the three things
 * the loop owns: pages run **in series in capture order**, a **refusal stops the next page from being
 * sent** (the person is not billed for pages of a document the service already declined), and a run
 * that was **forgotten mid-document sends no further page** (AGENTS.md §4 rule 6, P-10).
 *
 * The transport is a fake that answers in reply order — one entry per page, since each page here gets
 * exactly one attempt. `transcribePage`, `readCompletion`, `transcribeSchema` and `assembleDocument`
 * are the real ones.
 */

const MODEL = 'z-ai/glm-5.3-flash';

const GATE_OK: GateOutcome = {
  status: 'verified',
  checks: [{ name: 'nonce_fresh', ran: true, passed: true, detail: 'Nonce was generated for this session.' }],
  nonce: 'a'.repeat(64),
  signingAlgo: 'ecdsa',
  fetchedAt: 1_760_000_000_000,
};

const SIG_OK: SignatureOutcome = {
  algo: 'ecdsa',
  verified: true,
  checks: [{ name: 'response_signature', ran: true, passed: true, detail: 'Signature verified against the attested key.' }],
};

/** A page whose transcription arrived, as the loop would put it into the joiner. */
function pageReply(text: string, pageLabel?: string): Reply {
  return { content: JSON.stringify({ text, uncertain: [], captureIssues: [], ...(pageLabel === undefined ? {} : { pageLabel }) }) };
}

interface Reply {
  content?: string | null;
  finish_reason?: string | null;
  refusal?: string | null;
}

/**
 * A page of the person's photographs. Each carries **one distinct byte**, so the base64 in the request
 * body names which page it is: a loop that asked for pages out of order would be answered out of
 * order, and a test would see it.
 */
function makePage(index: number): Page {
  const id = `page-${index}` as ID;
  return {
    id,
    index,
    blob: { type: 'image/jpeg', size: 1, arrayBuffer: async () => new Uint8Array([index + 1]).buffer } as unknown as Blob,
    width: 1_200,
    height: 1_600,
  };
}

function harness(replies: Reply[], opts: { mode?: Mode; pageCount?: number; gate?: GateOutcome } = {}) {
  const mode = opts.mode ?? 'relay';
  const pages = Array.from({ length: opts.pageCount ?? replies.length }, (_, i) => makePage(i));

  const log: string[] = [];
  const posts: { body: unknown; sent: string }[] = [];
  const records: TrustRecord[] = [];
  const started: string[] = [];
  const controller = new AbortController();

  const transport: NearClient = {
    mode,
    baseUrl: '/api/relay/v1',
    post: async (path, body) => {
      const sent = JSON.stringify(body);
      posts.push({ body, sent });
      const reply = replies[Math.min(posts.length - 1, replies.length - 1)]!;
      const message: Record<string, unknown> = { role: 'assistant', content: reply.content ?? null };
      if ('refusal' in reply) message.refusal = reply.refusal;
      const choice: Record<string, unknown> = { message };
      if ('finish_reason' in reply) choice.finish_reason = reply.finish_reason;
      const json = { id: `chat-page-${posts.length}`, model: MODEL, choices: [choice] };
      const response: NearResponse = { status: 200, path, sentBody: sent, rawText: `${sent}\n\n`, json };
      return response;
    },
    get: async (path) => {
      throw new Error(`unexpected GET ${path}`);
    },
  };

  const gate: AttestationGate = async () => {
    log.push('gate');
    return opts.gate ?? GATE_OK;
  };

  const verifySignature: SignatureVerifier = async () => {
    log.push('signature');
    return SIG_OK;
  };

  const deps: ReadPagesDeps = {
    mode,
    model: MODEL,
    transport,
    gate,
    verifySignature,
    signal: controller.signal,
    onTrustRecord: (r) => {
      log.push('record');
      records.push(r);
    },
    onPageStarted: (page, pageCount) => {
      log.push(`start:${page}`);
      started.push(`${page + 1} of ${pageCount}`);
    },
  };

  return { deps, log, posts, records, started, pages, controller };
}

type Harness = ReturnType<typeof harness>;

/** Runs the loop and hands back either the assembly or the halt, which are its two endings. */
async function run(h: Harness) {
  try {
    return { ok: true as const, assembled: await readPages(h.pages, h.deps) };
  } catch (cause) {
    if (cause instanceof RunHalt) return { ok: false as const, error: cause.error };
    throw cause;
  }
}

/** The image the request carried, as the page's own byte — "which photograph is this request for". */
function askedPage(body: unknown): number {
  const messages = (body as { messages: { role: string; content: unknown }[] }).messages;
  const parts = messages[1]!.content as { type: string; text?: string; image_url?: { url: string } }[];
  const url = parts.find((p) => p.type === 'image_url')!.image_url!.url;
  return Buffer.from(url.slice(url.indexOf(',') + 1), 'base64').readUInt8(0) - 1;
}

describe('pages run in series, in capture order (C-02)', () => {
  it('asks for each photograph once, starting with the one it is about before the request exists', async () => {
    const h = harness([pageReply('first page words'), pageReply('second page words'), pageReply('third page words')]);

    const out = await run(h);
    if (!out.ok) throw new Error(`expected an assembly, got halt ${out.error.code}`);

    // The announcement for page 1 happens before page 1's post, and page 2's after page 1's receipt:
    // that is the serial order, and at ≈26 s a page (SPIKE §4) it is what the person hears as progress.
    expect(h.log).toEqual(['start:0', 'gate', 'signature', 'record', 'start:1', 'gate', 'signature', 'record', 'start:2', 'gate', 'signature', 'record']);
    expect(h.started).toEqual(['1 of 3', '2 of 3', '3 of 3']);
    expect(h.posts).toHaveLength(3);
    expect([0, 1, 2].map((i) => askedPage(h.posts[i]!.body))).toEqual([0, 1, 2]);

    // One page per request: five pages in one body is the shape that crosses the relay's cap (F-05)
    // and the thing C-03's single-page design exists to avoid.
    const userContent = (h.posts[0]!.body as { messages: { role: string; content: unknown }[] }).messages[1]!.content as { type: string }[];
    expect(userContent.filter((p) => p.type === 'image_url')).toHaveLength(1);
    expect((userContent as { type: string; text?: string }[]).find((p) => p.type === 'text')!.text).toBe(TRANSCRIBE_USER_PROMPT);

    expect(out.assembled.transcript.text).toBe(['first page words', 'second page words', 'third page words'].join(PAGE_JOINER));
    expect(out.assembled.usable).toBe(true);
    expect(h.records).toHaveLength(3);
    expect(h.records.map((r) => r.purpose)).toEqual(['transcribe', 'transcribe', 'transcribe']);
  });

  it('one photograph is still a document, and the run asks for it once', async () => {
    const h = harness([pageReply('the only page')]);

    const out = await run(h);
    if (!out.ok) throw new Error(`expected an assembly, got halt ${out.error.code}`);

    expect(h.posts).toHaveLength(1);
    expect(out.assembled.transcript.pageOffsets).toEqual([0]);
    expect(out.assembled.transcript.missingPages).toBeUndefined();
  });
});

describe('a page that failed does not stop the others (ADR-27)', () => {
  it('leaves a marked hole where the cut-off page was and reads the rest', async () => {
    const h = harness([pageReply('page one words'), { content: null, finish_reason: 'length' }, pageReply('page three words')]);

    const out = await run(h);
    if (!out.ok) throw new Error(`expected an assembly, got halt ${out.error.code}`);

    expect(out.assembled.transcript.text).toBe(['page one words', '[page 2 could not be read]', 'page three words'].join(PAGE_JOINER));
    expect(out.assembled.transcript.missingPages).toEqual([{ page: 1, code: 'output_truncated' }]);
    expect(out.assembled.usable).toBe(true);
    // The failed page got one attempt and no repair retry: a spent budget is a budget condition (P-13).
    expect(h.posts).toHaveLength(3);
  });

  it('says so when every page failed, and does not call the run usable', async () => {
    const h = harness([{ content: null, finish_reason: 'length' }, { content: 'not json at all' }]);

    const out = await run(h);
    if (!out.ok) throw new Error(`expected an assembly, got halt ${out.error.code}`);

    expect(out.assembled.usable).toBe(false);
    expect(out.assembled.transcript.text).toBe('[page 1 could not be read]\n\n[page 2 could not be read]');
  });
});

describe('what stops the loop', () => {
  it('a refused page stops the run before the next page is sent', async () => {
    // §4 rule 6: the service declined *this document*, so pages 2 and 3 have no reading to join into.
    // The measurable property is the money: the third request is never made.
    const h = harness([pageReply('page one words'), { content: null, refusal: 'I cannot read this document.' }, pageReply('page three words')]);

    const out = await run(h);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe('model_refused');
    expect(h.posts).toHaveLength(2);
    expect(h.started).toEqual(['1 of 3', '2 of 3']);
  });

  it('Forget between pages stops the next request being built (P-10)', async () => {
    const h = harness([pageReply('page one words'), pageReply('page two words')]);
    // The second page's receipt is where a press landing mid-run arrives in the real app.
    const original = h.deps.onTrustRecord;
    h.deps.onTrustRecord = (record: TrustRecord) => {
      original(record);
      if (h.records.length === 1) h.controller.abort();
    };

    const out = await run(h);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error).toEqual(expect.objectContaining({ code: 'aborted' }) as AppError);
    // Page 1 answered and page 2 was never asked for: the guard is before the body, not after it.
    expect(h.posts).toHaveLength(1);
    expect(h.started).toEqual(['1 of 2']);
  });

  it('a page whose signature cannot be proved halts the whole run, receipt written first', async () => {
    const h = harness([pageReply('page one words'), pageReply('page two words')]);
    // The verifier is the app's own collaborator, so this is the real path for rule 5.
    let calls = 0;
    h.deps.verifySignature = async () => {
      calls += 1;
      return calls === 1 ? SIG_OK : { ...SIG_OK, verified: false };
    };

    const out = await run(h);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe('signature_invalid');
    expect(h.records).toHaveLength(2);
    expect(h.posts).toHaveLength(2);
  });

  it('a failed attestation gate sends nothing at all', async () => {
    const h = harness([pageReply('page one words')], { gate: { ...GATE_OK, status: 'failed' } });

    const out = await run(h);
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.error.code).toBe('verification_failed');
    expect(h.posts).toEqual([]);
    expect(h.records).toEqual([]);
  });
});
