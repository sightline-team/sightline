import { assembleDocument, type AssembledDocument, type PageOutcome } from '@/features/capture/assemble';
import { transcribePage } from '@/features/capture/transcribe';
import { RunHalt, type AttestationGate, type SignatureVerifier } from '@/lib/near-ai/verification';
import { appError } from '@/lib/errors';
import type { NearClient } from '@/lib/near-ai/client';
import type { Mode, Page, TrustRecord } from '@/types';

/**
 * The photographs become one document (item **C-02**; spec: `docs/ARCHITECTURE.md` §5.1, §9 steps 1
 * and 1b, **ADR-27**).
 *
 * `transcribePage` (C-03) reads a page and `assembleDocument` (C-11) joins the pages, and neither of
 * them knows the other exists. This is the code in between: ask for each page in capture order, keep
 * every answer, hand the whole list to the joiner. It has no React in it and touches no store, so the
 * sequence — which is where this run's rules live — is testable with injected collaborators while
 * **B-12** still means no live mode can finish a photograph.
 *
 * ### Pages run in series, and the reason is measured
 *
 * A page costs **25.8–28.3 s** of model time (`docs/SPIKE_RESULTS.md` §4, C-03's single sample and
 * C-11's five-page mean), so a five-page document is roughly four minutes as this file runs it. Five
 * requests fired together would answer sooner, and were rejected on three grounds: the relay's shared
 * rate limit (F-05) is sized for one person's one page at a time; the `TrustRecord`s would arrive
 * interleaved, so the receipt could no longer list the checks in the order the photographs were taken;
 * and Forget (P-10) would have to abort several in-flight requests instead of the one that is running,
 * each with a page's bytes already in its body.
 *
 * ### What stops the loop
 *  - **A refused page.** §4 rule 6: the service declined to read this document, so there is no honest
 *    reading to assemble from the rest. `PageOutcome` cannot even hold a refusal (C-11), which is why
 *    the halt is raised here rather than handled downstream.
 *  - **A cancelled run.** The signal is checked *between* pages, before the next request is built: a
 *    person who pressed Forget after page 2 must not have pages 3–5 sent and billed. `usePhotoRun`
 *    swallows this halt — it knows the session is gone and writes nothing, the same rule P-12 gives the
 *    paste run.
 *  - **A failed gate or an unverifiable signature** throws `RunHalt` from inside `readCompletion` and
 *    passes straight through this loop. It is not caught here; a page whose checks failed is the run
 *    stopping, not a page with a hole in it.
 *
 * A `truncated` or `unreadable` page does **not** stop the run: it becomes the marked hole ADR-27
 * decided on, in place, with the other pages' words still read.
 */
export interface ReadPagesDeps {
  /** The session's mode. Mode F has no authored page reply and says so (S-11) — the refusal comes from
   * `transcribePage`, not from this loop. */
  mode: Mode;
  /** An allowlisted, image-capable model, chosen by the composition root (ADR-24). Never a
   * user-typed string. */
  model: string;
  transport: NearClient;
  gate: AttestationGate;
  verifySignature: SignatureVerifier;
  signal: AbortSignal;
  onTrustRecord: (record: TrustRecord) => void;
  /**
   * A page is about to be sent, before its request exists. At ≈26 s a page this is the only way the
   * person learns which photograph the wait is for (§12's progress cadence).
   */
  onPageStarted: (page: number, pageCount: number) => void;
}

export async function readPages(pages: readonly Page[], deps: ReadPagesDeps): Promise<AssembledDocument> {
  const outcomes: PageOutcome[] = [];

  for (const [page, record] of pages.entries()) {
    // Checked before the request rather than after: the point of stopping is not sending the next page.
    if (deps.signal.aborted) throw new RunHalt(appError('aborted'));

    deps.onPageStarted(page, pages.length);
    const outcome = await transcribePage(
      {
        mode: deps.mode,
        model: deps.model,
        transport: deps.transport,
        gate: deps.gate,
        verifySignature: deps.verifySignature,
        signal: deps.signal,
        onTrustRecord: deps.onTrustRecord,
        // Present only for a photograph the demo ships (ADR-31); live transports never see it and Mode F
        // refuses a page without it, exactly as it refused every page before this item.
        ...(record.fixtureKey === undefined ? {} : { fixtureKey: record.fixtureKey }),
      },
      record.blob,
    );

    if (outcome.kind === 'refused') throw new RunHalt(outcome.error);
    outcomes.push(outcome);
  }

  return assembleDocument(outcomes);
}
