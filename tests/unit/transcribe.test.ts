import { describe, expect, it } from 'vitest';
import { transcribePage, TRANSCRIBE_MAX_TOKENS, type TranscribeDeps } from '@/features/capture/transcribe';
import { TRANSCRIBE_SYSTEM_PROMPT, TRANSCRIBE_USER_PROMPT } from '@/features/capture/prompts';
import { captureIssueSchema } from '@/features/capture/schemas';
import { RunHalt, type AttestationGate, type GateOutcome, type SignatureOutcome, type SignatureVerifier } from '@/lib/near-ai/verification';
import { type NearClient, type NearResponse } from '@/lib/near-ai/client';
import { REPAIR_NOTE } from '@/lib/near-ai/completion';
import { createFixtureClient } from '@/lib/fixtures/replay';
import { appError } from '@/lib/errors';
import type { AppError, CheckResult, ErrorCode, Mode, TrustRecord } from '@/types';

/**
 * The per-page transcription request (item **C-03**).
 *
 * Like `tests/unit/pipeline.test.ts`, these do not test what a model would say — they test the
 * *order and the bytes*, because that is where the privacy claim lives and where a page differs from
 * a pasted transcript:
 *  - the photograph must not be encoded into a body before the attestation gate passes (AGENTS.md §4
 *    rule 6). For text the body was cheap, so "no post" was enough evidence. A page is ~1 MB of the
 *    person's document sitting in memory as a string, so the assertion is about the encoding itself;
 *  - the signed bytes must be the whole body, image included (ADR-19) — a signature over a hash that
 *    left the photograph out would attest to the prompt only;
 *  - the reply contract is enforced, not hoped at: a capture problem the code cannot name, or a page
 *    that ran out of room (**P-13**), has to land on a stated outcome rather than a silently-empty one.
 *
 * The transport, gate and verifier are fakes. `toDataUrl` and `transcribeSchema` are the real ones.
 */

const MODEL = 'z-ai/glm-5.3-flash';
/** The three bytes 0x01 0x02 0x03, which base64 to `AQID` — so the URL in the body is checkable. */
const PAGE_BYTES = new Uint8Array([1, 2, 3]);
const PAGE_DATA_URL = 'data:image/jpeg;base64,AQID';

const TRANSCRIPT_JSON = JSON.stringify({
  text: 'Northgate Care NHS Trust\nAmount due: £840\n[illegible]',
  uncertain: [{ start: 39, end: 49, reason: 'illegible' }],
  captureIssues: ['glare'],
  pageLabel: 'Page 2 of 3',
});

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

type EnvelopeExtras = { finish_reason?: string | null; refusal?: string | null };

function envelopeJson(content: string | null, extra: EnvelopeExtras = {}): Record<string, unknown> {
  const message: Record<string, unknown> = { role: 'assistant', content };
  if ('refusal' in extra) message.refusal = extra.refusal;
  const choice: Record<string, unknown> = { message };
  if ('finish_reason' in extra) choice.finish_reason = extra.finish_reason;
  return { id: 'chat-page-1', model: MODEL, choices: [choice] };
}

interface Options {
  mode?: Mode;
  gate?: GateOutcome;
  signature?: SignatureOutcome;
  /** One entry per attempt; the last one repeats. */
  contents?: (string | null)[];
  extra?: EnvelopeExtras;
  postThrows?: unknown;
}

/**
 * A blob that reports how many times it was read. `toDataUrl` only ever calls `arrayBuffer()`, so
 * this is the real helper's real input path with a counter on it — the count is what proves both
 * "nothing was encoded before the gate" and "a retry did not re-encode the photograph".
 */
function countedBlob(log: string[]): { blob: Blob; reads: () => number } {
  let count = 0;
  return {
    blob: {
      type: 'image/jpeg',
      size: PAGE_BYTES.length,
      arrayBuffer: async () => {
        count += 1;
        log.push('encode');
        return PAGE_BYTES.buffer;
      },
    } as unknown as Blob,
    reads: () => count,
  };
}

function harness(opts: Options = {}) {
  const mode = opts.mode ?? 'relay';
  const contents = opts.contents ?? [TRANSCRIPT_JSON];
  const contentFor = (attempt: number): string | null => contents[Math.min(attempt, contents.length - 1)]!;

  const log: string[] = [];
  const page = countedBlob(log);
  const posts: { path: string; body: unknown; sent: string; raw: string }[] = [];
  const sigCalls: { chatId: string; sentBody: string; rawText: string }[] = [];
  const records: TrustRecord[] = [];

  const transport: NearClient = {
    mode,
    baseUrl: mode === 'fixtures' ? 'fixtures://local' : '/api/relay/v1',
    post: async (path, body, init) => {
      if (mode === 'fixtures') {
        // The real Mode F client, so the refusal a page gets in a demo is the one F-09 wrote and not
        // an imitation of it.
        return createFixtureClient().post(path, body, init);
      }
      log.push('post');
      const json = envelopeJson(contentFor(posts.length), opts.extra);
      const sent = JSON.stringify(body);
      posts.push({ path, body, sent, raw: `${sent}\n\n` });
      if (opts.postThrows !== undefined) throw opts.postThrows;
      const response: NearResponse = { status: 200, path, sentBody: sent, rawText: `${sent}\n\n`, json };
      return response;
    },
    get: async (path) => {
      throw new Error(`unexpected GET ${path}`);
    },
  };

  const gate: AttestationGate = async ({ model }) => {
    log.push('gate');
    expect(model).toBe(MODEL);
    return opts.gate ?? GATE_OK;
  };

  const verifySignature: SignatureVerifier = async ({ chatId, sentBody, rawText }) => {
    log.push('signature');
    sigCalls.push({ chatId, sentBody, rawText });
    return opts.signature ?? SIG_OK;
  };

  const deps: TranscribeDeps = {
    mode,
    model: MODEL,
    transport,
    gate,
    verifySignature,
    signal: new AbortController().signal,
    onTrustRecord: (r) => {
      log.push('onTrustRecord');
      records.push(r);
    },
  };

  return { deps, log, page, posts, sigCalls, records };
}

type Harness = ReturnType<typeof harness>;

/** Runs one page and hands back either the result or the halt — the two ways C-03 can end. */
async function runPage(h: Harness): Promise<{ kind: 'result'; value: Awaited<ReturnType<typeof transcribePage>> } | { kind: 'halt'; error: AppError }> {
  try {
    return { kind: 'result', value: await transcribePage(h.deps, h.page.blob) };
  } catch (cause) {
    if (cause instanceof RunHalt) return { kind: 'halt', error: cause.error };
    throw cause;
  }
}

async function expectHalt(h: Harness, code: ErrorCode): Promise<AppError> {
  const out = await runPage(h);
  if (out.kind !== 'halt') throw new Error(`expected a halt with ${code}, got ${out.value.kind}`);
  expect(out.error.code).toBe(code);
  return out.error;
}

async function expectOk(h: Harness) {
  const out = await runPage(h);
  if (out.kind !== 'result') throw new Error(`expected a completion, got halt ${out.error.code}`);
  if (out.value.kind !== 'ok') throw new Error(`expected ok, got ${out.value.kind}`);
  return out.value;
}

describe('nothing is encoded before the checks (AGENTS.md §4 rule 6)', () => {
  it('a failed attestation gate leaves the photograph in the tab', async () => {
    const h = harness({ gate: { ...GATE_OK, status: 'failed' } });

    await expectHalt(h, 'verification_failed');

    // The page, not the request, is what this asserts: zero reads means `toDataUrl` never ran, so no
    // ~1 MB string of the person's document existed after a gate that said no.
    expect(h.page.reads()).toBe(0);
    expect(h.log).toEqual(['gate']);
    expect(h.posts).toEqual([]);
    expect(h.records).toEqual([]);
  });

  it('gates, then encodes the page, then posts, then checks the signature, in that order', async () => {
    const h = harness();

    await expectOk(h);

    expect(h.log).toEqual(['gate', 'encode', 'post', 'signature', 'onTrustRecord']);
    expect(h.page.reads()).toBe(1);
  });

  it('refuses a page in Mode F, where no authored page reply exists', async () => {
    const h = harness({ mode: 'fixtures' });

    const error = await expectHalt(h, 'no_fixture_for_input');

    expect(error.userMessage).toBe(appError('no_fixture_for_input').userMessage);
    // Mode F asked no enclave and got no receipt: the refusal is the transport's, before any body
    // could be recorded as a verified call.
    expect(h.records).toEqual([]);
  });
});

describe('the request body is the shape the service answers (SPIKE §4)', () => {
  it('sends the page as an image_url part beside the instruction, with the budget ADR-23 names', async () => {
    const h = harness();

    await expectOk(h);

    expect(h.posts).toHaveLength(1);
    expect(h.posts[0]!.body).toEqual({
      model: MODEL,
      messages: [
        { role: 'system', content: TRANSCRIBE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            { type: 'text', text: TRANSCRIBE_USER_PROMPT },
            { type: 'image_url', image_url: { url: PAGE_DATA_URL } },
          ],
        },
      ],
      max_tokens: TRANSCRIBE_MAX_TOKENS,
    });
  });

  it('carries no stream, no response_format and no sampling field', async () => {
    const h = harness();

    await expectOk(h);

    const body = h.posts[0]!.body as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(['max_tokens', 'messages', 'model']);
  });

  it('tells the model nothing about which page this is or how many there are', async () => {
    const h = harness();

    await expectOk(h);

    // C-05's gap-and-duplicate check only means something if `pageLabel` came off the paper. A body
    // that said "page 1 of 3" would let the model echo us, and the check would pass on its own echo.
    const user = (h.posts[0]!.body as { messages: { role: string; content: unknown }[] }).messages[1]!.content;
    const text = (user as { type: string; text: string }[]).find((p) => p.type === 'text')!.text;
    expect(text).toBe('Transcribe this page.');
    expect(text).not.toMatch(/\d/);
  });

  it('signs the bytes that include the photograph, not the prompt around it (ADR-19)', async () => {
    const h = harness();

    await expectOk(h);

    expect(h.sigCalls).toHaveLength(1);
    expect(h.sigCalls[0]!.sentBody).toBe(h.posts[0]!.sent);
    expect(h.sigCalls[0]!.sentBody).toContain(PAGE_DATA_URL);
    expect(h.sigCalls[0]!.rawText).toBe(h.posts[0]!.raw);
    expect(h.sigCalls[0]!.chatId).toBe('chat-page-1');
  });

  it('keeps the system prompt byte-identical across a repair retry, page included', async () => {
    const h = harness({ contents: ['Not JSON at all.', TRANSCRIPT_JSON] });

    await expectOk(h);

    expect(h.posts).toHaveLength(2);
    const systemOf = (body: unknown): string => (body as { messages: { role: string; content: string }[] }).messages[0]!.content;
    expect(systemOf(h.posts[1]!.body)).toBe(systemOf(h.posts[0]!.body));
    expect(systemOf(h.posts[0]!.body)).toBe(TRANSCRIBE_SYSTEM_PROMPT);
    // The repair note joins the *text* part, and the page is still the same bytes it was.
    const retryUser = (h.posts[1]!.body as { messages: { role: string; content: { type: string; text?: string }[] }[] }).messages[1]!.content;
    expect(retryUser[0]!.text).toBe(`${TRANSCRIBE_USER_PROMPT}\n\n${REPAIR_NOTE}`);
    expect(retryUser[1]).toEqual({ type: 'image_url', image_url: { url: PAGE_DATA_URL } });
    // And it was read off the blob once, not once per attempt (C-07's memory question).
    expect(h.page.reads()).toBe(1);
  });
});

describe('a page reply is held to the contract', () => {
  it('reads a live-shaped reply into the transcript the schema promises', async () => {
    const h = harness();

    const reading = await expectOk(h);

    expect(reading.value).toEqual({
      text: 'Northgate Care NHS Trust\nAmount due: £840\n[illegible]',
      uncertain: [{ start: 39, end: 49, reason: 'illegible' }],
      captureIssues: ['glare'],
      pageLabel: 'Page 2 of 3',
    });
    expect(reading.model).toBe(MODEL);
    expect(h.records).toHaveLength(1);
    expect(h.records[0]!.purpose).toBe('transcribe');
  });

  it('reports a page that ran out of room as truncated, after one attempt (P-13)', async () => {
    // The measured live shape for a spent budget: `content: null` with `reasoning_content` filled and
    // `finish_reason: "length"`. A budget is a budget condition, so the repair retry is not spent on
    // it — and the person is told "no answer arrived", never "the service is broken".
    const h = harness({ contents: [null], extra: { finish_reason: 'length' } });

    const out = await runPage(h);
    if (out.kind !== 'result') throw new Error(`expected a degraded result, got halt ${out.error.code}`);

    expect(out.value.kind).toBe('truncated');
    if (out.value.kind !== 'truncated') return;
    expect(out.value.error.code).toBe('output_truncated');
    expect(h.log).toEqual(['gate', 'encode', 'post', 'signature', 'onTrustRecord']);
  });

  it('discards a transcript whose signature cannot be proved, receipt first', async () => {
    const h = harness({ signature: { ...SIG_OK, verified: false } });

    await expectHalt(h, 'signature_invalid');

    expect(h.records).toHaveLength(1);
    expect(h.log).toEqual(['gate', 'encode', 'post', 'signature', 'onTrustRecord']);
  });

  it('names a capture problem it cannot name as unreadable rather than as none', async () => {
    // `{"captureIssues": ["dark photo"]}` is a model reporting something wrong with the photograph in
    // words the retake loop (C-04) has no message for. Dropping the entry would announce a clean
    // capture; the honest outcome is the one the catalogue already holds, after the one retry.
    const h = harness({ contents: [JSON.stringify({ text: 'x', captureIssues: ['dark photo'] })] });

    const out = await runPage(h);
    if (out.kind !== 'result') throw new Error(`expected a degraded result, got halt ${out.error.code}`);

    expect(out.value.kind).toBe('unreadable');
    expect(h.posts).toHaveLength(2);
    expect(h.records).toHaveLength(2);
  });

  it('asks for exactly the vocabulary the schema validates', () => {
    // The defect this guards: the template used to say `"captureIssues": [string]` while the schema
    // accepted ten fixed values, so every honest answer about the photo risked the whole page. If the
    // two ever drift again, the page path fails on a vocabulary slip and nothing else would say so.
    const listed = TRANSCRIBE_SYSTEM_PROMPT.match(/"captureIssues": \[([^\]]*)\]/)?.[1] ?? '';
    const fromPrompt = [...listed.matchAll(/"([^"]+)"/g)].map((m) => m[1]!);
    expect(fromPrompt).toEqual([...captureIssueSchema.options]);

    const reasons = TRANSCRIBE_SYSTEM_PROMPT.match(/"reason": ([^}\]]*)/)?.[1] ?? '';
    expect([...reasons.matchAll(/"([^"]+)"/g)].map((m) => m[1]!)).toEqual(['illegible', 'low_contrast', 'cropped']);
  });
});
