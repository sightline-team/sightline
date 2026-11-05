/**
 * **S-06**'s browser half: the code that runs **inside Chromium**.
 *
 * It is bundled by `tests/e2e/browser-cors.spec.ts` with esbuild and injected as a script tag, so
 * every line here executes in a page whose origin is the dev server's and whose requests are subject
 * to whatever the browser and the served headers allow — which is the whole point. Until now every
 * CORS fact in `docs/SPIKE_RESULTS.md` §6 came from a Node `fetch` that was *told* to set an `Origin`,
 * and a told origin is not a navigated one.
 *
 * Nothing here reimplements the app. The client is `createNearClient` in **direct** mode (Mode A's
 * shape, ADR-17: the browser holds the key and asks for the report itself), the report is read by
 * `fetchReport` and judged by `bindReport` and `checkQuote`, and the exchange is verified by the
 * production `createSignatureVerifier`. If any of those modules change shape this file stops
 * compiling rather than drifting.
 *
 * **What leaves this function is statuses, byte counts, check names and timings.** No key, no document,
 * no response text — the reply's content is measured in characters and dropped (AGENTS.md §4 rule 7).
 */
import { newNonce, bindReport, fetchReport } from '@/lib/near-ai/attestation';
import { completionRequestBody } from '@/lib/near-ai/completion';
import { createNearClient } from '@/lib/near-ai/client';
import { STEP_PLANS } from '@/lib/near-ai/models';
import { checkQuote } from '@/lib/near-ai/quote';
import { createSignatureVerifier } from '@/lib/near-ai/signatures';

/** The `/v1` is part of the base, exactly as `scripts/spike.ts` builds it — ask without it and the
 *  service answers 404, which is how this line was measured rather than guessed. */
const DIRECT_BASE_URL = 'https://cloud-api.near.ai/v1';

/**
 * A prompt with no document in it. S-06 asks whether a browser can complete an authenticated round
 * trip and whether the answer verifies; it has never asked what the model says about somebody's bill —
 * and rule 6 means nothing document-derived would be sent before the gate passed anyway.
 */
const PROBE_SYSTEM = 'You are a connectivity probe. Reply with exactly the word you are given and nothing else.';
const PROBE_USER = 'Reply with exactly this word: sightline';

export interface ObservedCall {
  /** The path as asked for, never the host's userinfo and never a header. */
  path: string;
  status: number;
  ms: number;
  /** Response bytes, counted from a clone so the app's own read is untouched. */
  bytes: number;
}

export interface NamedCheck {
  name: string;
  ran: boolean;
  passed: boolean;
}

export interface RoundTripSummary {
  /** Where the page that made the calls came from — the value a server echoes in `allow-origin`. */
  origin: string;
  model: string;
  /** The model the *service* named in its envelope, which is the one that answered. */
  servedBy: string;
  nonce: string;
  calls: ObservedCall[];
  bind: NamedCheck[];
  bindStatus: string;
  quote: NamedCheck[];
  signingKeyPresent: boolean;
  /** First 8 characters — enough to prove a real exchange id came back, not enough to look it up. */
  chatIdPrefix: string;
  completionChars: number;
  finishReason: string;
  signatureVerified: boolean;
  signatureChecks: NamedCheck[];
  signatureDetail: string;
}

function named(checks: readonly { name: string; ran: boolean; passed: boolean; detail?: string }[]): NamedCheck[] {
  return checks.map((c) => ({ name: c.name, ran: c.ran, passed: c.passed }));
}

export async function runRoundTrip(apiKey: string): Promise<RoundTripSummary> {
  const calls: ObservedCall[] = [];

  /**
   * A transport that only **watches**. Every request still leaves from this page, with this page's
   * origin, under the browser's own CORS rules — the wrapper is here so the statuses and byte counts
   * in the summary are read off the responses the app actually received, not asserted by the caller.
   */
  const observingFetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? String(input) : input.url);
    const started = performance.now();
    const response = await fetch(input as RequestInfo, init);
    const text = await response.clone().text();
    // An exchange id in a path is not a secret, but it is enough to look a signature record up with,
    // and nothing downstream needs it. Shorten it here so the console line and the assertions agree
    // with what this file claims to return.
    const path = url.pathname.replace(/^(\/v1\/signature\/)(\w{6})\w+/, '$1$2…');
    calls.push({ path, status: response.status, ms: Math.round(performance.now() - started), bytes: text.length });
    return response;
  };

  const client = createNearClient({
    mode: 'direct',
    baseUrl: DIRECT_BASE_URL,
    // A provider, not a literal, because that is the shape Mode A needs per call (ADR-17). The value
    // is never returned from this function and never printed by the spec that calls it.
    headers: () => ({ authorization: `Bearer ${apiKey}` }),
    fetchImpl: observingFetch,
  });

  const model = STEP_PLANS.transcribe.model;
  const nonce = newNonce();

  // 1. The report, asked for with our own nonce — `GET /v1/attestation/report` from a page, which is
  //    the premise ADR-17 has been asserting since it was written.
  const report = await fetchReport(client, { model, nonce, signingAlgo: 'ed25519' });
  const binding = bindReport({ report, nonce, signingAlgo: 'ed25519' });
  const quote = checkQuote({
    attestation: report.model_attestations?.[0],
    nonce,
    label: 'the model enclave',
    expectedKey: binding.signingKey?.keyOrAddress,
  });

  // 2. A completion, non-streamed (ADR-22), posted by the browser with the key the browser holds.
  //    `max_tokens: 640` is the spike's measured number, not caution: at 8 tokens a reasoning model
  //    spends the whole budget on reasoning and returns `content: ""` with `finish_reason: "length"`
  //    (`scripts/spike.ts`'s `PROBE_MAX_TOKENS` note), and an empty reply would make this test's
  //    "a round trip happened" claim read as true when nothing came back.
  const body = completionRequestBody({ system: PROBE_SYSTEM, user: PROBE_USER, model, maxTokens: 640 });
  const completion = await client.post('chat/completions', body);
  const envelope = completion.json as { id?: string; model?: string; choices?: { finish_reason?: string; message?: { content?: string } }[] };
  const chatId = envelope.id ?? '';
  const content = envelope.choices?.[0]?.message?.content ?? '';

  // 3. The verifier the pipeline uses, given the exact bytes of that exchange and the key the report
  //    named. It fetches `/v1/signature/{chat_id}` itself and re-derives what was signed.
  const signingKey = binding.signingKey;
  if (signingKey === undefined) throw new Error('the live report named no signing key, so there is nothing to verify a signature against');
  if (completion.sentBody === undefined) throw new Error('the client returned a POST without the exact bytes it sent — ADR-19 needs them to rebuild request_hash');
  const verify = createSignatureVerifier({
    client,
    attested: () => ({ algo: signingKey.algo, keyOrAddress: signingKey.keyOrAddress }),
  });
  const signature = await verify({ chatId, model, sentBody: completion.sentBody, rawText: completion.rawText, signal: new AbortController().signal });

  return {
    origin: self.location.origin,
    model,
    servedBy: envelope.model ?? '(unstated)',
    nonce,
    calls,
    bind: named(binding.checks),
    bindStatus: binding.status,
    quote: named(quote),
    signingKeyPresent: binding.signingKey !== undefined,
    chatIdPrefix: chatId.slice(0, 8),
    completionChars: content.length,
    finishReason: envelope.choices?.[0]?.finish_reason ?? '(none)',
    signatureVerified: signature.verified,
    signatureChecks: named(signature.checks),
    signatureDetail: signature.checks.map((c) => c.detail ?? '').find((d) => d !== '') ?? '',
  };
}
