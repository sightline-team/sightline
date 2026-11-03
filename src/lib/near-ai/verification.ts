import { z } from 'zod';
import { NearError } from '@/lib/near-ai/client';
import { appError } from '@/lib/errors';
import type { AppError, AttestationStatus, CheckResult } from '@/types';

/**
 * The two verification steps a run depends on, as **contracts** (items **T-01**, **T-02**,
 * **T-03**), and the halt shape both runs report failures in.
 *
 * These live in `lib/` rather than in `features/analysis/pipeline.ts` because more than one
 * feature makes a call that carries document data: the structure step (P-03) and question
 * answering (P-06). Both must obey the same rule — attestation before the request exists,
 * signature before the answer is shown (AGENTS.md §4 rule 4) — and a rule that is duplicated
 * per feature is a rule one of them will eventually drift. The *implementations* are T-01 and
 * T-02; this file only fixes what they must return, so both call sites can be tested against
 * injected fakes without a live enclave (blocker B-05).
 */

/** A stop the caller must show. One shape for every failure in a run, question or analysis. */
export class RunHalt extends Error {
  readonly error: AppError;

  constructor(error: AppError) {
    super(error.userMessage);
    this.name = 'RunHalt';
    this.error = error;
  }
}

/**
 * What the attestation gate found. `status: 'not_run'` is Mode F: there is no enclave to
 * attest, and calling that `failed` would be a claim about a check that never happened.
 * `claimFor` gives it no rung either way, and the demo-data banner is what the user sees.
 */
export interface GateOutcome {
  status: AttestationStatus;
  checks: CheckResult[];
  nonce: string;
  signingAlgo: 'ecdsa' | 'ed25519';
  /** When the report was fetched. `0` means never, which is only honest in Mode F. */
  fetchedAt: number;
}

export interface SignatureOutcome {
  algo: 'ecdsa' | 'ed25519';
  verified: boolean;
  checks: CheckResult[];
}

export type AttestationGate = (args: { model: string; signal: AbortSignal }) => Promise<GateOutcome>;

/**
 * ADR-19 in one signature: the verifier is handed the **exact** bytes (`sentBody`, `rawText`)
 * so it can rebuild `request_hash` and `response_hash`, plus the completion id to fetch the
 * signature with. F-03 keeps those bytes for no other reason.
 */
export type SignatureVerifier = (args: {
  chatId: string;
  model: string;
  sentBody: string;
  rawText: string;
  signal: AbortSignal;
}) => Promise<SignatureOutcome>;

/** The checks Mode F can honestly report: the only one that runs is the transcript consistency check. */
function fixtureChecks(): CheckResult[] {
  return [
    { name: 'attestation_report', ran: false, passed: false, detail: 'Fixture mode calls no service, so there is no report to check.' },
    { name: 'quote_consistency', ran: true, passed: true, detail: 'Quotes were matched against the transcript the user pasted.' },
  ];
}

/**
 * Mode F's gate outcome, in one place: there is no enclave to attest, so the status is
 * `not_run` and the nonce is empty. A fixture run that reported `verified` here would put a
 * verification claim on screen that nothing produced (AGENTS.md §4 rule 11).
 */
export function fixtureGate(): GateOutcome {
  return { status: 'not_run', checks: fixtureChecks(), nonce: '', signingAlgo: 'ed25519', fetchedAt: 0 };
}

/** Mode F's signature outcome, shared so a question and an analysis cannot drift apart. */
export function fixtureSignature(): SignatureOutcome {
  return {
    algo: 'ed25519',
    verified: false,
    checks: [{ name: 'response_signature', ran: false, passed: false, detail: 'Fixture data is not signed by an enclave.' }],
  };
}

/**
 * The one door every failure leaves by, for either kind of run.
 *
 * Shared because the two runs must report the *same* product fact in the same words: a
 * question whose answer arrived as prose and a transcript that came back unreadable are both
 * "the service returned something Sightline could not read", and if each run mapped its own
 * errors, one of them would start calling it `unknown` and the user would be told nothing had
 * gone specifically wrong.
 */
export function haltFrom(cause: unknown): never {
  if (cause instanceof RunHalt) throw cause;
  if (cause instanceof NearError) throw new RunHalt(cause.error);
  // `JSON.parse` throws a SyntaxError on prose. That is the same product fact as a schema
  // rejection — the answer did not arrive in the shape we asked for — and mapping it to
  // `unknown` would hide the reason from the error catalogue. P-08 splits this again into
  // `model_refused` vs truncated output; until then both are unusable, fail closed.
  if (cause instanceof z.ZodError || cause instanceof SyntaxError) throw new RunHalt(appError('invalid_model_output'));
  throw new RunHalt(appError('unknown'));
}
