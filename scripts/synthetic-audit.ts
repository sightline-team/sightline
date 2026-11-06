#!/usr/bin/env tsx
/**
 * The synthetic-data audit — item **R-07**.
 *
 * AGENTS.md §5 makes "no real personal documents, photos or medical data, including the author's own"
 * a *never*, and the whole product is built on documents. Until this script existed the confirmation
 * was a sentence in `public/sample-docs/README.md` and a rule in `tests/unit/fixtures.test.ts`, which
 * is the F-11 failure mode: a rule enforced only by diligence is a rule that dies the first time
 * someone is tired and reaches for a real bill to see whether the model reads it properly. So this
 * answers the item's own wording — **all sample documents synthetic, no real personal data anywhere** —
 * with four measurements and one stated limit.
 *
 * **Stage 1 — the corpus is enumerable, and an unknown file is a finding.** Everything under
 * `src/lib/fixtures/`, `fixtures/responses/` and `public/sample-docs/` must classify as *authored*
 * (a person wrote the text), *recorded* (the service answered and `scripts/record-fixtures.ts` stored
 * it) or *photograph*. A file that classifies as nothing fails the run, which is the teeth: add a
 * fixture without telling this audit what it is, and it is red before anyone reads it.
 *
 * **Stage 2 — provenance that can be read off the bytes.** Every authored document must say in its own
 * text that it is synthetic, because that sentence is transcribed by the model, printed on the
 * transcript-only screen and read by the person using the demo — it is the claim, not a comment. Every
 * recorded fixture must carry `_provenance` with `synthetic: true`, a note saying what it describes,
 * and `signature.verified: true`: a recording is only evidence if the enclave signed it.
 *
 * **Stage 3 — the personal-data shapes, and the inversion that makes the phone rule worth anything.**
 * A detector that fires on "looks like a real phone number" cannot prove the corpus clean, because the
 * honest answer about `0300 123 0000` is "probably invented, unprovable". So the rule is an
 * **allowlist**: every UK subscriber number in the corpus must fall inside a range Ofcom has published
 * as reserved for TV and radio drama, where a number cannot be allocated to a real customer. That is a
 * claim with a source, and it is why three numbers in `cases.ts` moved on the day this was written.
 * The other rules are ordinary negative shapes — a real-format email outside the domains RFC 2606
 * reserves, NHS/NI/SSN identifiers, a Luhn-valid card number, a sort code or account number that is
 * not a declared-fake digit run, a house number on a named street, a date-of-birth label, a coordinate
 * pair to four decimals, a UK postcode. **Every string value of every corpus file is walked**, recorded
 * digests included: nothing is exempted by field name, and the digest-shaped values survive because the
 * rules ask for human shapes, and `\b` will not close a run of digits that a letter is sitting on.
 *
 * **Stage 4 — the JPEG bytes.** A photograph of a real document is the shape AGENTS §5 names first, and
 * a camera tells on itself: this parses the segment table and fails any file carrying an EXIF APP1, an
 * XMP APP1, an Adobe APP13 photo-info block or a COM segment, because an image drawn by
 * `scripts/page_sample.ts` has no reason to own any of them. It then binds each shipped photograph to
 * the recorded page fixture that keys on it — SHA-256 of the bytes **as chosen** (ADR-31) plus the
 * recorded byte count — so the bytes this audit looked at are provably the bytes Demo mode answers for.
 *
 * What this **cannot** prove, printed in the verdict rather than hidden: whether an invented name
 * (`Northgate Example Trust`) happens to belong to something real — that is a lookup a human or a
 * search engine does, not a shape; that no person has ever typed a real document into a live run, which
 * is AGENTS §4 rule 7's "never persisted" property and R-06's subject, not this file's; and anything
 * about `fixtures/attestation/`, which holds machine reports with no document content and is excluded
 * here **by name, with a reason**, in the same spirit as an exemption in `secrets-scan.ts` — and unlike
 * one, because it is not a shape match being silenced but a class of file being declared out of scope.
 *
 * Usage: `npm run release:synthetic` (exit 0 = the corpus is clean and every file in it is accounted
 * for) · `-- --verbose` per-stage counts · `-- --root=<dir>` audit a different tree (the mutation runs;
 * the authored corpus always comes from this checkout's `cases.ts`).
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { FIXTURE_CASES } from '@/lib/fixtures/cases';

/* ---------------------------------------------------------------- stage 1 ---- */

export type Classification = 'authored' | 'loader' | 'recorded' | 'photograph' | 'documentation' | 'unclassified';

/** The roots R-07 owns. Anything else in the repository is not a document corpus. */
export const CORPUS_ROOTS = ['src/lib/fixtures', 'fixtures/responses', 'public/sample-docs'];

export function classify(path: string): Classification {
  if (path === 'src/lib/fixtures/cases.ts') return 'authored';
  if (path.startsWith('src/lib/fixtures/') && path.endsWith('.ts')) return 'loader';
  if (path.startsWith('fixtures/responses/') && path.endsWith('.json')) return 'recorded';
  if (path.startsWith('public/sample-docs/') && /\.(jpg|jpeg|png)$/i.test(path)) return 'photograph';
  if (path.endsWith('.md')) return 'documentation';
  return 'unclassified';
}

/**
 * Declared out of scope, with the reason printed in the verdict. This is the one place R-07 sets a
 * folder aside, so it is the place a reader should look first: `fixtures/attestation/` holds reports
 * *about a machine* — quotes, event logs, base64 measurements — and no document about a person. It is
 * not exempted from a shape rule; it is a class of file named as not being the corpus.
 */
export const OUT_OF_SCOPE: { root: string; because: string }[] = [
  {
    root: 'fixtures/attestation',
    because: 'recorded machine reports and their redactions: measurement bytes about an enclave, with no document content (T-08, T-16)',
  },
];

/** The files a reviewer would call "the sample documents", with the classification each earned. */
export function classifyTree(files: string[]): { path: string; kind: Classification }[] {
  return files
    .filter((f) => CORPUS_ROOTS.some((root) => f.startsWith(root + '/')))
    .map((path) => ({ path, kind: classify(path) }))
    .sort((a, b) => a.path.localeCompare(b.path));
}

/* ---------------------------------------------------------------- stage 2 ---- */

/**
 * The sentence a synthetic document must carry in its own text. Two forms exist because the authored
 * letters and the recorded photograph say it differently: a person wrote one, a model transcribed the
 * other off a page that had it printed on it — which is the strongest proof available that the
 * declaration survived the round trip through the enclave.
 */
export const DECLARATION = /(synthetic demo data written for sightline|synthetic invoice[^\n]{0,4}not a real document)/i;

/** Strings inside a recorded fixture that a real document would have to touch. Field names are not special. */
export function collectStrings(value: unknown, at = '', out: { field: string; value: string }[] = []): { field: string; value: string }[] {
  if (typeof value === 'string') out.push({ field: at, value });
  else if (Array.isArray(value)) value.forEach((item, i) => collectStrings(item, `${at}[${i}]`, out));
  else if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) collectStrings(item, at === '' ? key : `${at}.${key}`, out);
  }
  return out;
}

/**
 * Every document in the corpus has to say, in the text itself, that it is not real. The reason this is
 * a rule rather than a metadata field: that sentence is transcribed by the model, printed on the
 * transcript-only screen when the JSON never arrives, and read by the person using the demo — so the
 * declaration is part of the claim and not a comment on it, and a document that loses it is a document
 * that can be mistaken for somebody's bill.
 */
export function declarationProblems(cases: readonly { name: string; text: string }[]): string[] {
  return cases
    .filter((c) => !DECLARATION.test(c.text))
    .map((c) => `${c.name}: its own text never says it is synthetic — the sentence a person reads on the transcript screen is the claim`);
}

export interface ProvenanceProblem {
  path: string;
  problems: string[];
}

/** What `_provenance` must say for a recording to count as evidence rather than as a saved reply. */
export function provenanceProblems(path: string, doc: unknown): string[] {
  const record = doc as { _provenance?: Record<string, unknown> } | null;
  const p = record?._provenance;
  if (!p) return [`${path}: no _provenance block — a recorded fixture must name its recorder, its model and what its signature did`];
  const problems: string[] = [];
  if (p.recorder !== 'scripts/record-fixtures.ts') problems.push(`${path}: recorded by ${JSON.stringify(p.recorder)}, not by scripts/record-fixtures.ts`);
  if (p.synthetic !== true) problems.push(`${path}: _provenance.synthetic is ${JSON.stringify(p.synthetic)}, and a recording whose own author cannot say it is synthetic is not one this audit can pass`);
  const note = typeof p.syntheticNote === 'string' ? p.syntheticNote : '';
  if (note.length < 40) problems.push(`${path}: syntheticNote is missing or too short to name what the fixture describes — it must say what it is not`);
  const signature = p.signature as { verified?: unknown } | undefined;
  if (signature?.verified !== true) problems.push(`${path}: the stored reply's signature did not verify, so it is not evidence about the enclave that answered`);
  return problems;
}

/* ---------------------------------------------------------------- stage 3 ---- */

export interface ShapeRule {
  name: string;
  pattern: RegExp;
  means: string;
  /** When present and it returns a reason, the match is a finding anyway; `null` clears it. */
  clears?: (match: string) => string | null;
}

/**
 * Ofcom's published table of numbers "recommended for TV and radio drama purposes" — 1000 numbers in
 * each range, and Ofcom's own note that they "will not be allocated to communications providers in the
 * foreseeable future". Read 2026-11-05 from `ofcom.org.uk/phones-and-broadband/phone-numbers/numbers-for-drama`;
 * that page returns 403 to this machine, so the ranges were taken from a third-party reproduction of
 * Ofcom's extract (`britishtelephones.com/film.htm`, revised 2026-03-16) and are recorded as read
 * second-hand rather than as confirmed at the primary source — AGENTS §6.
 */
export const DRAMA_RANGES: { code: string; subscriber: RegExp; area: string; first: string }[] = [
  { code: '01632', subscriber: /^960\d{3}$/, area: 'no area code (what Ofcom suggests when nothing else fits)' , first: '01632 960 000' },
  { code: '07700', subscriber: /^900\d{3}$/, area: 'mobile' , first: '07700 900 000' },
  { code: '08081', subscriber: /^570\d{3}$/, area: 'freephone' , first: '08081 570 000' },
  { code: '0909', subscriber: /^8790\d{3}$/, area: 'premium rate' , first: '0909 879 0000' },
  { code: '03069', subscriber: /^990\d{3}$/, area: 'UK-wide' , first: '03069 990 000' },
  { code: '020', subscriber: /^79460\d{3}$/, area: 'London' , first: '020 7946 0000' },
  { code: '028', subscriber: /^96496\d{3}$/, area: 'Northern Ireland' , first: '028 9649 6000' },
  { code: '029', subscriber: /^20180\d{3}$/, area: 'Cardiff' , first: '029 2018 0000' },
  { code: '0113', subscriber: /^4960\d{3}$/, area: 'Leeds' , first: '0113 496 0000' },
  { code: '0114', subscriber: /^4960\d{3}$/, area: 'Sheffield' , first: '0114 496 0000' },
  { code: '0115', subscriber: /^4960\d{3}$/, area: 'Nottingham' , first: '0115 496 0000' },
  { code: '0116', subscriber: /^4960\d{3}$/, area: 'Leicester' , first: '0116 496 0000' },
  { code: '0117', subscriber: /^4960\d{3}$/, area: 'Bristol' , first: '0117 496 0000' },
  { code: '0118', subscriber: /^4960\d{3}$/, area: 'Reading' , first: '0118 496 0000' },
  { code: '0121', subscriber: /^4960\d{3}$/, area: 'Birmingham' , first: '0121 496 0000' },
  { code: '0131', subscriber: /^4960\d{3}$/, area: 'Edinburgh' , first: '0131 496 0000' },
  { code: '0141', subscriber: /^4960\d{3}$/, area: 'Glasgow' , first: '0141 496 0000' },
  { code: '0151', subscriber: /^4960\d{3}$/, area: 'Liverpool' , first: '0151 496 0000' },
  { code: '0161', subscriber: /^4960\d{3}$/, area: 'Manchester' , first: '0161 496 0000' },
  { code: '0191', subscriber: /^4980\d{3}$/, area: 'Tyneside/Durham/Sunderland' , first: '0191 498 0000' },
];

/**
 * A UK subscriber number is allowed only inside the reserved block. Note this **rejects** numbers that
 * look fake (`07700 123456` is a plausible mobile and somebody may hold it): the question is not
 * whether the digits look invented, it is whether anybody can be called on them.
 */
export function phoneProblem(raw: string): string | null {
  const digits = raw.replace(/[ ()\-.]/g, '');
  const national = digits.startsWith('+44') ? `0${digits.slice(3)}` : digits;
  if (!national.startsWith('0')) {
    return 'a telephone number outside the UK numbering plan — this audit has no reserved range for it, and a foreign subscriber number is somebody\'s number';
  }
  const range = DRAMA_RANGES.find((r) => national.startsWith(r.code) && r.subscriber.test(national.slice(r.code.length)));
  // No value is echoed: a phone number is the thing this rule is afraid of, and a log line is not
  // where one belongs. The length of the match is enough to tell a reader which token to look for.
  return range === undefined ? "a UK subscriber number outside Ofcom's reserved-for-drama ranges — somebody may hold it" : null;
}

/**
 * A digit run that announces itself as not real: one repeated digit, or an ascending or descending
 * run (`12345678`, `87654321`, `000000`). This is the only allowance the account and sort-code rules
 * make, and it is narrow on purpose — `49268731` is exactly as plausible as a real account and must
 * fire.
 */
export function isDeclaredFake(digits: string): boolean {
  const d = digits.replace(/\D/g, '');
  if (d.length < 2) return true;
  if (/^(\d)\1+$/.test(d)) return true;
  const codes = [...d].map((c) => c.charCodeAt(0));
  const step = (delta: number): boolean => codes.every((c, i) => i === 0 || c === (codes[i - 1] as number) + delta);
  return step(1) || step(-1);
}

/**
 * RFC 2606 reserves `example.com`, `example.net`, `example.org` and the TLDs `.test`, `.invalid` and
 * `.localhost` precisely so that documentation and tests cannot reach a domain somebody pays for. So
 * the question this rule asks of an address is not "does it look real" but "could it deliver", and it
 * is answered from the domain outwards: `a@payments.example.com` is safe, `a@nhs.net` is not.
 */
export function domainIsReserved(email: string): boolean {
  const domain = (email.slice(email.indexOf('@') + 1) || '').toLowerCase().replace(/\.$/, '');
  const labels = domain.split('.');
  const tld = labels[labels.length - 1] ?? '';
  if (tld === 'test' || tld === 'invalid' || tld === 'localhost') return true;
  return ['example.com', 'example.net', 'example.org'].includes(labels.slice(-2).join('.'));
}

/** Does this number pass the check-card issuers use? A card number that fails it is not a card number. */
function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let n = digits.charCodeAt(i) - 48;
    if (double) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    double = !double;
  }
  return sum % 10 === 0;
}

export const RULES: ShapeRule[] = [
  {
    name: 'phone_not_reserved_for_drama',
    pattern: /(?:\+44|\b0)\d[\d ()-]{7,14}\d/g,
    means: 'a telephone number a real person or organisation could be called on',
    clears: (m) => phoneProblem(m),
  },
  {
    name: 'email_outside_reserved_domains',
    // RFC 2606 reserves .example/.test/.invalid/.localhost precisely so documentation cannot reach a
    // live domain. Anything else is somebody's real mailbox, including a domain this project owns.
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]*\.[A-Za-z]{2,}\b/g,
    means: 'an email address, and its domain may deliver',
    clears: (m) => (domainIsReserved(m) ? null : 'an email address whose domain is not one RFC 2606 reserves, and a mailbox is a person\'s identifier'),
  },
  { name: 'uk_nhs_number', pattern: /\b\d{3}\s\d{3}\s\d{4}\b/g, means: 'a number in the shape the NHS uses for a patient' },
  { name: 'uk_national_insurance', pattern: /\b[A-Z]{2}\d{6}[A-D]\b/g, means: 'a number in the shape the UK uses for a person for tax' },
  { name: 'us_social_security', pattern: /\b\d{3}-\d{2}-\d{4}\b/g, means: 'a number in the shape the US uses for a person' },
  {
    name: 'payment_card',
    pattern: /\b\d{13,19}\b/g,
    means: 'a card number — Luhn-valid, so not a reference that happens to be long',
    clears: (m) => (luhnValid(m) ? `a Luhn-valid ${m.length}-digit number in card position` : null),
  },
  {
    name: 'bank_account_or_sort_code',
    pattern: /\b\d{2}-\d{2}-\d{2}\b|\b\d{8}\b/g,
    means: 'a UK sort code or account number',
    clears: (m) => (isDeclaredFake(m) ? null : `a ${m.replace(/\D/g, '').length}-digit account or sort code that does not announce itself as fake`),
  },
  {
    name: 'street_address',
    pattern: /\b\d{1,4}[A-Za-z]?\s+[A-Z][a-z']+(?:\s+[A-Z][a-z']+){0,3}\s(?:Road|Lane|Street|Avenue|Close|Grove|Way|Drive|Rise|Court|Terrace|Crescent|Place)\b/g,
    means: 'a house number on a named street, which is where a person lives',
  },
  {
    name: 'date_of_birth',
    // Three written forms, and only after a birth-date label: `Date of issue: 2 February 2026` is the
    // shape every letter in the corpus uses, so a bare date must never fire this rule.
    pattern: /\b(?:date of birth|dob)\b\W{0,8}(?:\d{1,2}([/-])\d{1,2}\1\d{4}|\d{1,2}\s\w{3,9}\s\d{4}|\d{4}-\d{1,2}-\d{1,2})/gi,
    means: 'a birth date attached to a person',
  },
  {
    name: 'coordinates',
    pattern: /-?\d{1,3}\.\d{4,}\s*,?\s*-?\d{1,2}\.\d{4,}/g,
    means: 'a coordinate pair to four decimals, which is a doorstep rather than a city',
  },
  {
    name: 'uk_postcode',
    pattern: /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/g,
    means: 'a UK postcode, which with a house number is an address and alone is a handful of doors',
  },
];

export interface Finding {
  rule: string;
  means: string;
  /** Where it was found — a file and field path, never the surrounding document. */
  source: string;
  /** Length of the match. Like R-06, the auditor of personal data does not print personal data. */
  length: number;
}

/** Every rule against one string. A `clears` that returns a reason is a finding, not an exemption. */
export function scanText(value: string, source: string): Finding[] {
  const found: Finding[] = [];
  for (const rule of RULES) {
    rule.pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = rule.pattern.exec(value)) !== null) {
      const text = match[0] as string;
      if (rule.clears) {
        const reason = rule.clears(text);
        if (reason === null) continue;
        found.push({ rule: rule.name, means: reason, source, length: text.length });
        continue;
      }
      found.push({ rule: rule.name, means: rule.means, source, length: text.length });
      if (text.length === 0) rule.pattern.lastIndex += 1;
    }
  }
  return found;
}

/* ---------------------------------------------------------------- stage 4 ---- */

export interface JpegSegment {
  marker: number;
  /** The printable identifier at the start of the payload, e.g. `Exif`, `ICC_PROFILE`, `Adobe`. */
  identifier: string;
}

const APP = new Set([0xe0, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xeb, 0xec, 0xed, 0xee, 0xef]);

/**
 * Walk the marker segments before the first start-of-scan. Byte-exact and no dependency: `FF <n>` then a
 * big-endian length that counts itself, then that many bytes minus two. Restart markers and SOS need no
 * length, and the entropy data after SOS is not a segment table — which is where a hidden EXIF block
 * would have to be inserted illegally, so stopping at SOS loses nothing this item claims.
 */
export function readJpegSegments(buf: Buffer): JpegSegment[] {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return [];
  const segments: JpegSegment[] = [];
  let i = 2;
  while (i + 3 < buf.length) {
    if (buf[i] !== 0xff) break;
    const marker = buf[i + 1] as number;
    if (marker === 0xda || marker === 0xd9) break; // start of scan / end of image
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = buf.readUInt16BE(i + 2);
    const payload = buf.subarray(i + 4, i + 2 + length);
    const printable = [...payload.subarray(0, 24)].filter((b) => b >= 0x20 && b < 0x7f);
    segments.push({ marker, identifier: String.fromCharCode(...printable).replace(/\x00.*$/s, '').slice(0, 24) });
    i += 2 + length;
  }
  return segments;
}

/** The blocks a camera or an editing pipeline writes and a drawn image has no reason to own. */
export function identityMarkers(segments: JpegSegment[]): string[] {
  const named: Record<number, string> = {
    0xe1: 'APP1 (EXIF or XMP — where a camera writes Make, Model, GPSInfo and timestamps)',
    0xed: 'APP13 (Adobe photo information — where Photoshop writes authorship)',
    0xfe: 'COM (a JPEG comment segment — where an export tool writes its own name)',
  };
  const hits = segments.filter((s) => named[s.marker] !== undefined || (APP.has(s.marker) && /Exif|http:\/\/ns\.adobe|Adobe|GPS/i.test(s.identifier)));
  return [...new Set(hits.map((s) => named[s.marker] ?? `${s.marker.toString(16)} (${s.identifier})`))];
}

export interface PageLink {
  /** `public/sample-docs/photographs/page-1.jpg` as the recorded fixture names it. */
  imageFile: string;
  fixtureKey: string;
  preparedBytes?: number;
  fixture: string;
}

export function pngOrJpeg(buf: Buffer): 'jpeg' | 'png' | 'other' {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8) return 'jpeg';
  if (buf.length > 8 && buf.subarray(0, 8).toString('hex') === '89504e470d0a1a0a') return 'png';
  return 'other';
}

/** A PNG's identity lives in its tEXt/iTXt/eXIf chunks; a drawn PNG from Playwright carries none. */
export function pngChunkNames(buf: Buffer): string[] {
  const names: string[] = [];
  let i = 8;
  while (i + 8 <= buf.length) {
    const length = buf.readUInt32BE(i);
    const name = buf.subarray(i + 4, i + 8).toString('latin1');
    if (!/^[a-zA-Z]{4}$/.test(name)) break;
    names.push(name);
    i += 12 + length;
    if (name === 'IEND') break;
  }
  return names;
}

/* ------------------------------------------------------------------ main ---- */

function flag(name: string): string | undefined {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`${name}=`));
  return hit?.slice(name.length + 1);
}

function listFiles(root: string): string[] {
  const walk = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...walk(path));
      else if (entry.isFile()) out.push(relative(root, path).split(/[\\/]/).join('/'));
    }
    return out;
  };
  return CORPUS_ROOTS.filter((r) => {
    try {
      return statSync(join(root, r)).isDirectory();
    } catch {
      return false;
    }
  }).flatMap((r) => walk(join(root, r)));
}

function main(): void {
  const verbose = process.argv.slice(2).includes('--verbose');
  const root = flag('--root') ? resolve(flag('--root') as string) : resolve(import.meta.dirname, '..');
  const problems: string[] = [];

  /* Stage 1 — every file in the corpus has to be something this audit knows. */
  const tree = classifyTree(listFiles(root));
  const unknown = tree.filter((f) => f.kind === 'unclassified');
  for (const file of unknown) problems.push(`unclassified corpus file: ${file.path} — tell R-07 whether it is authored, recorded or a photograph`);

  /* Stage 2a — the authored corpus, straight from the object the app replays. */
  const authored = collectStrings(FIXTURE_CASES, 'cases.ts');
  const declared = declarationProblems(FIXTURE_CASES);
  problems.push(...declared);

  /* Stage 2b/4 — recorded fixtures and the photographs they key on. */
  let recorded = 0;
  const pages: PageLink[] = [];
  for (const file of tree.filter((f) => f.kind === 'recorded' && f.path.endsWith('.json'))) {
    const doc = JSON.parse(readFileSync(join(root, file.path), 'utf8')) as unknown;
    const p = (doc as { _provenance?: Record<string, unknown> })._provenance;
    const problemsHere = provenanceProblems(file.path, doc);
    problems.push(...problemsHere);
    if (problemsHere.length === 0) recorded += 1;
    if (typeof p?.imageFile === 'string' && typeof p?.fixtureKey === 'string') {
      const prepared = p.prepared as { bytes?: number } | undefined;
      pages.push({ imageFile: p.imageFile, fixtureKey: p.fixtureKey, preparedBytes: prepared?.bytes, fixture: file.path });
    }
  }

  /* Stage 3 — the shape rules over every string of every corpus file, field names included. */
  const findings: Finding[] = [];
  let walked = 0;
  for (const item of authored) {
    walked += 1;
    findings.push(...scanText(item.value, item.field));
  }
  for (const file of tree.filter((f) => f.kind !== 'photograph')) {
    if (file.kind === 'recorded' && file.path.endsWith('.json')) {
      const doc = JSON.parse(readFileSync(join(root, file.path), 'utf8'));
      for (const item of collectStrings(doc, file.path)) {
        walked += 1;
        findings.push(...scanText(item.value, item.field));
      }
      continue;
    }
    walked += 1;
    findings.push(...scanText(readFileSync(join(root, file.path), 'utf8'), file.path));
  }
  problems.push(...findings.map((f) => `${f.rule} (${f.means}, ${f.length} chars) in ${f.source}`));

  /* Stage 4 — bytes, and the hash that binds them to what Demo mode answers for. */
  const photographed = tree.filter((f) => f.kind === 'photograph');
  for (const page of pages) {
    const path = join(root, page.imageFile);
    let buf: Buffer;
    try {
      buf = readFileSync(path);
    } catch {
      problems.push(`${page.fixture}: names ${page.imageFile}, which is not in this checkout — the demo answers for bytes nobody can see`);
      continue;
    }
    const sha = createHash('sha256').update(buf).digest('hex');
    if (sha !== page.fixtureKey) problems.push(`${page.imageFile}: SHA-256 is not the ${page.fixture} keys on, so the audited bytes are not the bytes Demo mode replays`);
    if (page.preparedBytes !== undefined && page.preparedBytes !== buf.length) {
      problems.push(`${page.imageFile}: the recorded fixture says ${page.preparedBytes} bytes, the file is ${buf.length}`);
    }
    if (pngOrJpeg(buf) === 'jpeg') {
      const identity = identityMarkers(readJpegSegments(buf));
      for (const marker of identity) problems.push(`${page.imageFile}: carries ${marker} — a document drawn for a test has no camera to describe`);
    }
    const stray = pngChunkNames(buf).filter((n) => /tEXt|iTXt|eXIf|zTXt/.test(n));
    if (stray.length > 0) problems.push(`${page.imageFile}: carries the PNG metadata chunks ${stray.join(', ')} — same reason`);
  }
  for (const photo of photographed) {
    if (!pages.some((p) => p.imageFile === photo.path)) {
      problems.push(`${photo.path}: no recorded fixture keys on its bytes, so Demo mode cannot be the thing that uses it — R-07 will not guess what it is`);
    }
  }

  const counts = new Map<string, number>();
  for (const f of findings) counts.set(f.rule, (counts.get(f.rule) ?? 0) + 1);

  console.log(`synthetic-audit — out of scope by declaration: ${OUT_OF_SCOPE.map((o) => `${o.root} (${o.because})`).join('; ')}`);
  console.log(
    `synthetic-audit — ${tree.length} corpus files classified, ${walked} strings walked by the ${RULES.length} shape rules, ` +
      `${recorded} recorded fixtures with signature-verified provenance, ${pages.length} photographs bound by SHA-256, ` +
      `${FIXTURE_CASES.length - declared.length}/${FIXTURE_CASES.length} documents declaring themselves synthetic in their own text`,
  );
  if (verbose) for (const rule of RULES) console.log(`  ${rule.name.padEnd(30)} ${counts.get(rule.name) ?? 0} match(es) — ${rule.means}`);

  if (problems.length > 0) {
    console.error(`\nR-07 FAILED — ${problems.length} problem(s):`);
    for (const problem of problems) console.error(`  · ${problem}`);
    console.error('This audit reports a match as rule, source and length: it does not print the text it matched, because a real identifier in a log line is the thing it exists to prevent.');
    process.exit(1);
  }
  console.log(
    `\nR-07 OK — every file in the sample-document corpus is classified, every document says in its own text that it is synthetic,` +
      `\n  every recorded fixture carries a signature-verified provenance block, every photograph's bytes are the bytes Demo mode keys on,` +
      `\n  and no personal-data shape is anywhere in it. Phone numbers are allowed only inside Ofcom's reserved-for-drama ranges.`,
  );
  console.log(
    'Outside this audit, and not excused by it: whether an invented name belongs to something real is a lookup, not a shape; and nothing here can see a document a person typed into a live run, which is AGENTS §4 rule 7 (never persisted) and R-06 (never committed) instead.',
  );
}

if (process.argv[1] !== undefined && import.meta.filename === resolve(process.argv[1])) main();
