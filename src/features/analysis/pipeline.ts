import { notBuilt } from '@/lib/not_built';
import type { Analysis, Session, Transcript } from '@/types';

/**
 * The two-step pipeline (item **P-03**, flow `docs/ARCHITECTURE.md` §5).
 *
 * Order is a rule, not a preference: verify attestation → transcribe (one request per
 * page) → fetch and check that response's signature → structure the transcript → ground
 * the quotes → ready. Nothing document-derived is sent before the required checks pass
 * (AGENTS.md §4 rule 6), and every step appends a `TrustRecord`.
 *
 * Failure behaviour lives in ARCH §13 and is routed through `lib/errors.ts`: truncated
 * output splits by page, invalid JSON gets one repair retry then transcript only, a
 * refusal is shown plainly with the paste-text path offered.
 */
export interface PipelineDeps {
  session: Session;
  signal: AbortSignal;
  onTranscript: (transcript: Transcript) => void;
  onAnalysis: (analysis: Analysis) => void;
}

export function runPipeline(_deps: PipelineDeps): Promise<void> {
  return notBuilt('P-03', 'The analysis pipeline') as never;
}
