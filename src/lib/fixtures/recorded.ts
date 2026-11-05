import pageOne from '../../../fixtures/responses/pages/page-1.json';
import pageTwo from '../../../fixtures/responses/pages/page-2.json';
import pageThree from '../../../fixtures/responses/pages/page-3.json';
import documentReply from '../../../fixtures/responses/document.json';
import questionOne from '../../../fixtures/responses/qa/question-1.json';
import questionTwo from '../../../fixtures/responses/qa/question-2.json';
import type { PreparedReply } from '@/lib/fixtures/replay';

/**
 * The **recorded** half of the Mode F corpus (item **S-11**, used by **C-13**).
 *
 * These six files were written by `npm run fixtures:record`, which drew three synthetic pages in
 * Chromium, posted the app's own requests through `createNearClient` in direct mode, and saved the replies
 * only after each one's signature verified against the attested key. That makes them the first data in
 * this app that can honestly be called *recorded* rather than **authored synthetic** — the distinction
 * `fixtures/README.md` exists to police, and the reason the three pasted demo letters in `cases.ts` stay
 * as they are.
 *
 * ### What this module does, and what it deliberately does not
 *
 * It is a *reader*: it pulls the recorded reply text out of each file and hands it over with the identity
 * Mode F needs. It decides nothing and it validates nothing.
 *
 * It does not validate, and that is a considered absence rather than an oversight: this module is loaded
 * by the replay client, which is loaded by the run, so a schema failure here would arrive as an unhandled
 * throw in front of a reviewer with no key. The checks live in `tests/unit/recorded-fixtures.test.ts`,
 * which parses every reply with the app's own `transcribeSchema`, `analysisSchema` and `qaSchema`, and
 * re-derives the joined transcript with the app's own `assembleDocument` — the same rule F-09 applies to
 * the authored cases (a fixture the tests cannot parse is a fixture that must not be in the corpus).
 *
 * It does not name a model or an id for the receipt either. `replay.ts` wraps everything it serves in a
 * `fixtures/…` envelope, because a real completion id on a screen would report a call this session never
 * made (**ADR-31**, and F-09's original rule about receipts). The served model ids, the timings, the token
 * counts and the signature verdicts are all in each file's `_provenance`, which is where a claim about
 * provenance belongs.
 *
 * ### Why a page is keyed by a digest
 *
 * A pasted document identifies itself: its words are in the request body, and `replay.ts` matches them
 * against the corpus. A page does not — its bytes arrive as base64 inside an `image_url` part, which the
 * content match cannot read. So each recorded page carries the SHA-256 of the file the demo ships, and
 * `Page.fixtureKey` carries the same digest of the file the person chose. Exact match or refusal; the
 * reasoning, including the two designs that were rejected for it, is **ADR-31**.
 */

/** One recorded page, and the file a Mode F visitor has to choose for it to answer. */
export interface RecordedPage {
  /** Names the fixture in the replayed id, so a receipt still says where the answer came from. */
  name: string;
  /** Lower-case hex SHA-256 of `imageFile`'s bytes, as `lib/fixtures/page_key.ts` computes it. */
  fixtureKey: string;
  imageFile: string;
  /** The reply text, verbatim from the service. Never re-authored here. */
  content: string;
}

interface ReplyFile {
  _provenance: { fixtureKey?: string; imageFile?: string; question?: string };
  envelope: { choices?: { message?: { content?: unknown } }[] };
}

// `Pick`, not `ReplyFile`, because the structure and Q&A files carry a different `_provenance` — and a
// type whose properties are all optional is only assignable if at least one of them is present. Reading
// the reply never needs the sidecar, so it must not ask for it.
function replyOf(file: Pick<ReplyFile, 'envelope'>): string {
  const content = file.envelope.choices?.[0]?.message?.content;
  // A recorded file that has no reply text is a broken recording, and the test suite owns that claim;
  // here the only honest response is a refusal to replay it, which is what `content: ''` becomes.
  return typeof content === 'string' ? content : '';
}

export const RECORDED_PAGES: RecordedPage[] = [pageOne, pageTwo, pageThree].map((file, index) => ({
  name: `photographed-page-${index + 1}`,
  fixtureKey: file._provenance.fixtureKey ?? '',
  imageFile: file._provenance.imageFile ?? '',
  content: replyOf(file),
}));

/** The transcript the structure reply was asked about, as the app's own joiner produced it on the day. */
export const RECORDED_TRANSCRIPT: string = (documentReply as { transcript: string }).transcript;

/** The recorded answers, offered as the wording the service was actually given. */
export const RECORDED_QUESTIONS: PreparedReply[] = [questionOne, questionTwo].map((file) => {
  const answered = JSON.parse(replyOf(file)) as { answer?: string; notInDocument?: boolean; sourceQuote?: string };
  return {
    question: file._provenance.question ?? '',
    answer: answered.answer ?? '',
    notInDocument: answered.notInDocument === true,
    ...(answered.sourceQuote === undefined ? {} : { sourceQuote: answered.sourceQuote }),
  };
});

export const RECORDED_ANALYSIS: unknown = JSON.parse(replyOf(documentReply));
