'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { createFixtureClient, transportFor, FIXTURE_MODEL } from '@/lib/fixtures/replay';
import { readPages } from '@/features/capture/read_pages';
import { checkPageLabels, pageLabelSummary } from '@/features/capture/page-labels';
import { runPipeline } from '@/features/analysis/pipeline';
import { RunHalt } from '@/lib/near-ai/verification';
import { LIVE_MODE_UNAVAILABLE, refusedGate, refusedSignatureVerifier } from '@/app/_flow/refused_steps';
import { liveWrites } from '@/app/_flow/live_writes';
import { captureIssueSummary } from '@/lib/errors';
import { missingPagesAnnouncement } from '@/lib/transcript/holes';
import { useSessionStore } from '@/lib/session/store';
import { useAnnouncer } from '@/lib/a11y/announcer';
import type { RunOutcome } from '@/app/_flow/useDocumentRun';
import type { AppError } from '@/types';

/**
 * The composition root for a photographed document (item **C-02**), the sibling of
 * `useDocumentRun`: same shape, same collaborators, same rules about Forget and about speech.
 *
 * This is the first caller of both `features/capture/read_pages.ts` (which joins the photographs with
 * C-11's assembler) and `features/capture/page-labels.ts` (C-05's check). The order below is the
 * order `docs/ARCHITECTURE_ESSENTIALS.md` §Pipeline gives them, and the reason for it is money and
 * waiting rather than tidiness: a page takes ≈26 s and a reading takes ≈2 minutes
 * (`docs/SPIKE_RESULTS.md` §4), so a photograph that looks like a duplicate, or a missing page in the
 * middle of the document, has to reach the person **before** the structure step is paid for.
 *
 * **Live modes refuse at the door**, the same sentence as the paste run (`refused_steps.ts`), and for
 * the same reason: what is missing is a service B-12 can reach, not a check. Demo mode is the mode
 * that gets further, and today it stops one step later — `transcribePage` has no authored page reply
 * for an image body, so a photographed document raises `no_fixture_for_input` and this hook announces
 * it. **S-11** records the real page fixtures that make that path complete; until then nothing after
 * the page loop is reachable from a browser, which is why the loop itself is tested as a pure function
 * (`tests/unit/read-pages.test.ts`) instead of the branches below being asserted on a screen they
 * cannot reach.
 *
 * `verification_passed` is deliberately **not** dispatched. It exists in the reducer to move the
 * status to `transcribing`, and the status is not what the person hears — progress here is the
 * per-page announcement — while the name would report a check that this build has not run (mode F's
 * gate is recorded `not_run`, and AGENTS.md §4 rule 5 forbids showing a check as passed when it is
 * not). The action stays for the run that can honestly dispatch it.
 */
export function usePhotoRun(): () => Promise<RunOutcome> {
  const { session, dispatch, beginRun, endRun } = useSessionStore();
  const announce = useAnnouncer().announce;
  const router = useRouter();

  return useCallback(
    async (): Promise<RunOutcome> => {
      if (transportFor(session.mode) === 'network') {
        dispatch({ type: 'failed', code: LIVE_MODE_UNAVAILABLE.code });
        announce(LIVE_MODE_UNAVAILABLE.userMessage);
        return { ok: false };
      }

      // The screen disables the button for this (C-02), so this is the fail-closed backstop and the
      // sentence is spoken, not shown as a code.
      if (session.pages.length === 0) {
        announce('There are no photographs to read yet.');
        return { ok: false };
      }

      const controller = beginRun();
      // P-12: every write this run makes goes through the signal, not only its last one.
      const dispatchLive = liveWrites(controller.signal, dispatch);

      dispatch({ type: 'input_selected', input: 'images' });
      dispatch({ type: 'analysis_started' });

      // Set when the reading could not be made, so the run still shows the transcript it did read
      // (P-08) and says which of the two sentences the person is hearing.
      let degraded: AppError | undefined;

      try {
        const assembled = await readPages(session.pages, {
          mode: session.mode,
          // Named in the receipt; it is not a TEE model and does not claim to be one. A live photo run
          // names `STEP_PLANS.transcribe.model` instead (ADR-24) when B-12 lets it reach a service.
          model: FIXTURE_MODEL,
          transport: createFixtureClient(),
          gate: refusedGate,
          verifySignature: refusedSignatureVerifier,
          signal: controller.signal,
          onTrustRecord: (record) => dispatchLive({ type: 'trust_recorded', record }),
          // §12's cadence is per page rather than per tick: a page is ≈26 s, so this is about one
          // sentence every 26 s, which is what the accessibility rule asks for.
          onPageStarted: (page, pageCount) => announce(`Reading photograph ${page + 1} of ${pageCount}.`),
        });

        // Forget (P-10) aborts a run that is still going, and a page that answered after it belongs to
        // a session that no longer exists. `useDocumentRun` holds the same rule.
        if (controller.signal.aborted) return { ok: false };

        // Nothing readable in any photograph: there is no document to summarise and no transcript to
        // show, so the run stops here rather than sending our own hole markers to a model (C-11's
        // `usable`). ADR-27's in-place marker still leaves a *readable* document, so this is only the
        // all-pages-failed case.
        if (!assembled.usable) {
          dispatch({ type: 'failed', code: 'illegible_content' });
          announce('Sightline could not read any of these photographs, so there is nothing to summarise. Try one page at a time in better light.');
          return { ok: false };
        }

        // Everything the person is owed *before* the structure step is paid for, spoken as ONE
        // announcement. The reason is the announcer's shape, not style: `announce()` is `setMessage`,
        // one message at a time, and two calls in the same React batch leave only the last in the live
        // region — measured in C-12's e2e work, where an intermediate sentence never appeared. Four
        // separate notices would have silently dropped three of them.
        //
        // They come before `runPipeline` because a page is $0.00087 and a reading $0.0044 (SPIKE §4),
        // and a notice that arrives after four minutes of waiting is not a notice. The order below is
        // what changes most about the answer: a photograph that contributed nothing, then the paper's
        // own page numbers disagreeing (C-05 — silence is the expected result for a good set, ADR-28),
        // then a mark the joiner could not place, then the model's complaints about the photographs.
        const notices: string[] = [];
        const missing = assembled.transcript.missingPages ?? [];
        if (missing.length > 0) notices.push(missingPagesAnnouncement(missing));

        const labels = checkPageLabels(assembled.transcript);
        if (labels.findings.length > 0) notices.push(pageLabelSummary(labels.findings));

        // C-11 counts a span the model reported at an offset its own page cannot hold. Saying nothing
        // about it would lose the one notice the person is owed about unreadable writing (rule 10). The
        // other three sentences above and below are each their module's; **C-06** owes this one its
        // final plain-language review.
        if (assembled.unplaceableSpans > 0) {
          notices.push(
            `Sightline could not place ${assembled.unplaceableSpans} part${assembled.unplaceableSpans === 1 ? '' : 's'} of the writing it marked as uncertain back onto the page it came from.`,
          );
        }

        // A capture problem does not stop the run here, and C-04 owns whether it should: the measured
        // answer so far — `rotated` on 4 of 11 pages (SPIKE §4), including one drawn at 0.63° — says a
        // run that halted on every reported tilt would stop more often than it finished. So it is
        // announced and the run carries on. The transcript is dispatched once, by the pipeline's own
        // `onTranscript` below, which is what puts the person's words on the full-text screen whether
        // the reading arrives or not (P-08); `needs_retake` is the status that dispatch yields while a
        // capture issue is on record, and `analysis_received` replaces it when the reading lands.
        if (assembled.transcript.captureIssues.length > 0) {
          notices.push(captureIssueSummary(assembled.transcript.captureIssues));
        }

        if (notices.length > 0) announce(notices.join(' '));

        await runPipeline({
          mode: session.mode,
          // The transcript C-11 joined is the one this reading is about (C-02's dep).
          transcript: assembled.transcript,
          // Named in the receipt. Mode F never reaches a service; a live run names
          // `STEP_PLANS.analyse.model` — not the page model — because ADR-24 separated the two on the
          // strength of §4's measurement that the page model answered this request in shape 0 of 6 times.
          model: FIXTURE_MODEL,
          transport: createFixtureClient(),
          gate: refusedGate,
          verifySignature: refusedSignatureVerifier,
          signal: controller.signal,
          onTranscript: (t) => dispatchLive({ type: 'transcript_received', transcript: t }),
          onTrustRecord: (record) => dispatchLive({ type: 'trust_recorded', record }),
          onAnalysis: (analysis) => dispatchLive({ type: 'analysis_received', analysis }),
          onDegraded: (error) => {
            degraded = error;
            dispatchLive({ type: 'run_degraded', code: error.code, context: error.context });
          },
        });

        if (controller.signal.aborted) return { ok: false };

        // Both outcomes navigate: the transcript is on `/read` either way (P-08). What differs is the
        // sentence — a degraded run must not announce "here is what I read".
        announce(
          degraded === undefined
            ? 'Done. Showing what Sightline read.'
            : `${degraded.userMessage} Showing the photographs you gave instead.`,
        );
        router.push('/read');
        return { ok: true };
      } catch (cause) {
        if (cause instanceof RunHalt) {
          // A halt caused by the person pressing Forget is not an error to report on a screen they
          // just cleared, and a page refused after some pages were read still writes nothing.
          if (controller.signal.aborted) return { ok: false };
          dispatch({ type: 'failed', code: cause.error.code, context: cause.error.context });
          announce(cause.error.userMessage);
          return { ok: false };
        }
        throw cause;
      } finally {
        endRun(controller);
      }
    },
    [announce, beginRun, dispatch, endRun, router, session],
  );
}
