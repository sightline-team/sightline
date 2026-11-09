'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Button } from '@/components/Button';
import { StatusMessage } from '@/components/StatusMessage';
import { PageList } from '@/features/capture/PageList';
import { useCapture } from '@/features/capture/useCapture';
import { usePhotoRun, type PhotoProgress } from '@/app/_flow/usePhotoRun';
import { useAnnouncer } from '@/lib/a11y/announcer';
import { useSessionStore } from '@/lib/session/store';
import { MAX_PAGES } from '@/lib/session/reducer';
import { captureIssueSummary } from '@/lib/errors';

/**
 * Photograph a document (item **C-02**). The sibling of `features/paste/PasteView.tsx` (P-05), mounted
 * beside it on `/`.
 *
 * Native HTML first (AGENTS.md §8): a `<label>` + `<input type="file" accept="image/*"
 * capture="environment" multiple>`, so a phone opens its own camera app and a desktop opens its own file
 * picker, and neither needs a custom control to be operable with a screen reader. There is no
 * `getUserMedia` preview stream here — that would be a second camera implementation to permission,
 * render and test, on a browser surface this build has never measured on a phone (**C-07**).
 *
 * No privacy sentence is written in this file (rule 1); the hint below names the *count* and the *order*,
 * which are the two things a person can act on. What happens to the bytes is the receipt's business.
 *
 * **What this screen can reach today, stated plainly because the button invites a wait:** a live mode
 * refuses at the door (B-12), and demo mode refuses at the *first page*, because demo mode has no
 * recorded answer for a photograph (S-11). So in every mode available right now, "Read these
 * photographs" answers in about a second rather than in four minutes. That is the honest behaviour of a
 * build that has never sent a photographed page from this app, and the sentence the person hears is the
 * catalogue's, not a paraphrase written for this screen.
 */
export function CaptureView() {
  const { session } = useSessionStore();
  // P-10's keyed wrapper, the same shape `PasteView` uses: `forgotten` mints a new session id, so the
  // file input and the page list remount empty instead of showing a document that no longer exists.
  return <CaptureForm key={session.id} />;
}

function CaptureForm() {
  const { session } = useSessionStore();
  const capture = useCapture();
  const [progress, setProgress] = useState<PhotoProgress | null>(null);
  const { run, continueAnyway } = usePhotoRun(setProgress);
  const announce = useAnnouncer().announce;
  const [busy, setBusy] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const errorRef = useRef<HTMLDivElement | null>(null);
  const retakeHeadingRef = useRef<HTMLHeadingElement | null>(null);

  // A-06, as on the paste screen: a failure is moved to, not merely spoken.
  useEffect(() => {
    if (session.error !== undefined) errorRef.current?.focus();
  }, [session.error]);

  // C-04 / A-06: focus moves to the retake offer heading when a severe capture issue is reported
  useEffect(() => {
    if (session.status === 'needs_retake') retakeHeadingRef.current?.focus();
  }, [session.status]);

  const pageCount = session.pages.length;

  async function onFiles(event: ChangeEvent<HTMLInputElement>) {
    // Snapshot before the value is cleared: `event.target.files` is a live list that empties with it.
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;
    setBusy(true);
    try {
      await capture.addFiles(files);
    } finally {
      setBusy(false);
    }
  }

  async function onLoadSampleDocument() {
    setLoadingSample(true);
    setBusy(true);
    try {
      if (session.pages.length > 0) {
        capture.clearAll();
      }
      const urls = [
        '/sample-docs/photographs/page-1.jpg',
        '/sample-docs/photographs/page-2.jpg',
        '/sample-docs/photographs/page-3.jpg',
      ];
      const files = await Promise.all(
        urls.map(async (url, idx) => {
          const res = await fetch(url);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          return new File([blob], `page-${idx + 1}.jpg`, { type: 'image/jpeg' });
        }),
      );
      await capture.addFiles(files);
      announce('Sample 3-page document loaded. Choose Read these photographs to continue.');
    } catch {
      announce('Could not load sample photographs. Please choose a file instead.');
    } finally {
      setLoadingSample(false);
      setBusy(false);
    }
  }

  async function onContinueAnyway() {
    setBusy(true);
    try {
      await continueAnyway();
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (session.status === 'needs_retake') {
      await onContinueAnyway();
      return;
    }
    if (pageCount === 0) {
      // The button is disabled for this; the spoken backstop is for a keyboard user who reached it
      // before the disable landed, and for the next person to change the rule.
      announce('There are no photographs to read yet.');
      return;
    }
    setBusy(true);
    try {
      await run();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="capture-heading" data-testid="capture-section">
      <h2 id="capture-heading">Photograph a document</h2>
      <p className="muted" id="capture-hint">
        Up to {MAX_PAGES} photographs, read in the order you add them. Add them as the pages go: there is
        no way to reorder them afterwards, only <em>Retake</em> on the last one and <em>Remove</em> on any
        of them.
      </p>

      <div className="stream-bay">
        <div className="stream-bay-header">
          <span className="stream-title">Photograph input</span>
          <span className="stream-spec">Up to 5 pages</span>
        </div>
        <form onSubmit={onSubmit}>
          <div className="capture-inputs-deck">
            <div className="capture-input-row">
              <p>
                <label htmlFor="capture-files">Add photographs</label>
              </p>
              <p className="muted">
                Upload image files from your device storage, photo gallery, or file manager.
              </p>
              <input
                ref={fileRef}
                id="capture-files"
                name="capture-files"
                type="file"
                accept="image/*"
                multiple
                disabled={busy}
                aria-describedby="capture-hint"
                onChange={onFiles}
              />
            </div>

            <div className="capture-input-row">
              <p>
                <label htmlFor="capture-camera">Take photo with camera</label>
              </p>
              <p className="muted">
                Directly opens your device camera to take photographs of each page.
              </p>
              <input
                ref={cameraRef}
                id="capture-camera"
                name="capture-camera"
                type="file"
                accept="image/*"
                capture="environment"
                multiple
                disabled={busy}
                onChange={onFiles}
              />
            </div>
          </div>

          <div className="capture-demo-row">
            <span className="demo-lead-text">Sample document:</span>
            <Button
              type="button"
              disabled={busy}
              onClick={onLoadSampleDocument}
            >
              {loadingSample ? 'Loading sample…' : 'Load sample document (3 photographs)'}
            </Button>
          </div>

          {pageCount > 0 ? (
            <>
              <p data-testid="capture-count">
                {pageCount} of {MAX_PAGES} photographs added.
              </p>
              <PageList
                pages={session.pages}
                busy={busy}
                onRemove={capture.removePage}
                onRetakeLast={capture.retakeLast}
              />
              <p className="page-actions">
                <Button onClick={capture.clearAll} disabled={busy}>
                  Remove all photographs
                </Button>
              </p>
            </>
          ) : (
            <p className="muted" data-testid="capture-empty">
              No photographs added yet.
            </p>
          )}

          {busy && progress ? (
            <div className="reading-progress-card" role="status" aria-label="Reading progress">
              <div className="progress-header">
                <div className="progress-title-strip">
                  <span className="progress-spinner" aria-hidden="true" />
                  <span className="progress-status-label">{progress.step}</span>
                </div>
                <span className="progress-pct-badge">{progress.percent}%</span>
              </div>
              <div
                className="progress-bar-track"
                role="progressbar"
                aria-valuenow={progress.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Document reading progress"
              >
                <div
                  className="progress-bar-fill"
                  style={{ width: `${progress.percent}%` }}
                />
              </div>
              <div className="progress-stages-grid">
                <span className={`stage-step ${progress.percent >= 10 ? 'is-done' : ''}`}>1. TDX Enclave</span>
                <span className={`stage-step ${progress.percent >= 25 ? 'is-done' : ''}`}>2. Vision OCR</span>
                <span className={`stage-step ${progress.percent >= 70 ? 'is-done' : ''}`}>3. Fact Grounding</span>
                <span className={`stage-step ${progress.percent >= 90 ? 'is-done' : ''}`}>4. Ed25519 Signature</span>
              </div>
              <p className="progress-subtext muted">
                Inference runs inside hardware-isolated Intel TDX CPU memory. Zero server disk persistence.
              </p>
            </div>
          ) : null}

          {/* Retake offer (C-04): pauses before analysis when severe capture issues (cut-off edges, glare,
              blur, etc.) are reported by the vision model. Rotated/handwriting are informational and carry on. */}
          {session.status === 'needs_retake' && session.transcript ? (
            <div className="retake-offer" data-testid="retake-offer" role="region" aria-labelledby="retake-heading">
              <h3 id="retake-heading" tabIndex={-1} ref={retakeHeadingRef}>
                Check before reading
              </h3>
              <p>{captureIssueSummary(session.transcript.captureIssues)}</p>
              <p className="muted">
                Part of the page may be missing. You can retake the photograph, or carry on with what Sightline read.
              </p>
              <p className="retake-actions">
                <Button type="button" onClick={onContinueAnyway} disabled={busy}>
                  {busy ? 'Reading…' : 'Continue anyway'}
                </Button>
              </p>
            </div>
          ) : null}

          <p>
            <Button type="submit" disabled={busy || pageCount === 0 || session.status === 'needs_retake'}>
              {busy ? 'Reading…' : 'Read these photographs'}
            </Button>
          </p>
        </form>
      </div>

      {/* The page has one failure summary, and it is in whichever section ran: `session.input` is set to
          'images' by usePhotoRun before any of its guards, so a photo error surfaces here and a paste
          error stays with #paste-error. Two summaries of one error would be one live region too many,
          and two components fighting for the same focus target (A-06). */}
      {session.error !== undefined && session.input === 'images' ? (
        <StatusMessage error={session.error} id="capture-error" ref={errorRef} />
      ) : null}
    </section>
  );
}
