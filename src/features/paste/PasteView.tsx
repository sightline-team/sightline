'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Button } from '@/components/Button';
import { StatusMessage } from '@/components/StatusMessage';
import { demoDocuments } from '@/lib/fixtures/replay';
import { useAnnouncer } from '@/lib/a11y/announcer';
import { useDocumentRun } from '@/app/_flow/useDocumentRun';
import { useSessionStore } from '@/lib/session/store';
import { MAX_PASTE_CHARS } from '@/lib/session/reducer';
import type { PublicConfig } from '@/lib/config';

/**
 * Paste-text input (item **P-05**).
 *
 * Operable by keyboard and by a screen reader (AGENTS.md §8): a real `<label>`, a native
 * `<textarea>`, a native submit so Enter and the button do the same thing, one live region
 * for status, and focus moved to the failure summary when a run stops.
 *
 * No privacy sentence is written in this file (rule 1). The capability sentences below say
 * what the build does and does not do; the claim about verification appears only in the
 * receipt, computed from the `TrustRecord`.
 */
/**
 * The keyed wrapper (item **P-10**).
 *
 * The words in the text box are document data, and they belong to the session that typed them.
 * `forgotten` mints a new session id, so the box is remounted under the new key and starts
 * empty — React's own way to say "this subtree describes a different thing now". Doing it with
 * an effect that sets state was rejected by the lint rule and by the argument behind it: the
 * old words would be rendered once more before they disappeared.
 */
export function PasteView({ config }: { config: PublicConfig }) {
  const { session } = useSessionStore();
  return <PasteForm key={session.id} config={config} />;
}

function PasteForm({ config }: { config: PublicConfig }) {
  const { session } = useSessionStore();
  const run = useDocumentRun();
  const announce = useAnnouncer().announce;
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const errorRef = useRef<HTMLDivElement | null>(null);

  // A-06: after a failure, focus goes to the summary, not to a toast nobody can reach.
  useEffect(() => {
    if (session.error !== undefined) errorRef.current?.focus();
  }, [session.error]);

  const isFixtures = config.mode === 'fixtures';

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (text.trim().length === 0) {
      announce('There is nothing in the text box yet.');
      return;
    }
    setBusy(true);
    await run(text);
    setBusy(false);
  }

  return (
    <>
      <h1>Add a document</h1>
      <p>
        Sightline reads the words you give it and tells you what they say, then shows exactly
        which checks ran on the answer and which did not.
      </p>
      {config.downgraded ? (
        // The operator asked for a mode this deployment cannot honour. Saying so is not a
        // privacy claim (rule 1) — it is the difference between "demo mode" and a user
        // believing they are on a verified service.
        <p className="muted" data-testid="mode-downgraded">
          This deployment cannot run the requested mode (<code>{config.requestedMode}</code>), so it is
          running in <code>{config.mode}</code> mode.
        </p>
      ) : null}

      <div className="stream-bay">
        <div className="stream-bay-header">
          <span className="stream-title">Plain text input</span>
          <span className="stream-spec">20,000 character limit</span>
        </div>
        <form onSubmit={onSubmit}>
          <label htmlFor="document-text">Paste the text of your document</label>
          <p className="muted" id="paste-hint">
            Words copied from a screen or a PDF work best. Sightline reads up to{' '}
            {MAX_PASTE_CHARS.toLocaleString('en-GB')} characters at a time, so paste the part you need
            answered. To read a page from a photograph instead, use <em>Photograph a document</em> below.
          </p>
          <textarea
            id="document-text"
            name="document-text"
            rows={10}
            value={text}
            aria-describedby="paste-hint"
            onChange={(event) => setText(event.target.value)}
          />
          <p>
            <Button type="submit" disabled={busy}>
              {busy ? 'Reading…' : 'Read this text'}
            </Button>
          </p>
        </form>
      </div>

      {isFixtures ? (
        <section aria-labelledby="demo-heading">
          <h2 id="demo-heading">Demo documents</h2>
          <p>
            These letters were written for the demo. They contain no real person, account or
            prescription. Choosing one puts its text in the box above.
          </p>
          <ul className="button-row">
            {demoDocuments().map((document) => (
              <li key={document.name}>
                <Button
                  onClick={() => {
                    setText(document.text);
                    announce(`${document.title} is in the text box. Choose Read this text to continue.`);
                  }}
                >
                  {document.title}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* One failure, one summary, in the section that ran (session.input is set by the run before any
          guard can refuse). The photograph section shows the same session.error only when photos ran. */}
      {session.error !== undefined && session.input === 'text' ? (
        <StatusMessage error={session.error} id="paste-error" ref={errorRef} />
      ) : null}
    </>
  );
}
