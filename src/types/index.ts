/**
 * Domain types. These mirror `docs/ARCHITECTURE.md` §7 exactly — if the two
 * disagree, one of them is wrong and must be fixed in the same commit.
 *
 * Everything here is in-memory only. Nothing in this file is ever persisted
 * except `Settings` (localStorage) and a Mode A API key (sessionStorage).
 */

export type ID = string;

/** The three run modes (`docs/ARCHITECTURE.md` §4). Owned here so config and state cannot drift. */
export type Mode = 'relay' | 'direct' | 'fixtures';

export type InputKind = 'images' | 'text';

export type SessionStatus =
  | 'idle'
  | 'preparing'
  | 'verifying'
  | 'transcribing'
  | 'needs_retake'
  | 'analysing'
  | 'ready'
  | 'error'
  | 'forgotten';

export interface Session {
  id: ID;
  createdAt: number;
  mode: Mode;
  input: InputKind;
  /** Capture order, 0..MAX_PAGES-1 (empty when input is 'text'). */
  pages: Page[];
  transcript?: Transcript;
  analysis?: Analysis;
  qa: QAEntry[];
  trust: TrustRecord[];
  status: SessionStatus;
  error?: AppError;
  /**
   * The run finished, but it has no answer to show (item **P-08**, `docs/ARCHITECTURE.md` §13:
   * "invalid JSON → one repair retry, then show transcript only"). Distinct from `error`, which
   * says a step *stopped*: here `status` is `ready`, the transcript is real and stays on screen,
   * and what is missing is the reading of it. A second field rather than a reused `error`
   * because `error` is cleared by the next successful step and describes the last thing the user
   * tried, while this describes the state of the results view itself.
   */
  degraded?: AppError;
}

export interface Page {
  id: ID;
  index: number;
  /** JPEG, EXIF stripped (`lib/image/prepare.ts`). */
  blob: Blob;
  width: number;
  height: number;
}

/**
 * Reported by the model, not measured locally (ADR-10): local blur and
 * brightness metrics misfire on text pages.
 */
export type CaptureIssue =
  | 'cut_off_top'
  | 'cut_off_bottom'
  | 'cut_off_left'
  | 'cut_off_right'
  | 'rotated'
  | 'glare'
  | 'too_small_text'
  | 'blurry'
  | 'not_a_document'
  | 'handwriting_present';

export interface UncertainSpan {
  start: number;
  end: number;
  reason: 'illegible' | 'low_contrast' | 'cropped';
}

export interface Transcript {
  /** Verbatim; tables rendered row by row. */
  text: string;
  /** Character offset where each page's text starts. */
  pageOffsets: number[];
  uncertain: UncertainSpan[];
  captureIssues: { page: number; issue: CaptureIssue }[];
  /** e.g. "Page 2 of 3", used only to warn on gaps and duplicates — never to reorder silently. */
  pageNumbersSeen?: { page: number; label: string }[];
}

export type FactKind =
  | 'date'
  | 'amount'
  | 'phone'
  | 'reference'
  | 'medication'
  | 'dose'
  | 'address'
  | 'other';

export interface KeyFact {
  kind: FactKind;
  label: string;
  value: string;
  /** Must be a literal excerpt of the transcript. */
  sourceQuote: string;
  /** Set by `analysis/grounding.ts`, never by the model (AGENTS.md §4 rule 8). */
  quoteFound: boolean;
  numbersRechecked?: 'agree' | 'disagree' | 'not_run';
}

export type DocType = 'bill' | 'bank' | 'medical' | 'prescription' | 'legal' | 'government' | 'other';

export interface Analysis {
  docType: DocType;
  sender?: string;
  summary: string;
  facts: KeyFact[];
  actions: { text: string; deadline?: string; sourceQuote: string; quoteFound: boolean }[];
  warnings: { kind: 'medical' | 'legal' | 'financial' | 'unreadable' | 'urgency'; text: string }[];
  model: string;
}

export interface QAEntry {
  id: ID;
  question: string;
  answer: string;
  notInDocument: boolean;
  sourceQuote?: string;
  quoteFound?: boolean;
  askedAt: number;
}

export interface CheckResult {
  name: string;
  passed: boolean;
  ran: boolean;
  detail?: string;
}

export type TrustPurpose = 'transcribe' | 'analyse' | 'qa';

/**
 * `not_run` is Mode F: no service was called, so there was nothing to attest. Recording
 * that as `failed` would be a claim about a check that never happened; `claimFor` gives it
 * no rung either way, and the demo-data banner is what the user is told (AGENTS.md §4 rule 11).
 */
export type AttestationStatus = 'verified' | 'partial' | 'failed' | 'not_run';

/**
 * `partial` is never displayed as "verified" (AGENTS.md §4 rule 5), and `claim`
 * — not prose in a component — decides the sentence the user sees (rule 1).
 */
export interface TrustRecord {
  id: ID;
  purpose: TrustPurpose;
  model: string;
  endpoint: 'direct' | 'gateway' | 'relay' | 'fixtures';
  requestId: string;
  /** Request encrypted to the attested key? See ADR-16 — this is the strong claim. */
  e2ee: boolean;
  attestation: {
    nonce: string;
    fetchedAt: number;
    checks: CheckResult[];
    status: AttestationStatus;
  };
  signature: { algo: 'ecdsa' | 'ed25519'; verified: boolean };
  claim: 'e2ee_enclave' | 'attested_model_signed_responses' | 'partial' | 'fixtures';
}

export type ErrorCode =
  | 'verification_failed'
  | 'verification_unreachable'
  | 'attestation_changed'
  | 'signature_invalid'
  | 'model_unavailable'
  | 'capture_issue'
  | 'too_many_pages'
  | 'image_too_large'
  | 'not_a_document'
  | 'illegible_content'
  | 'output_truncated'
  | 'model_refused'
  | 'invalid_model_output'
  | 'network_lost'
  | 'aborted'
  | 'rate_limited'
  | 'relay_disabled'
  | 'unsupported_language'
  | 'no_fixture_for_input'
  | 'no_fixture_for_question'
  | 'unknown';

/**
 * Plain language a screen reader can read aloud. Note what is *absent* by
 * design: no privacy assertion lives here. A message such as "nothing was
 * sent" describes a data-flow guarantee and therefore belongs in
 * `features/trust/claims.ts`, computed from a `TrustRecord` (AGENTS.md §4 rule 1).
 */
export interface AppError {
  code: ErrorCode;
  userMessage: string;
  retryable: boolean;
  /** Which page or step the failure relates to, when known. Never document content. */
  context?: { page?: number };
}

/**
 * What the app keeps after the tab closes. `lib/settings.ts` is the only reader and writer, and its
 * `StoredSettings` is the as-built shape of this interface — one validated JSON blob under
 * `sightline.settings`, both fields defaulted, unknown siblings stripped.
 *
 * `mode` was here until **A-15** decided the page must not hold it (ADR-21): the mode picks the
 * privacy sentence shown beside a result, so it is computed from the environment and what the
 * deployment can honour (`lib/config.ts`, failing closed) rather than chosen in a browser.
 */
export interface Settings {
  /** 0.5..2. Read again on every press, so a change needs no reload. */
  speechRate: number;
  /** Opt-in only: the default colours are the AA ones, so a theme nobody asked for is not applied. */
  highContrast: boolean;
}
