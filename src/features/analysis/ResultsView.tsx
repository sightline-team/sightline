'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
import { TrustReceipt } from '@/features/trust/TrustReceipt';
import { useSessionStore } from '@/lib/session/store';
import type { DocType, KeyFact } from '@/types';

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
 * knows both (AGENTS.md §7: avoid features importing each other).
 *
 * Two rules this file is written against:
 *  - a fact whose `quoteFound` is false is shown **flagged**, never as sourced (rule 8);
 *  - no privacy sentence is written here (rule 1) — the claim comes from `claims.ts` through
 *    `TrustReceipt`, computed from the record the pipeline emitted.
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

export function ResultsView({ ask }: { ask: ReactNode }) {
  const { session } = useSessionStore();
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const analysis = session.analysis;

  // §8: focus moves to the new view's heading after navigation, so the reader starts at the
  // answer rather than at the top of the page again. Only when there is an answer to land on.
  useEffect(() => {
    if (analysis !== undefined) headingRef.current?.focus();
  }, [analysis]);

  if (analysis === undefined) {
    return (
      <>
        <h1>What Sightline read</h1>
        <p>Nothing has been read yet.</p>
        <p>
          <Link href="/">Add a document</Link>
        </p>
      </>
    );
  }

  const transcript = session.transcript;
  const facts = analysis.facts;
  const ungrounded = facts.filter((fact) => !fact.quoteFound);

  return (
    <>
      <h1 ref={headingRef} tabIndex={-1} data-testid="results-heading">
        What Sightline read
      </h1>
      <p className="muted">Sightline thinks this is {DOC_TYPE_WORDS[analysis.docType]}.</p>
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
          <dl className="fact-list">
            {facts.map((fact, index) => (
              <Fact key={`${fact.label}-${index}`} fact={fact} />
            ))}
          </dl>
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
        {analysis.warnings.length === 0 ? (
          <p>Nothing here needs a warning.</p>
        ) : (
          <ul>
            {analysis.warnings.map((warning, index) => (
              <li key={`${warning.text}-${index}`}>{warning.text}</li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="full-text">
        <h2 id="full-text">Full text</h2>
        {transcript === undefined ? (
          <p>The text you gave is not in this session any more.</p>
        ) : (
          <p className="transcript">{transcript.text}</p>
        )}
      </section>

      {ask}

      <TrustReceipt records={session.trust} />
    </>
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
