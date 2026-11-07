'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/Button';
import { StatusMessage } from '@/components/StatusMessage';
import { preparedQuestions } from '@/lib/fixtures/replay';
import { useAnnouncer } from '@/lib/a11y/announcer';
import { useAskAboutDocument } from '@/app/_flow/useAskAboutDocument';
import { useSessionStore } from '@/lib/session/store';
import type { QAEntry } from '@/types';

/**
 * `AskPanel` — item **P-06**.
 *
 * One labelled text field, one ask button, and the answers in the order they were asked, each
 * with its quote or an explicit statement that the document does not answer it. The single
 * announcer (F-08) is still the only `aria-live` region in the app: the answer is *also* written
 * into the list, so it is read twice on purpose (once spoken, once navigable) and no `<output>`
 * or second live region is introduced.
 *
 * Two rules this file is written against:
 *  - the grounding state decides the sentence, never the other way round (AGENTS.md §4 rule 8).
 *    `quoteFound` means "these words are in the transcript Sightline was given", and the copy
 *    says exactly that — it is the same wording the facts list uses, so a user learns one phrase
 *    and meets it in two places.
 *  - no privacy sentence is written here (rule 1). The dictation note below is a disclosure about
 *    the *operating system*, not a claim about what Sightline does with bytes.
 */
export function AskPanel() {
  const { session } = useSessionStore();
  const ask = useAskAboutDocument();
  const announce = useAnnouncer().announce;
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const errorRef = useRef<HTMLDivElement | null>(null);

  const transcriptText = session.transcript?.text ?? '';
  const prepared = session.mode === 'fixtures' ? preparedQuestions(transcriptText) : [];
  const isFixture = session.mode === 'fixtures';

  // A-06: after a failure, focus goes to the summary the answer would have replaced.
  useEffect(() => {
    if (session.error !== undefined) errorRef.current?.focus();
  }, [session.error]);

  async function submit(text: string) {
    if (text.trim().length === 0) {
      announce('There is nothing in the question box yet.');
      return;
    }
    setBusy(true);
    const outcome = await ask(text);
    setBusy(false);
    // The question stays on screen with its answer once the run finishes, so clearing the box
    // keeps the field ready for the next one without losing the thread of the conversation.
    if (outcome.ok) setQuestion('');
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void submit(question);
  }

  return (
    <section aria-labelledby="ask-heading">
      <h2 id="ask-heading">Ask a question</h2>

      {!isFixture ? (
        <p>
          Asking questions about a document is not built in this mode yet, so there is no question
          box to use. Demo mode answers the questions written for its demo documents.
        </p>
      ) : (
        <>
          <p>
            Sightline answers from the text it was given and nothing else. If the document does not
            say, it says so rather than filling in an answer.
          </p>
          <form onSubmit={onSubmit}>
            <label htmlFor="question">Your question</label>
            <p className="muted" id="question-hint">
              If you dictate instead of typing, that is your device&rsquo;s own speech service.
              Sightline does not run it and cannot speak for what it does with what you say.
            </p>
            <input
              id="question"
              name="question"
              type="text"
              value={question}
              aria-describedby="question-hint"
              autoComplete="off"
              onChange={(event) => setQuestion(event.target.value)}
            />
            <p>
              <Button type="submit" disabled={busy}>
                {busy ? 'Asking…' : 'Ask'}
              </Button>
            </p>
          </form>

          {prepared.length > 0 ? (
            <section aria-labelledby="prepared-heading">
              <h3 id="prepared-heading">Questions this demo document can answer</h3>
              <p className="muted">
                Demo documents carry prepared answers, and only these wordings have one. Choosing a
                question puts it in the box above; press Ask to send it.
              </p>
              <ul className="button-row">
                {prepared.map((text) => (
                  <li key={text}>
                    <Button
                      onClick={() => {
                        setQuestion(text);
                        announce(`${text} is in the question box. Choose Ask to continue.`);
                      }}
                    >
                      {text}
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      {session.qa.length > 0 ? (
        <div data-testid="answers">
          <h3>Answers</h3>
          <ol className="answer-list">
            {session.qa.map((entry) => (
              <Answer key={entry.id} entry={entry} />
            ))}
          </ol>
        </div>
      ) : null}

      {session.error !== undefined ? <StatusMessage error={session.error} id="ask-error" ref={errorRef} /> : null}
    </section>
  );
}

/**
 * One answer and the one grounding sentence its flags allow. Three states, and a fourth for the
 * case where the model gave no words at all — that is a different fact from &ldquo;these words are
 * not in the text&rdquo;, and folding them together would make an uncheckable answer look checked.
 */
function Answer({ entry }: { entry: QAEntry }) {
  const quote = entry.sourceQuote;

  return (
    <li data-testid="qa-entry">
      <p>
        <strong>{entry.question}</strong>
      </p>
      <p data-testid="qa-answer">
        {entry.answer}
        {entry.notInDocument ? (
          <span className="muted"> — the document does not answer this.</span>
        ) : entry.quoteFound ? (
          <span className="muted"> — quoted from the text: “{quote}”</span>
        ) : quote === undefined ? (
          <span className="flag" data-testid="answer-unsourced">
            {' '}
            — the answer gave no words from the text to check.
          </span>
        ) : (
          <span className="flag" data-testid="answer-flagged">
            {' '}
            — Sightline could not find these words in the text it was given.
          </span>
        )}
      </p>
    </li>
  );
}
