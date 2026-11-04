import { describe, expect, it } from 'vitest';
import { createFixtureClient, demoDocuments, FIXTURE_MODEL, fixtureModeAvailable, preparedQuestions, transportFor } from '@/lib/fixtures/replay';
import { FIXTURE_CASES } from '@/lib/fixtures/cases';
import { NearError } from '@/lib/near-ai/client';
import { appError } from '@/lib/errors';
import { analysisSchema } from '@/features/analysis/schemas';
import { structureUserPrompt } from '@/features/analysis/prompts';
import { REPAIR_NOTE } from '@/lib/near-ai/completion';
import { askAboutDocument } from '@/features/qa/ask';
import { completionEnvelopeSchema, contentOf } from '@/lib/near-ai/envelope';
import { quoteFound } from '@/features/analysis/grounding';
import { runPipeline } from '@/features/analysis/pipeline';
import { RunHalt, type AttestationGate, type SignatureVerifier } from '@/lib/near-ai/verification';
import type { Analysis, AppError, QAEntry, Session, Transcript } from '@/types';

/**
 * Fixture replay tests (item **F-09**).
 *
 * The property that matters is not "replay works" but **"replay never lies"**:
 *  - a demo answer is given only for a demo document, never over text the user pasted, because
 *    an authored summary that appears to describe their bill is the worst thing this mode
 *    could do while wearing a "demo data" banner;
 *  - Mode F answers no verification question, so nothing here can later be read as a report;
 *  - every document is labelled synthetic **in its own text**, so a screenshot of the demo
 *    cannot circulate as a real letter.
 *
 * The last group runs the **real pipeline against the real replay client** with no fakes at
 * all. That is the smallest thing that proves "a clean checkout with no key can run the flow"
 * (PRD §12 Q1 row 3) is more than a claim about unconnected modules.
 */

/** Stands in for a real user's document. Must never appear in an error (AGENTS.md §4 rule 7). */
const PASTED_SENTINEL = 'Diagnosis: metastatic carcinoma. Amount owed: 4,300 pounds';

const GATE_MUST_NOT_RUN: AttestationGate = () => {
  throw new Error('Mode F must not run an attestation gate: there is no enclave to check (AGENTS.md §4 rule 11).');
};

const VERIFIER_MUST_NOT_RUN: SignatureVerifier = () => {
  throw new Error('Mode F must not verify a signature: fixture data is not signed by anything.');
};

function fixtureSession(text: string): Session {
  const transcript: Transcript = { text, pageOffsets: [0], uncertain: [], captureIssues: [] };
  return {
    id: 'sess-fixture',
    createdAt: 1_760_000_000_000,
    mode: 'fixtures',
    input: 'text',
    pages: [],
    transcript,
    qa: [],
    trust: [],
    status: 'idle',
  };
}

/** The Mode F run with no doubles anywhere: real pipeline, real replay client, real schemas. */
function runFixtureFlow(text: string) {
  const analyses: Analysis[] = [];
  const claims: string[] = [];
  const degradations: AppError[] = [];
  return {
    promise: runPipeline({
      session: fixtureSession(text),
      model: 'fixtures/demo-model',
      transport: createFixtureClient(),
      gate: GATE_MUST_NOT_RUN,
      verifySignature: VERIFIER_MUST_NOT_RUN,
      signal: new AbortController().signal,
      onTranscript: () => {},
      onAnalysis: (a) => void analyses.push(a),
      // P-08: the three readable fixtures are authored JSON, so there is nothing to repair and
      // nothing to degrade. Being called for one of them would mean demo data was reported as
      // unreadable. The fourth case exists to be called for (`ferney-bus-pass`, P-11).
      onDegraded: (error) => void degradations.push(error),
      onTrustRecord: (r) => void claims.push(r.claim),
    }),
    analyses,
    claims,
    degradations,
  };
}

/** The cases that carry an authored reading; `ferney-bus-pass` carries prose instead (P-11). */
function readableCases() {
  return FIXTURE_CASES.filter((fixture) => fixture.unreadableReply === undefined);
}

describe('the demo corpus is labelled and valid before anything runs', () => {
  it('has four distinct documents, three of them with an authored reading', () => {
    expect(FIXTURE_CASES).toHaveLength(4);
    expect(new Set(FIXTURE_CASES.map((c) => c.name)).size).toBe(4);
    expect(readableCases()).toHaveLength(3);
    expect(FIXTURE_CASES.filter((c) => c.unreadableReply !== undefined).map((c) => c.name)).toEqual(['ferney-bus-pass']);
  });

  it('each document says in its own text that it is synthetic', () => {
    // A screenshot of this demo must not be passable as a real letter. That is a property of
    // the data, not of the UI, so it is checked in the data.
    for (const fixture of FIXTURE_CASES) {
      expect(fixture.text.toLowerCase()).toContain('synthetic');
      expect(fixture.text).toContain('Sightline');
    }
  });

  it('each authored analysis satisfies the schema the real mode output is validated against', () => {
    for (const fixture of readableCases()) {
      expect(() => analysisSchema.parse(fixture.analysis)).not.toThrow();
    }
  });

  it('the one unreadable reply is genuinely not the JSON that was asked for', () => {
    // If this ever stops throwing, the P-11 case has silently become a readable letter and the
    // transcript-only screen has gone untested again.
    const fixture = FIXTURE_CASES.find((c) => c.unreadableReply !== undefined)!;
    expect(() => analysisSchema.parse(JSON.parse(fixture.unreadableReply) as unknown)).toThrow();
    expect(fixture.qa).toEqual([]);
  });

  it('carries exactly one deliberate misquote in the whole corpus, and it is the bank letter', () => {
    const ungrounded = readableCases().flatMap((fixture) => {
      const { facts, actions } = fixture.analysis as { facts: { sourceQuote: string }[]; actions: { sourceQuote: string }[] };
      return [...facts, ...actions]
        .filter((item) => !quoteFound(fixture.text, item.sourceQuote))
        .map((item) => ({ name: fixture.name, sourceQuote: item.sourceQuote }));
    });

    // Every other quote is literal, so the demo shows "sourced" as the normal case and
    // "flagged" exactly once — the realistic model behaviour, not a strawman.
    expect(ungrounded).toEqual([{ name: 'riverside-statement', sourceQuote: 'Closing balance is £1,204.55' }]);
  });
});

describe('the replay client answers demo documents and nothing else', () => {
  it('returns a completion shaped like the real endpoint', async () => {
    const client = createFixtureClient();
    const fixture = FIXTURE_CASES[0]!;
    const body = { model: 'fixtures/demo-model', messages: [{ role: 'user', content: fixture.text }] };

    const response = await client.post('chat/completions', body);

    expect(response.status).toBe(200);
    expect(response.sentBody).toBe(JSON.stringify(body));
    // Same trailing-newline convention as a live streaming body, so a recorded payload from
    // S-11 drops into this shape without changing the replay path.
    expect(response.rawText.endsWith('\n\n')).toBe(true);
    expect(completionEnvelopeSchema.parse(response.json).id).toBe(`fixture-${fixture.name}`);
    // The model named in a fixture receipt must say it is a fixture, not a verified enclave.
    expect(completionEnvelopeSchema.parse(response.json).model).toBe('fixtures/demo-model');
  });

  it('refuses text it has no authored answer for, and names no part of it', async () => {
    const client = createFixtureClient();

    const failure = await client.post('chat/completions', {
      model: 'fixtures/demo-model',
      messages: [{ role: 'user', content: PASTED_SENTINEL }],
    }).then(
      () => undefined,
      (cause: unknown) => cause,
    );

    expect(failure).toBeInstanceOf(NearError);
    const error = (failure as NearError).error;
    expect(error.code).toBe('no_fixture_for_input');
    expect(error.retryable).toBe(false);
    // Rule 7: the refusal must not echo the user's document back through an error.
    expect((failure as NearError).message).not.toContain(PASTED_SENTINEL);
    expect(JSON.stringify(error)).not.toContain('metastatic');
  });

  it('refuses a page call even when the body names a document it does have answers for', async () => {
    // The discriminating direction of C-03's guard in `replay.ts`. This body carries a real demo
    // document, so a missing guard would answer it with that fixture's *analysis* — authored prose
    // presented as a reading of a photograph. And the guard has to sit **before** the document
    // lookup: a transcription body carries its text as an `image_url` multipart array, which
    // `findFixture` cannot read, so the lookup would refuse for the wrong reason ("unknown document")
    // while the true reason is that Mode F has no page replies at all (S-11 records them).
    const client = createFixtureClient();
    const fixture = FIXTURE_CASES[0]!;

    const failure = await client
      .post('chat/completions', { model: 'fixtures/demo-model', messages: [{ role: 'user', content: fixture.text }] }, { purpose: 'transcribe' })
      .then(
        () => undefined,
        (cause: unknown) => cause,
      );

    expect(failure).toBeInstanceOf(NearError);
    expect((failure as NearError).error.code).toBe('no_fixture_for_input');
  });

  it('refuses a partial document: containment is exact, not similar', async () => {    const client = createFixtureClient();
    const partial = FIXTURE_CASES[0]!.text.split('\n').slice(0, 3).join('\n');

    await expect(client.post('chat/completions', { model: 'm', messages: [{ role: 'user', content: partial }] })).rejects.toBeInstanceOf(NearError);
  });

  it('answers no verification call, because Mode F has nothing to verify', async () => {
    const client = createFixtureClient() as unknown as {
      get: (path: string, init?: Record<string, unknown>) => Promise<unknown>;
    };

    for (const path of ['attestation/report', 'signature/{chat_id}', 'model/{model_name}'] as const) {
      // The rejection names the endpoint so a developer can find the call, and carries no
      // response-shaped payload at all: there is nothing here a future check could mistake
      // for a report or a signature.
      const message = await client.get(path, { chatId: 'x', modelName: 'x' }).then(
        () => undefined,
        (cause: unknown) => (cause as Error).message,
      );
      expect(message).toMatch(/Mode F performs no/);
      expect(message).toContain(path);
    }
  });
});

describe('transport selection keeps Mode F away from the network module', () => {
  it('picks fixtures only for Mode F', () => {
    expect(transportFor('fixtures')).toBe('fixtures');
    expect(transportFor('relay')).toBe('network');
    expect(transportFor('direct')).toBe('network');
  });

  it('is available with no credentials of any kind', () => {
    expect(fixtureModeAvailable()).toBe(true);
    expect(demoDocuments()).toHaveLength(4);
    expect(demoDocuments()[0]!.text).toBe(FIXTURE_CASES[0]!.text);
  });
});

describe('the whole text flow runs in fixture mode with no key and no doubles', () => {
  it('turns a demo document into an analysis and a demo-data rung', async () => {
    const fixture = FIXTURE_CASES[0]!;
    const run = runFixtureFlow(fixture.text);

    await expect(run.promise).resolves.toBeUndefined();

    expect(run.analyses).toHaveLength(1);
    expect(run.claims).toEqual(['fixtures']);
    const analysis = run.analyses[0]!;
    expect(analysis.docType).toBe('bill');
    expect(analysis.facts.every((f) => f.quoteFound)).toBe(true);
    expect(analysis.facts.map((f) => f.value)).toContain('£840');
  });

  it('shows the one misquoted fact flagged rather than hidden', async () => {
    const run = runFixtureFlow(FIXTURE_CASES[1]!.text);

    await expect(run.promise).resolves.toBeUndefined();

    const facts = run.analyses[0]!.facts;
    expect(facts.filter((f) => !f.quoteFound).map((f) => f.label)).toEqual(['Balance']);
    // Kept, not dropped: hiding it would hide a model problem from the user (P-02).
    expect(facts).toHaveLength(4);
  });

  it('refuses to put a demo answer over the text a person pasted', async () => {
    const run = runFixtureFlow(PASTED_SENTINEL);

    let halt: RunHalt | undefined;
    try {
      await run.promise;
    } catch (cause) {
      if (cause instanceof RunHalt) halt = cause;
      else throw cause;
    }

    expect(halt?.error.code).toBe('no_fixture_for_input');
    expect(run.analyses).toEqual([]);
    // No record either: the run stopped before a completion was fetched, so the receipt has
    // nothing truthful to say about one.
    expect(run.claims).toEqual([]);
    expect(halt?.error.userMessage).not.toContain('metastatic');
  });
});

/**
 * The fourth corpus case, which exists so that §13's fallback is a thing Mode F **does** rather than
 * a thing the reducer describes (item **P-11**). P-08 could only prove the degraded state at the
 * seam; these run the real pipeline against the real replay client, so the retry, the two receipts
 * and the named failure all execute for real. The browser half is
 * `tests/e2e/flow.spec.ts` › `the transcript-only screen (P-11)`.
 */
describe('the unreadable demo reply degrades a real fixture run (P-11)', () => {
  const ferney = FIXTURE_CASES.find((fixture) => fixture.unreadableReply !== undefined)!;

  it('ends with no analysis and one named failure, after the retry', async () => {
    const run = runFixtureFlow(ferney.text);
    await expect(run.promise).resolves.toBeUndefined();

    expect(run.analyses).toEqual([]);
    expect(run.degradations).toHaveLength(1);
    const error = run.degradations[0]!;
    expect(error.code).toBe('invalid_model_output');
    // The catalogue's own sentence, so the screen and the announcer cannot say two different things.
    expect(error.userMessage).toBe(appError('invalid_model_output').userMessage);
    expect(error.retryable).toBe(true);
    expect(error.userMessage).not.toContain(ferney.unreadableReply);
  });

  it('emits one receipt per attempt, so the receipt shows the retry happened', async () => {
    const run = runFixtureFlow(ferney.text);
    await run.promise;

    // Two records, not one and not three: the first attempt and its single repair. A run that
    // silently retried twice, or reported only the last try, would be invisible on the receipt.
    expect(run.claims).toEqual(['fixtures', 'fixtures']);
  });

  it('answers the repair request with the same prose, and both ids name the fixture', async () => {
    const client = createFixtureClient();
    const first = { model: FIXTURE_MODEL, messages: [{ role: 'user', content: structureUserPrompt(ferney.text) }] };
    const retry = {
      model: FIXTURE_MODEL,
      messages: [{ role: 'user', content: `${structureUserPrompt(ferney.text)}\n\n${REPAIR_NOTE}` }],
    };

    const a = completionEnvelopeSchema.parse((await client.post('chat/completions', first)).json);
    const b = completionEnvelopeSchema.parse((await client.post('chat/completions', retry)).json);

    expect(contentOf(a)).toBe(ferney.unreadableReply);
    expect(contentOf(b)).toBe(ferney.unreadableReply);
    // Both attempts name the fixture, so the receipt cannot read like one live call and one ghost.
    expect(a.id).toBe(`fixture-${ferney.name}`);
    expect(b.id).toBe(`fixture-${ferney.name}`);
  });

  it('writes the letter into the session anyway, because the fallback needs something to show', async () => {
    // The transcript is the product's last honest output. If the run cleared it on failure, the
    // transcript-only screen would be an empty screen wearing the name.
    const seen: Transcript[] = [];
    await runPipeline({
      session: fixtureSession(ferney.text),
      model: FIXTURE_MODEL,
      transport: createFixtureClient(),
      gate: GATE_MUST_NOT_RUN,
      verifySignature: VERIFIER_MUST_NOT_RUN,
      signal: new AbortController().signal,
      onTranscript: (t) => void seen.push(t),
      onAnalysis: () => {
        throw new Error('the unreadable fixture must not produce an analysis');
      },
      onDegraded: () => {},
      onTrustRecord: () => {},
    });

    expect(seen).toHaveLength(1);
    expect(seen[0]!.text).toBe(ferney.text);
  });
});

/**
 * Every prepared question on every demo document, through the **real** ask path with the **real**
 * replay client (item **P-06**, whose done-when is "5 prepared questions on 3 docs answered
 * correctly or correctly refused"). Table-driven rather than sampled on purpose: hand-picking
 * which questions to check is exactly how a demo passes while a user meets the one that does not.
 */
describe('every prepared question in the corpus resolves to its honest state', () => {
  function askFixture(text: string, question: string): Promise<QAEntry> {
    return askAboutDocument({
      session: fixtureSession(text),
      model: FIXTURE_MODEL,
      transport: createFixtureClient(),
      gate: GATE_MUST_NOT_RUN,
      verifySignature: VERIFIER_MUST_NOT_RUN,
      question,
      signal: new AbortController().signal,
      onTrustRecord: () => {},
    });
  }

  for (const fixture of FIXTURE_CASES) {
    for (const reply of fixture.qa) {
      it(`${fixture.name} — "${reply.question}"`, async () => {
        const entry = await askFixture(fixture.text, reply.question);
        expect(entry.answer).toBe(reply.answer);

        if (reply.notInDocument) {
          // The refusal state carries no quote and no flag: there is nothing to source it to, and
          // a flag here would imply the answer had been checked against the text.
          expect(entry.notInDocument).toBe(true);
          expect(entry.sourceQuote).toBeUndefined();
          expect(entry.quoteFound).toBeUndefined();
          return;
        }

        expect(entry.notInDocument).toBe(false);
        // The oracle is a plain containment check, deliberately *not* the grounding module: if
        // `quoteFound` and "is this string in the document" ever disagree, that is the bug.
        const literal = reply.sourceQuote !== undefined && fixture.text.includes(reply.sourceQuote);
        expect(entry.quoteFound).toBe(literal);
      });
    }
  }

  it('the corpus contains at least five answered questions and one deliberate near-miss', () => {
    // P-06's done-when counts five; the near-miss is what proves the flag is not decorative.
    const answered = FIXTURE_CASES.flatMap((f) => f.qa).filter((reply) => !reply.notInDocument);
    const ungrounded = answered.filter((reply) => !FIXTURE_CASES.some((f) => f.text.includes(reply.sourceQuote ?? '')));
    expect(answered.length).toBeGreaterThanOrEqual(5);
    expect(ungrounded).toHaveLength(1);
  });

  it('refuses a wording the letter was not prepared for, without answering it', async () => {
    let halt: RunHalt | undefined;
    try {
      await askFixture(FIXTURE_CASES[0]!.text, 'What is my date of birth?');
    } catch (cause) {
      if (cause instanceof RunHalt) halt = cause;
      else throw cause;
    }
    expect(halt?.error.code).toBe('no_fixture_for_question');
    expect(halt?.error.userMessage).toContain('no prepared answer');
  });

  it('refuses the document before refusing the question, so a real letter is never half-demoed', async () => {
    let halt: RunHalt | undefined;
    try {
      await askFixture(PASTED_SENTINEL, 'How much do I have to pay?');
    } catch (cause) {
      if (cause instanceof RunHalt) halt = cause;
      else throw cause;
    }
    // The wording is prepared — for a *different* document — and that must not earn an answer.
    expect(halt?.error.code).toBe('no_fixture_for_input');
    expect(halt?.error.userMessage).not.toContain('metastatic');
  });
});
