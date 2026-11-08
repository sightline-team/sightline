'use client';

import { useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { readPages } from '@/features/capture/read_pages';
import { checkPageLabels, pageLabelSummary } from '@/features/capture/page-labels';
import { runPipeline } from '@/features/analysis/pipeline';
import { RunHalt } from '@/lib/near-ai/verification';
import { DIRECT_MODE_UNAVAILABLE } from '@/app/_flow/refused_steps';
import { collaboratorsFor, modelFor } from '@/app/_flow/collaborators';
import { liveWrites } from '@/app/_flow/live_writes';
import { captureIssueSummary, requiresRetake } from '@/lib/errors';
import { missingPagesAnnouncement } from '@/lib/transcript/holes';
import { useSessionStore } from '@/lib/session/store';
import { useAnnouncer } from '@/lib/a11y/announcer';
import { createProgressTicker } from '@/lib/a11y/progress';
import { createWakeLockManager } from '@/lib/a11y/wake_lock';
import { appError } from '@/lib/errors';
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
 * **Mode A refuses at the door**, the same sentence as the paste run (`refused_steps.ts`, item
 * **T-13**), and for the same reason: what is missing is a key the browser could send. Mode B runs
 * for real, and a photo run is the one that shows why the wiring is a *session* rather than a call:
 * `STEP_PLANS.transcribe` and `STEP_PLANS.analyse` are two models (**ADR-24**) and **T-08** measured
 * them as two enclaves with two keys, so the gate attests each one before that step's request is
 * built, and each step's signature is checked against its own key. Mode F gets all the way through
 * too: **S-11** recorded the three photographs this demo ships, so a run started from those files
 * reaches the page loop, the structure step and the Ask section in a browser with no key (**C-13**,
 * `tests/e2e/photo-fixtures.spec.ts`), while any other photograph is refused at the first page
 * (`no_fixture_for_page`) instead of being answered with somebody else's transcription. The loop is
 * *also* tested as a pure function (`tests/unit/read-pages.test.ts`), because a screen can only show the
 * one page order the browser happens to run in.
 *
 * `verification_passed` is deliberately **not** dispatched. It exists in the reducer to move the
 * status to `transcribing`, and the status is not what the person hears — progress here is the
 * per-page announcement — while the name would report a check that this build has not run (the gate's
 * strongest live answer is still `partial` while **B-12** is open, and AGENTS.md §4 rule 5 forbids
 * showing a check as passed when it is not). The action stays for the run that can honestly dispatch it.
 */
export type PhotoRun = (() => Promise<RunOutcome>) & {
  run: () => Promise<RunOutcome>;
  continueAnyway: () => Promise<RunOutcome>;
};

export function usePhotoRun(): PhotoRun {
  const { session, dispatch, beginRun, endRun } = useSessionStore();
  const announce = useAnnouncer().announce;
  const router = useRouter();

  const continueAnyway = useCallback(async (): Promise<RunOutcome> => {
    if (!session.transcript) return { ok: false };

    dispatch({ type: 'retake_continued' });
    const { transport, gate, verifySignature } = collaboratorsFor(session);
    const controller = beginRun();
    const dispatchLive = liveWrites(controller.signal, dispatch);
    let degraded: AppError | undefined;
    let backgrounded = false;
    const progressTicker = createProgressTicker(announce);
    const wakeLock = createWakeLockManager();

    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        backgrounded = true;
        controller.abort();
      }
    };

    try {
      void wakeLock.acquire();
      progressTicker.start();
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', onVisibilityChange);
      }

      announce('Continuing with what Sightline read.');
      await runPipeline({
        mode: session.mode,
        transcript: session.transcript,
        model: modelFor(session.mode, 'analyse'),
        transport,
        gate,
        verifySignature,
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

      announce(
        degraded === undefined
          ? 'Done. Showing what Sightline read.'
          : `${degraded.userMessage} Showing the photographs you gave instead.`,
      );
      router.push('/read');
      return { ok: true };
    } catch (cause) {
      if (backgrounded) {
        const error = appError('aborted');
        dispatch({ type: 'failed', code: error.code });
        announce(error.userMessage);
        return { ok: false };
      }
      if (cause instanceof RunHalt) {
        if (controller.signal.aborted) return { ok: false };
        dispatch({ type: 'failed', code: cause.error.code, context: cause.error.context });
        announce(cause.error.userMessage);
        return { ok: false };
      }
      if (controller.signal.aborted) return { ok: false };
      throw cause;
    } finally {
      progressTicker.stop();
      void wakeLock.release();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      endRun(controller);
    }
  }, [announce, beginRun, dispatch, endRun, router, session]);

  const run = useCallback(
    async (): Promise<RunOutcome> => {
      // Which input the person is using is recorded **before** anything can refuse, because the failure
      // summary on this screen is shown by the section that owns the run (`CaptureView` when `input` is
      // `'images'`, `PasteView` when it is `'text'`). A refusal that left the field at its previous value
      // would put a photograph's error in the paste section and steal its focus target.
      dispatch({ type: 'input_selected', input: 'images' });

      if (session.mode === 'direct') {
        dispatch({ type: 'failed', code: DIRECT_MODE_UNAVAILABLE.code });
        announce(DIRECT_MODE_UNAVAILABLE.userMessage);
        return { ok: false };
      }

      // The screen disables the button for this (C-02), so this is the fail-closed backstop and the
      // sentence is spoken, not shown as a code.
      if (session.pages.length === 0) {
        announce('There are no photographs to read yet.');
        return { ok: false };
      }

      const { transport, gate, verifySignature } = collaboratorsFor(session);
      const controller = beginRun();
      // P-12: every write this run makes goes through the signal, not only its last one.
      const dispatchLive = liveWrites(controller.signal, dispatch);

      dispatch({ type: 'analysis_started' });

      // Set when the reading could not be made, so the run still shows the transcript it did read
      // (P-08) and says which of the two sentences the person is hearing.
      let degraded: AppError | undefined;
      let backgrounded = false;
      const progressTicker = createProgressTicker(announce);
      const wakeLock = createWakeLockManager();

      const onVisibilityChange = () => {
        if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
          backgrounded = true;
          controller.abort();
        }
      };

      try {
        void wakeLock.acquire();
        progressTicker.start();
        if (typeof document !== 'undefined') {
          document.addEventListener('visibilitychange', onVisibilityChange);
        }

        const assembled = await readPages(session.pages, {
          mode: session.mode,
          // The page model for a live run, the fixture's own name for Mode F (`modelFor`, ADR-24). It is
          // named in the receipt, and a receipt that named the summarising model here would describe a
          // call this step never made.
          model: modelFor(session.mode, 'transcribe'),
          transport,
          gate,
          verifySignature,
          signal: controller.signal,
          onTrustRecord: (record) => dispatchLive({ type: 'trust_recorded', record }),
          // §12's cadence is per page rather than per tick: a page is ≈26 s, so this is about one
          // sentence every 26 s, which is what the accessibility rule asks for.
          onPageStarted: (page, pageCount) => {
            announce(`Reading photograph ${page + 1} of ${pageCount}.`);
            progressTicker.reset();
          },
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

        // Severe capture issues pause the run at needs_retake before analysis time and budget are spent (C-04).
        // Rotated (measured on 6 of 14 live pages at 0.63° tilt) and handwriting are informational and carry on.
        const hasSevereIssue = requiresRetake(assembled.transcript.captureIssues);

        if (assembled.transcript.captureIssues.length > 0) {
          notices.push(captureIssueSummary(assembled.transcript.captureIssues));
        }

        if (hasSevereIssue) {
          notices.push('Retake the photograph, or carry on with what you have.');
          dispatchLive({ type: 'transcript_received', transcript: assembled.transcript });
          announce(notices.join(' '));
          return { ok: false };
        }

        if (notices.length > 0) announce(notices.join(' '));

        await runPipeline({
          mode: session.mode,
          // The transcript C-11 joined is the one this reading is about (C-02's dep).
          transcript: assembled.transcript,
          // `STEP_PLANS.analyse` for a live run — not the page model — because ADR-24 separated the two
          // on the strength of §4's measurement that the page model answered this request in shape 0 of 6
          // times. It is a second model in the same session, so the gate attests it separately.
          model: modelFor(session.mode, 'analyse'),
          transport,
          gate,
          verifySignature,
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
        if (backgrounded) {
          const error = appError('aborted');
          dispatch({ type: 'failed', code: error.code });
          announce(error.userMessage);
          return { ok: false };
        }
        if (cause instanceof RunHalt) {
          // A halt caused by the person pressing Forget is not an error to report on a screen they
          // just cleared, and a page refused after some pages were read still writes nothing.
          if (controller.signal.aborted) return { ok: false };
          dispatch({ type: 'failed', code: cause.error.code, context: cause.error.context });
          announce(cause.error.userMessage);
          return { ok: false };
        }
        if (controller.signal.aborted) return { ok: false };
        throw cause;
      } finally {
        progressTicker.stop();
        void wakeLock.release();
        if (typeof document !== 'undefined') {
          document.removeEventListener('visibilitychange', onVisibilityChange);
        }
        endRun(controller);
      }
    },
    [announce, beginRun, dispatch, endRun, router, session],
  );

  return Object.assign(run, { run, continueAnyway });
}
