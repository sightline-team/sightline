import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { RECORDED_ANALYSIS, RECORDED_PAGES, RECORDED_QUESTIONS, RECORDED_TRANSCRIPT } from '@/lib/fixtures/recorded';
import { demoDocuments, demoPhotographs, preparedQuestions } from '@/lib/fixtures/replay';
import { FIXTURE_CASES } from '@/lib/fixtures/cases';
import { assembleDocument, type PageOutcome } from '@/features/capture/assemble';
import { transcribeSchema } from '@/features/capture/schemas';
import { analysisSchema } from '@/features/analysis/schemas';
import { qaSchema } from '@/features/qa/schemas';
import { quoteFound } from '@/features/analysis/grounding';

/**
 * The recorded half of the Mode F corpus (item **S-11**, used by **C-13**).
 *
 * `tests/unit/fixtures.test.ts` asks what the replay client *does* with these replies. This file asks
 * whether they are what they claim to be, which is a different question and the one that matters more:
 * a fixture labelled "recorded from an attested enclave" that was not, or that has quietly drifted from
 * the files the demo ships, would be the app's central claim told falsely in the demo's own data. So
 * nothing here is taken from `recorded.ts` on trust — the sidecars are re-read off disk and the
 * photographs are re-hashed.
 *
 * The four checks that would each catch a distinct way of lying:
 *  - the page keys are the digests of the JPEGs in `public/sample-docs/photographs/`, so the demo answers
 *    for a file a visitor can actually choose (**ADR-31**'s whole matching rule);
 *  - the transcript is what the app's own `assembleDocument` makes from those three replies, so the
 *    structure answer belongs to a join a run really produces and not to one typed into the recorder;
 *  - every reply parses with the schema the live mode validates against — the rule F-09 set for authored
 *    fixtures and **S-11** inherits;
 *  - each sidecar says which recorder wrote it, that the page was synthetic, and what its signature did.
 *
 * A re-recording (`npm run fixtures:record`) is expected to fail parts of this file until the new run's
 * numbers are read and the assertions are updated. That failure is the design: the corpus cannot change
 * its story by itself.
 */

const ROOT = resolve(import.meta.dirname, '..', '..');

interface Sidecar {
  recordedAt: string;
  recorder: string;
  item: string;
  purpose: string;
  requestedModel: string;
  servedModel: string;
  completionId: string;
  e2ee: boolean;
  ms: number;
  signature: { verified: boolean; origin: string; algo: string };
  synthetic: boolean;
  syntheticNote: string;
  fixtureKey?: string;
  imageFile?: string;
  question?: string;
  transcriptSha256?: string;
  prepared?: { bytes: number; width: number; height: number };
}

interface ReplyFile {
  _provenance: Sidecar;
  /** Only the structure file carries this: the transcript the recorded reading was asked about. */
  transcript?: string;
  envelope: { id: string; model: string; choices: { message: { content: string } }[] };
}

function read(relative: string): ReplyFile {
  return JSON.parse(readFileSync(resolve(ROOT, relative), 'utf8')) as ReplyFile;
}

/** The six files one recording writes, in the order a run needs them. */
const PAGES = [1, 2, 3].map((n) => read(`fixtures/responses/pages/page-${n}.json`));
const DOCUMENT = read('fixtures/responses/document.json');
const QUESTIONS = [1, 2].map((n) => read(`fixtures/responses/qa/question-${n}.json`));
const ALL_FILES = [...PAGES, DOCUMENT, ...QUESTIONS];

/** `@noble/hashes` takes bytes, never a string, so both digests below encode first. */
function sha256Hex(bytes: Uint8Array): string {
  return bytesToHex(sha256.create().update(bytes).digest());
}

function contentOfReply(file: ReplyFile): string {
  return file.envelope.choices[0]!.message.content;
}

describe('the recorded files say where they came from', () => {
  it('all six are from one S-11 recording run, and each names its recorder', () => {
    // One `recordedAt` shared by six files is what makes "a recording" a single event rather than a pile of
    // replies collected whenever. If a page is re-recorded alone, this fails and the mixed corpus is visible
    // instead of silent.
    const stamp = ALL_FILES[0]!._provenance.recordedAt;

    expect(stamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    for (const file of ALL_FILES) {
      expect(file._provenance.recordedAt).toBe(stamp);
      expect(file._provenance.recorder).toBe('scripts/record-fixtures.ts');
      expect(file._provenance.item).toBe('S-11');
    }
  });

  it('every reply was signature-verified by an enclave, and none claims end-to-end encryption', () => {
    // The recorder kept only verified replies, so this re-states its gate as a property of the data.
    // `e2ee: false` is kept honest too: the browser-half of the claim is still **B-12**'s, and a sidecar
    // that quietly became `true` would promote a rung the app has not earned (AGENTS.md §4 rules 2 and 5).
    for (const file of ALL_FILES) {
      expect(file._provenance.signature.verified).toBe(true);
      expect(file._provenance.signature.origin).toBe('provider_tee');
      expect(file._provenance.signature.algo).toBe('ed25519');
      expect(file._provenance.e2ee).toBe(false);
      expect(file._provenance.ms).toBeGreaterThan(0);
      expect(file._provenance.completionId).not.toMatch(/^fixture-/);
    }
  });

  it('every recorded file is labelled synthetic in its own sidecar', () => {
    for (const file of ALL_FILES) {
      expect(file._provenance.synthetic).toBe(true);
      // The note names where the bytes came from, which is the part a reader can check.
      expect(file._provenance.syntheticNote).toContain('scripts/page_sample.ts');
    }
  });

  it('the steps were answered by the models this app plans for them', () => {
    // The recorder attests per model, so a page reply must name `STEP_PLANS.transcribe`'s model and not
    // borrow another step's. Cross-wiring them would make the demo's provenance unrepeatable.
    for (const file of PAGES) {
      expect(file._provenance.purpose).toBe('transcribe');
      expect(file._provenance.servedModel).toBe(file._provenance.requestedModel);
    }
    expect(DOCUMENT._provenance.purpose).toBe('analyse');
    for (const file of QUESTIONS) expect(file._provenance.purpose).toBe('qa');
  });
});

describe('a page is found by the digest of the file the demo ships (ADR-31)', () => {
  it('each recorded key is the SHA-256 of the shipped JPEG, recomputed here', () => {
    // The single assertion that makes the no-key photo demo *runnable*: a visitor chooses these files, so the
    // key must be the digest of the bytes on disk, not of anything the recorder held in memory.
    expect(RECORDED_PAGES).toHaveLength(3);
    RECORDED_PAGES.forEach((page, index) => {
      const file = PAGES[index]!;
      const onDisk = readFileSync(resolve(ROOT, page.imageFile));

      expect(page.imageFile).toBe(file._provenance.imageFile);
      // The shipped file is the prepared page — same bytes the recorder hashed and same dimensions it reports
      // (C-01's cap), so nothing was re-encoded after the recording.
      expect(file._provenance.prepared).toMatchObject({ bytes: onDisk.byteLength, width: 1200, height: 1600 });
      expect(file._provenance.prepared).toMatchObject({ sourceWidth: 3024, sourceHeight: 4032 });
      expect(sha256Hex(new Uint8Array(onDisk))).toBe(page.fixtureKey);
      expect(page.fixtureKey).toBe(file._provenance.fixtureKey);
    });
  });

  it('the three keys are distinct and shaped like digests', () => {
    // Two pages of one document can be identical bytes; three pages of one demo recording must not share a
    // key, or one reply answers for two pages and the joined transcript is wrong.
    const keys = RECORDED_PAGES.map((page) => page.fixtureKey);

    expect(new Set(keys).size).toBe(3);
    for (const key of keys) expect(key).toMatch(/^[0-9a-f]{64}$/);
  });

  it('the photographs a Mode F visitor is pointed at exist and are JPEGs', () => {
    const offered = demoPhotographs();

    expect(offered.map((p) => p.fixtureKey)).toEqual(RECORDED_PAGES.map((p) => p.fixtureKey));
    for (const photo of offered) {
      const bytes = readFileSync(resolve(ROOT, photo.imageFile));

      expect(bytes[0]).toBe(0xff);
      expect(bytes[1]).toBe(0xd8);
      expect(bytes.subarray(2, 4).some((b) => b !== 0x00)).toBe(true);
    }
  });
});

describe('the recording is a transcript of these pages and nothing else', () => {
  it('each page reply is a transcript the app would accept', () => {
    for (const file of PAGES) {
      expect(() => transcribeSchema.parse(JSON.parse(contentOfReply(file)) as unknown)).not.toThrow();
    }
  });

  it('the stored transcript is what the app\'s own joiner makes from those three replies', () => {
    // **C-11** in the middle of a provenance claim: Mode F answers the structure step for `RECORDED_TRANSCRIPT`,
    // and this demo runs `assembleDocument` on the recorded pages to prove that string is the one a real run
    // would build. Typed-in transcript, or a join whose rules have since changed, fails here — which is how a
    // drift between **C-01**/**C-11** and the demo stops being a silent wrong answer.
    const outcomes: PageOutcome[] = PAGES.map((file) => ({
      kind: 'ok' as const,
      value: transcribeSchema.parse(JSON.parse(contentOfReply(file)) as unknown),
      model: file._provenance.servedModel,
    }));
    const assembled = assembleDocument(outcomes);

    expect(assembled.usable).toBe(true);
    expect(assembled.unplaceableSpans).toBe(0);
    expect(assembled.transcript.uncertain).toEqual([]);
    // Pinned to what the enclave actually said, not to what would be convenient: two of the three demo pages
    // came back `rotated`, for a page drawn 0.63° crooked — the same behaviour **S-09** measured on 4 of 11
    // spike pages, and **C-04**'s reason to decide what a reported tilt costs. A capture notice is not a
    // halt, so the demo run still finishes; it just says something on the way.
    expect(assembled.transcript.captureIssues).toEqual([
      { page: 1, issue: 'rotated' },
      { page: 2, issue: 'rotated' },
    ]);
    expect(assembled.transcript.text).toBe(RECORDED_TRANSCRIPT);
    expect(DOCUMENT.transcript).toBe(RECORDED_TRANSCRIPT);
    expect(DOCUMENT._provenance.transcriptSha256).toBe(sha256Hex(new TextEncoder().encode(RECORDED_TRANSCRIPT)));
  });

  it('the joined transcript still says it is not a real document', () => {
    // The label lives in the drawn page, so it travels through the model and the joiner to the screen. If a
    // future page_sample stops printing it, the recorded transcript loses its disclaimer and this fails.
    expect(RECORDED_TRANSCRIPT.toUpperCase()).toContain('SYNTHETIC INVOICE');
    expect(RECORDED_TRANSCRIPT.toUpperCase()).toContain('NOT A REAL DOCUMENT');
  });
});

describe('the recorded reading and answers are the app\'s own shapes', () => {
  it('the structure reply parses with the schema the live mode validates against', () => {
    expect(() => analysisSchema.parse(RECORDED_ANALYSIS)).not.toThrow();
    const analysis = RECORDED_ANALYSIS as { facts: unknown[]; actions: unknown[]; warnings: unknown[] };
    expect(analysis.facts.length).toBeGreaterThan(0);
  });

  it('both answers parse, and the honest "not in the document" one is really there', () => {
    QUESTIONS.forEach((file, index) => {
      const parsed = qaSchema.parse(JSON.parse(contentOfReply(file)) as unknown);
      const prepared = RECORDED_QUESTIONS[index]!;

      expect(parsed.answer).toBe(prepared.answer);
      expect(parsed.notInDocument).toBe(prepared.notInDocument);
      expect(file._provenance.question).toBe(prepared.question);
      expect(prepared.answer.length).toBeGreaterThan(0);
    });
    // The recorder asked a question the pages cannot answer, so the demo shows that outcome from the photo
    // path too and not only from the authored letters (P-06).
    expect(RECORDED_QUESTIONS.filter((reply) => reply.notInDocument)).toHaveLength(1);
  });

  it('every recorded quote is a literal excerpt of the recorded transcript', () => {
    // Grounding runs on these at read time, so this is the difference between "the demo shows sourced facts"
    // and "the demo shows facts that turn out to be flagged".
    const analysis = analysisSchema.parse(RECORDED_ANALYSIS);
    for (const item of [...analysis.facts, ...analysis.actions]) {
      expect(quoteFound(RECORDED_TRANSCRIPT, item.sourceQuote)).toBe(true);
    }
    for (const reply of RECORDED_QUESTIONS) {
      if (reply.sourceQuote !== undefined) expect(quoteFound(RECORDED_TRANSCRIPT, reply.sourceQuote)).toBe(true);
    }
  });

  it('the recorded document answers its two questions, and is not offered for pasting', () => {
    // Two halves of one rule: the chain works (`preparedQuestions` finds this case by its transcript) and it
    // cannot be entered from the paste screen, which would let a reviewer paste a page of line items and
    // credit the demo with having run the photo path.
    expect(preparedQuestions(RECORDED_TRANSCRIPT)).toEqual(RECORDED_QUESTIONS.map((reply) => reply.question));
    expect(demoDocuments().some((doc) => doc.text === RECORDED_TRANSCRIPT)).toBe(false);

    const recorded = FIXTURE_CASES.find((fixture) => fixture.name === 'photographed-invoice');
    expect(recorded?.offered).toBe(false);
    expect(recorded?.text).toBe(RECORDED_TRANSCRIPT);
    expect(demoDocuments()).toHaveLength(FIXTURE_CASES.filter((f) => f.offered !== false).length);
  });
});
