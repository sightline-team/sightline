'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { TrustReceipt } from '@/features/trust/TrustReceipt';
import { planFactList } from '@/features/analysis/facts';
import { appLimitationNotices, safetyNotices } from '@/features/safety/notices';
import { useSessionStore } from '@/lib/session/store';
import type { DocType, KeyFact, Transcript } from '@/types';

/**
 * `ResultsView` — item **P-04**.
 *
 * Section order is fixed by AGENTS.md §8 and is what a screen-reader user navigates by
 * position: Summary → Key facts → Actions → Warnings → Full text → Ask → Trust receipt. The
 * order is asserted by an e2e test (`tests/e2e/flow.spec.ts`) so a later refactor cannot
 * quietly move the receipt above the answer.
 *
 * The Ask section arrives as a **slot** from `app/read/page.tsx`, which composes the two
 * features (P-06). This file does not import the qa feature — the order stays owned here, and
 * the question-answering plumbing stays owned there, with the route as the only place that
 * knows both (AGENTS.md §7: avoid features importing each other). The read-aloud control (P-09)
 * arrives the same way, for the same reason: what it speaks comes from the reading *and* from
 * `features/safety`, so `app/_flow/ReadAloud.tsx` joins them and this file only places the result.
 *
 * Three rules this file is written against:
 *  - a fact whose `quoteFound` is false is shown **flagged**, never as sourced (rule 8);
 *  - no privacy sentence is written here (rule 1) — the claim comes from `claims.ts` through
 *    `TrustReceipt`, computed from the record the pipeline emitted;
 *  - the fact list a person hears is a **decided size** (P-16): `analysis/facts.ts` says how many and
 *    which, this file only renders what it is given and states the count out loud.
 */

const DOC_TYPE_WORDS: Record<DocType, string> = {
  bill: 'a bill or invoice',
  bank: 'a bank letter or statement',
  medical: 'a letter about health',
  prescription: 'a prescription or medicine letter',
  legal: 'a legal document',
  government: 'a document from a public authority',
  other: 'a document Sightline could not classify',
};

export function ResultsView({ ask, speak }: { ask: ReactNode; speak: ReactNode }) {
  const { session } = useSessionStore();
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const analysis = session.analysis;

  // §8: focus moves to the new view's heading after navigation, so the reader starts at the
  // answer rather than at the top of the page again. Only when there is a view to land on —
  // which after P-08 includes the transcript-only screen, where the heading is the answer's
  // replacement and the notice below it is the first thing to be read.
  useEffect(() => {
    if (analysis !== undefined || session.degraded !== undefined) headingRef.current?.focus();
  }, [analysis, session.degraded]);

  // P-10, and deliberately a second effect: Forget empties this screen while the user is
  // standing on it, and §8 forbids the silent version, so focus goes to the heading that now
  // says nothing has been read. It cannot live in the effect above — a refused question changes
  // `status` too, and an effect that re-focused the heading on every status change would pull
  // focus away from the failure summary A-06 puts it on.
  useEffect(() => {
    if (session.status === 'forgotten') headingRef.current?.focus();
  }, [session.status]);

  if (analysis === undefined && session.degraded !== undefined) {
    // ARCH §13's "then show transcript only" (P-08). The reading is missing, so the sections
    // that would contain it are *absent* rather than empty: an empty "Key facts" heading over
    // nothing would read as "this document has no facts", which is a claim about the document
    // and not about the failed reading. What stays is everything that does not need a reading:
    // the words themselves, Sightline's own limits, the question box, and the receipt showing
    // which checks ran.
    //
    // There is deliberately **no** read-aloud control here (the decision item **P-11** was asked to
    // make with the screen in front of it, and `ReadAloud.tsx` already returns `null` without an
    // analysis). P-09 speaks the summary and our cautions, and this screen has only the second of
    // those; the remaining content is the full text, which P-09 ruled out for every screen because it
    // belongs to the reader or magnifier the person is already running — "the audio cannot read over
    // the screen reader" is the same reason on both. A button that spoke one sentence about English
    // only, over a letter the person can read for themselves, would be a control whose output the
    // page already shows two lines above it.
    const degraded = session.degraded;
    return (
      <>
        <h1 ref={headingRef} tabIndex={-1} data-testid="results-heading">
          What Sightline read
        </h1>
        <div data-testid="degraded-notice">
          <h2>No summary</h2>
          <p>{degraded.userMessage}</p>
          <p>Sightline has the words but could not turn them into an answer, so there is nothing to summarise yet. Below is the text exactly as it was given.</p>
          {/* P-11: the cautions about Sightline itself, on the screen with no reading. They are true
              of a run that produced nothing, and this is the moment a person is least equipped to
              discover the limits by trying. The content notices stay absent — they fire on fields of a
              reading, and inventing one from a failed reading is what §4 rule 10 forbids. */}
          <ul data-testid="safety-notices">
            {appLimitationNotices().map((notice) => (
              <li key={notice.id}>{notice.text}</li>
            ))}
          </ul>
          {degraded.retryable ? <p className="muted">You can try again.</p> : null}
        </div>

        <TranscriptSection transcript={session.transcript} />

        {ask}

        <TrustReceipt records={session.trust} />
      </>
    );
  }

  if (analysis === undefined) {
    // The screen a user is left on after Forget (P-10) if they pressed it here: the heading is
    // the same one, so the announcement and the focus move land somewhere they already know.
    return (
      <>
        <h1 ref={headingRef} tabIndex={-1} data-testid="results-heading">
          What Sightline read
        </h1>
        <p data-testid="nothing-read">Nothing has been read yet.</p>
        <p>
          <Link href="/">Add a document</Link>
        </p>
      </>
    );
  }

  const transcript = session.transcript;
  const facts = analysis.facts;
  // P-16: a long list is collapsed by kind, never cut off at the end. `planFactList` leaves a short
  // list untouched, so this is invisible in the normal case.
  const { shown, held } = planFactList(facts);
  const ungrounded = facts.filter((fact) => !fact.quoteFound);

  return (
    <>
      <h1 ref={headingRef} tabIndex={-1} data-testid="results-heading">
        What Sightline read
      </h1>
      <p className="muted">Sightline thinks this is {DOC_TYPE_WORDS[analysis.docType]}.</p>
      {/* P-09: an action on the screen, not a section of it — it sits above the first heading so the
          fixed order below is untouched. The route composes it (app/read/page.tsx) because the words
          it speaks come from two features. */}
      {speak}
      <p>
        <a href="#full-text">Skip to full text</a>
      </p>

      <section aria-labelledby="summary-heading">
        <h2 id="summary-heading">Summary</h2>
        <p>{analysis.summary}</p>
        {analysis.sender !== undefined ? <p className="muted">It appears to be from {analysis.sender}.</p> : null}
      </section>

      <section aria-labelledby="facts-heading">
        <h2 id="facts-heading">Key facts</h2>
        {facts.length === 0 ? (
          <p>Sightline found no facts it could name in this text.</p>
        ) : (
          <>
            {held.length > 0 ? (
              <p data-testid="fact-count">
                Sightline found {facts.length} facts. That is too many to read one by one, so{' '}
                {shown.length} are listed here and the other {held.length} are behind the “Show the other{' '}
                {held.length} facts” control at the end of this list.
              </p>
            ) : null}
            <dl className="fact-list">
              {shown.map((fact, index) => (
                <Fact key={`${fact.label}-${index}`} fact={fact} />
              ))}
            </dl>
            {held.length > 0 ? (
              <details data-testid="more-facts">
                <summary>Show the other {held.length} facts</summary>
                <dl className="fact-list">
                  {held.map((fact, index) => (
                    <Fact key={`${fact.label}-rest-${index}`} fact={fact} />
                  ))}
                </dl>
              </details>
            ) : null}
          </>
        )}
        {ungrounded.length > 0 ? (
          <p data-testid="ungrounded-count">
            {ungrounded.length === 1 ? 'One fact above' : `${ungrounded.length} facts above`} could not be
            matched to the words Sightline was given. Treat those with care.
          </p>
        ) : null}
      </section>

      <section aria-labelledby="actions-heading">
        <h2 id="actions-heading">What you may need to do</h2>
        {analysis.actions.length === 0 ? (
          <p>No action was named.</p>
        ) : (
          <ol>
            {analysis.actions.map((action, index) => (
              <li key={`${action.text}-${index}`}>
                {action.text}
                {action.deadline !== undefined ? <span className="muted"> — by {action.deadline}</span> : null}
                {action.quoteFound ? null : <span className="flag">Not matched to the text</span>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section aria-labelledby="warnings-heading">
        <h2 id="warnings-heading">Warnings</h2>
        {/* P-07: our own cautions, in a separate list from the model's because the two may disagree. */}
        <ul data-testid="safety-notices">
          {safetyNotices(analysis).map((notice) => (
            <li key={notice.id}>{notice.text}</li>
          ))}
        </ul>
        <h3>What the reading flagged</h3>
        {analysis.warnings.length === 0 ? (
          <p>The reading did not flag anything of its own.</p>
        ) : (
          <ul data-testid="model-warnings">
            {analysis.warnings.map((warning, index) => (
              <li key={`${warning.text}-${index}`}>{warning.text}</li>
            ))}
          </ul>
        )}
      </section>

      <TranscriptSection transcript={transcript} />

      {ask}

      <TrustReceipt records={session.trust} />
    </>
  );
}

function TranscriptSection({ transcript }: { transcript: Transcript | undefined }) {
  return (
    <section aria-labelledby="full-text">
      <h2 id="full-text">Full text</h2>
      {transcript === undefined ? (
        <p>The text you gave is not in this session any more.</p>
      ) : (
        <p className="transcript">{transcript.text}</p>
      )}
    </section>
  );
}

function Fact({ fact }: { fact: KeyFact }) {
  return (
    <>
      <dt>{fact.label}</dt>
      <dd>
        <span className="fact-value">{fact.value}</span>
        {fact.quoteFound ? (
          <span className="muted"> — quoted from the text: “{fact.sourceQuote}”</span>
        ) : (
          <span className="flag" data-testid="fact-flagged">
            — Sightline could not find these words in the text it was given
          </span>
        )}
      </dd>
    </>
  );
}
