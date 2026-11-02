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
 *    can.
 * 2. **Mode F answers no verification question.** The three GETs throw rather than replaying
 *    an attestation report or a signature, because a fabricated report is the one thing that
 *    could turn `claim: 'fixtures'` into a strong rung later.
 *
 * Provenance rule: until S-11 records real responses, everything in the corpus is
 * **authored synthetic** data and is described that way here, in each document's own text,
 * and in the README.
 */

export interface FixtureCase {
  /** Stable id, used in the fake completion id so a receipt cannot look like a live call. */
  name: string;
  /** What the UI offers to load (P-05). Plain language, no document content from a real person. */
  title: string;
  /** The demo document, verbatim. The structure step is answered for this text and no other. */
  text: string;
  /** What the model would have returned. Validated against `analysisSchema` by the tests. */
  analysis: unknown;
}

/** What a replayed completion is named as in the receipt. Not a TEE model and never claims to be. */
const FIXTURE_MODEL = 'fixtures/demo-model';

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

/** The envelope shape from `docs/SPIKE_RESULTS.md` §1, with an id that says where it came from. */
function envelopeFor(fixture: FixtureCase): Record<string, unknown> {
  return {
    id: `fixture-${fixture.name}`,
    model: FIXTURE_MODEL,
    choices: [{ message: { content: JSON.stringify(fixture.analysis) } }],
  };
}

function findFixture(body: unknown): FixtureCase | undefined {
  if (typeof body !== 'object' || body === null || !('messages' in body)) return undefined;
  const { messages } = body as { messages: { role: string; content: unknown }[] };
  const content: unknown = messages.find((m) => m.role === 'user')?.content;
  // Exact containment, not similarity: a partially-matching document must not receive an
  // authored answer written for the whole one.
  return typeof content === 'string' ? FIXTURE_CASES.find((fixture) => content.includes(fixture.text)) : undefined;
}

export function createFixtureClient(): NearClient {
  return {
    mode: 'fixtures',
    baseUrl: 'fixtures://authored-synthetic',

    post: async (path, body): Promise<NearResponse> => {
      const fixture = findFixture(body);
      if (fixture === undefined) {
        // Nothing document-derived is answered for text we have no authored reply for, and
        // the error carries no request content (AGENTS.md §4 rule 7).
        throw new NearError(path, appError('no_fixture_for_input'));
      }
      const json = envelopeFor(fixture);
      return {
        status: 200,
        path,
        sentBody: JSON.stringify(body),
        // The trailing newlines a streaming body ends with are kept here too, so a recorded
        // payload from S-11 can drop into this shape without changing the replay path.
        rawText: JSON.stringify(json) + '\n\n',
        json,
      };
    },

    get: (path: Exclude<NearPath, 'chat/completions'>): Promise<NearResponse> =>
      // Reaching this is a bug, not a user outcome: it would mean fixture mode was answering
      // a verification question, which is the one thing Mode F must never do (rule 11).
      Promise.reject(new Error(`Mode F performs no ${path} call: there is no enclave in fixture mode, so there is nothing to verify.`)),
  };
}
