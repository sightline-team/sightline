import { NearError, type NearClient, type NearPath, type NearResponse } from '@/lib/near-ai/client';
import { appError } from '@/lib/errors';
import { FIXTURE_CASES } from '@/lib/fixtures/cases';

/**
 * Fixture replay (item **F-09**) — the reason a reviewer or a screening agent with no
 * API key can run Sightline at all (PRD §12 Q1 row 3, HACKATHON.md Q-012/Q-017).
 *
 * Mode F replaces the network layer, not the pipeline: the same `NearClient` interface is
 * answered from data in `lib/fixtures/cases.ts`, so the flow, the grounding checks and the
 * claims ladder all still execute. Nothing here touches `fetch`, which is why this module —
 * not `createNearClient` — builds the Mode F client: a "demo data" run that silently spends
 * someone's credits, or shows a real model's answer over a user's own text, is both a
 * privacy lie and a bill.
 *
 * Two properties the design is chosen for:
 *
 * 1. **A demo answer is only ever given for a demo document.** `post` matches the transcript
 *    it was sent against the corpus and refuses anything else (`no_fixture_for_input`). The
 *    alternative — replaying the bill analysis over whatever the user pasted — would put an
 *    authored summary on screen that looks like it describes *their* document. Sequence-based
 *    replay (the shape this file had at scaffold time) cannot prevent that; content matching
 *    can. The same rule one level down: a question is answered only if that wording is prepared
 *    for that document (P-06), and anything else is refused with `no_fixture_for_question`.
 * 2. **Mode F answers no verification question.** The three GETs throw rather than replaying
 *    an attestation report or a signature, because a fabricated report is the one thing that
 *    could turn `claim: 'fixtures'` into a strong rung later.
 *
 * Provenance rule: until S-11 records real responses, everything in the corpus is
 * **authored synthetic** data and is described that way here, in each document's own text,
 * and in the README.
 */

export interface PreparedReply {
  /** The exact wording the demo offers as a button. Matching is by wording, not by meaning. */
  question: string;
  /** What the model would have answered. */
  answer: string;
  /** The honest "that is not in the document" outcome (P-06). */
  notInDocument: boolean;
  /** A literal excerpt of the document, or an authored near-miss so the flag shows in the demo. */
  sourceQuote?: string;
}

export interface FixtureCaseFields {
  /** Stable id, used in the fake completion id so a receipt cannot look like a live call. */
  name: string;
  /** What the UI offers to load (P-05). Plain language, no document content from a real person. */
  title: string;
  /** The demo document, verbatim. The structure step is answered for this text and no other. */
  text: string;
  /** Prepared answers (P-06). A question that is not on this list is refused, not answered. */
  qa: PreparedReply[];
}

/**
 * What the model would have returned for the structure step — exactly one of two things, which is
 * why this is a union and not two optional fields: a case that carried both would be replayed as the
 * analysis and its bad reply would never be seen, and a case carrying neither would be replayed as
 * `undefined`.
 *
 *  - `analysis` — the authored reading, validated against `analysisSchema` by the tests;
 *  - `unreadableReply` — prose that is not the JSON the request asked for, which is how item
 *    **P-11** reaches the transcript-only screen in a browser: Mode F cannot truncate a reply (every
 *    other fixture is authored JSON), but it can answer twice in the shape a real model sometimes
 *    answers in, and let the one repair retry and §13's fallback run for real.
 */
export type FixtureReply = { analysis: unknown; unreadableReply?: never } | { unreadableReply: string; analysis?: never };

export type FixtureCase = FixtureCaseFields & FixtureReply;

/** What a replayed completion is named as in the receipt. Not a TEE model and never claims to be. */
export const FIXTURE_MODEL = 'fixtures/demo-model';

export function fixtureModeAvailable(): boolean {
  // Mode F needs no credential of any kind, which is exactly why it is the default.
  return true;
}

/** Chooses relay / direct / fixture handling for a call. Kept separate from `createNearClient` so the client stays one code path. */
export function transportFor(mode: 'relay' | 'direct' | 'fixtures'): 'network' | 'fixtures' {
  return mode === 'fixtures' ? 'fixtures' : 'network';
}

export function demoDocuments(): { name: string; title: string; text: string }[] {
  return FIXTURE_CASES.map(({ name, title, text }) => ({ name, title, text }));
}

/**
 * The questions demo mode can answer for *this* document (P-06). Matched on the transcript the
 * session holds, so a demo question is only ever offered for the demo letter on screen.
 */
export function preparedQuestions(transcriptText: string): string[] {
  return FIXTURE_CASES.find((fixture) => fixture.text === transcriptText)?.qa.map((reply) => reply.question) ?? [];
}

/** The envelope shape from `docs/SPIKE_RESULTS.md` §1, with an id that says where it came from. */
function envelopeFor(fixture: FixtureCase): Record<string, unknown> {
  return {
    id: `fixture-${fixture.name}`,
    model: FIXTURE_MODEL,
    // A case replies with the authored reading, or with the prose that failed to be one (P-11).
    // Either way the same content goes back every time, which is what makes the repair retry
    // deterministic: the second attempt gets the same unreadable answer, and §13's fallback runs.
    choices: [{ message: { content: 'unreadableReply' in fixture ? fixture.unreadableReply : JSON.stringify(fixture.analysis) } }],
  };
}

/** The same envelope for a question, so a Q&A receipt names a fixture response id, not a live one. */
function qaEnvelopeFor(fixture: FixtureCase, reply: PreparedReply): Record<string, unknown> {
  const content: Record<string, unknown> = {
    answer: reply.answer,
    notInDocument: reply.notInDocument,
    ...(reply.sourceQuote === undefined ? {} : { sourceQuote: reply.sourceQuote }),
  };
  return {
    id: `fixture-${fixture.name}-qa`,
    model: FIXTURE_MODEL,
    choices: [{ message: { content: JSON.stringify(content) } }],
  };
}

function userContent(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('messages' in body)) return undefined;
  const { messages } = body as { messages: { role: string; content: unknown }[] };
  const content: unknown = messages.find((m) => m.role === 'user')?.content;
  return typeof content === 'string' ? content : undefined;
}

function findFixture(body: unknown): FixtureCase | undefined {
  const content = userContent(body);
  // Exact containment, not similarity: a partially-matching document must not receive an
  // authored answer written for the whole one.
  return content === undefined ? undefined : FIXTURE_CASES.find((fixture) => content.includes(fixture.text));
}

/**
 * Case and whitespace folding, nothing else. Two spaces or a capital letter are not a different
 * question; an extra word is, and "How much do I pay?" is a different question from "How much do
 * I owe?" — answering it anyway would be the product's central sin in a demo dress.
 */
function fold(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function findPreparedReply(body: unknown, fixture: FixtureCase): PreparedReply | undefined {
  const content = userContent(body);
  if (content === undefined) return undefined;
  const asked = fold(content);
  return fixture.qa.find((reply) => asked.includes(`question: ${fold(reply.question)}`));
}

export function createFixtureClient(): NearClient {
  return {
    mode: 'fixtures',
    baseUrl: 'fixtures://authored-synthetic',

    post: async (path, body, init): Promise<NearResponse> => {
      if (init?.purpose === 'transcribe') {
        // A page image has no authored reply in Mode F. Returning `fixture.analysis` here would put
        // hand-written prose on screen as though a model had read the photograph — the same
        // dishonesty F-09 refuses for an unknown document, and the transcript is the input to
        // everything downstream, so it is the worst place to invent one. Recording a real reply is
        // S-11's job and the photo demo's half of it is C-09's; until then this path fails closed.
        //
        // Checked **before** the fixture lookup, not after: a transcription body carries its text as
        // an `image_url` multipart array, which `findFixture` cannot read, so testing the lookup
        // first would refuse it for the wrong reason ("no such document") instead of the right one.
        throw new NearError(path, appError('no_fixture_for_input'));
      }

      const fixture = findFixture(body);
      if (fixture === undefined) {
        // Nothing document-derived is answered for text we have no authored reply for, and
        // the error carries no request content (AGENTS.md §4 rule 7).
        throw new NearError(path, appError('no_fixture_for_input'));
      }

      if (init?.purpose === 'qa') {
        const reply = findPreparedReply(body, fixture);
        if (reply === undefined) {
          // A demo document answers the questions written for it and nothing else. Improvising
          // an answer here would put authored prose on screen as though it came from a model
          // that had read the letter.
          throw new NearError(path, appError('no_fixture_for_question'));
        }
        return respond(path, body, qaEnvelopeFor(fixture, reply));
      }

      return respond(path, body, envelopeFor(fixture));
    },

    get: (path: Exclude<NearPath, 'chat/completions'>): Promise<NearResponse> =>
      // Reaching this is a bug, not a user outcome: it would mean fixture mode was answering
      // a verification question, which is the one thing Mode F must never do (rule 11).
      Promise.reject(new Error(`Mode F performs no ${path} call: there is no enclave in fixture mode, so there is nothing to verify.`)),
  };
}

function respond(path: NearPath, body: unknown, json: Record<string, unknown>): NearResponse {
  return {
    status: 200,
    path,
    sentBody: JSON.stringify(body),
    // The trailing newlines a streaming body ends with are kept here too, so a recorded
    // payload from S-11 can drop into this shape without changing the replay path.
    rawText: JSON.stringify(json) + '\n\n',
    json,
  };
}
