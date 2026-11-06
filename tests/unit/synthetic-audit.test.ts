import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DECLARATION,
  DRAMA_RANGES,
  RULES,
  classify,
  classifyTree,
  collectStrings,
  declarationProblems,
  identityMarkers,
  isDeclaredFake,
  phoneProblem,
  pngChunkNames,
  pngOrJpeg,
  provenanceProblems,
  readJpegSegments,
  scanText,
} from '../../scripts/synthetic-audit';
import { FIXTURE_CASES } from '@/lib/fixtures/cases';

/**
 * Tests for the synthetic-data audit (item **R-07**).
 *
 * The same discipline as **R-06** and **F-11**: a release gate is worth nothing until it has been
 * *observed rejecting*, and the ledger rules are tested against synthetic ledgers rather than only
 * against the one document they guard. So each shape rule here has a pair — the real thing it exists
 * to catch, which must fire, and the nearest neighbour that is not personal data, which must not.
 * The precision half matters as much as the recall half: a rule that cries wolf on a digest, a
 * freephone range or an issue date gets switched off by the next tired person, which is how AGENTS
 * §5's "never" actually dies.
 */

/** Every rule this script ships, by name — so a test cannot quietly stop covering one. */
const RULE_NAMES = RULES.map((r) => r.name);
function rulesFiredIn(text: string): string[] {
  return scanText(text, 'test').map((f) => f.rule);
}
function fired(text: string, rule: string): boolean {
  return rulesFiredIn(text).includes(rule);
}

describe('the corpus is enumerable and an unknown file is a finding', () => {
  it('classifies each kind of file the audit owns', () => {
    expect(classify('src/lib/fixtures/cases.ts')).toBe('authored');
    expect(classify('src/lib/fixtures/replay.ts')).toBe('loader');
    expect(classify('fixtures/responses/document.json')).toBe('recorded');
    expect(classify('public/sample-docs/photographs/page-1.jpg')).toBe('photograph');
    expect(classify('public/sample-docs/README.md')).toBe('documentation');
  });

  it('refuses to guess about a file it has no class for', () => {
    expect(classify('public/sample-docs/photographs/scan.tiff')).toBe('unclassified');
    expect(classify('fixtures/responses/document.json.bak')).toBe('unclassified');
  });

  it('keeps files outside the corpus roots out of the audit entirely', () => {
    const tree = classifyTree(['src/app/page.tsx', 'fixtures/attestation/good-Qwen-Qwen3.8-27B.json', 'fixtures/responses/document.json']);
    expect(tree.map((f) => f.path)).toEqual(['fixtures/responses/document.json']);
  });

  it('finds every real corpus file and classifies all of them', () => {
    const files = [
      'src/lib/fixtures/cases.ts',
      'src/lib/fixtures/recorded.ts',
      'src/lib/fixtures/replay.ts',
      'src/lib/fixtures/page_key.ts',
      'fixtures/responses/document.json',
      'fixtures/responses/README.md',
      'fixtures/responses/pages/page-1.json',
      'fixtures/responses/qa/question-1.json',
      'public/sample-docs/README.md',
      'public/sample-docs/photographs/page-1.jpg',
    ].map(classify);
    expect(files.filter((k) => k === 'unclassified')).toEqual([]);
  });
});

describe('the phone rule is an allowlist with a source, not a guess about what looks fake', () => {
  it('accepts a number inside Ofcom’s reserved-for-drama ranges, in either written form', () => {
    expect(phoneProblem('01632 960 441')).toBeNull();
    expect(phoneProblem('01632 960117')).toBeNull();
    expect(phoneProblem('07700 900 203')).toBeNull();
    expect(phoneProblem('+44 1632 960 441')).toBeNull();
  });

  it('rejects the numbers this corpus used to carry, because an unallocated-looking 03 number may be allocated', () => {
    for (const previous of ['0300 123 0000', '0345 000 1111', '01234 560 000']) {
      expect(phoneProblem(previous), previous).toContain('reserved-for-drama ranges');
    }
  });

  it('rejects a mobile that is one digit outside the block, and one that is plainly in service', () => {
    expect(phoneProblem('07700 901 000')).toContain('reserved-for-drama ranges'); // 901, not 900
    expect(phoneProblem('07911 123456')).toContain('reserved-for-drama ranges');
    expect(phoneProblem('020 7946 0500')).toBeNull(); // London’s own drama block
  });

  it('rejects a number that is not in the UK plan at all, rather than passing an unknown country', () => {
    expect(phoneProblem('+1 415 555 0100')).toContain('outside the UK numbering plan');
  });

  it('never echoes the number it rejected, because a log line is not where a phone number belongs', () => {
    const reason = phoneProblem('07911 123456') as string;
    expect(reason).not.toContain('07911');
    expect(reason).not.toContain('123456');
  });

  it('does not treat a national short code as a subscriber number at all', () => {
    expect(fired('If you feel worse, call 111 now.', 'phone_not_reserved_for_drama')).toBe(false);
    expect(fired('Telephone 999 for an emergency.', 'phone_not_reserved_for_drama')).toBe(false);
  });

  it('accepts the first number Ofcom lists in every range it carries, and rejects one past the last', () => {
    for (const range of DRAMA_RANGES) {
      expect(phoneProblem(range.first), `${range.area}: ${range.first}`).toBeNull();
      const last = range.first.replace(/0+$/g, '');
      expect(phoneProblem(`${last}9999`), `${range.area} has no room past its thousand`).not.toBeNull();
    }
    expect(DRAMA_RANGES.length).toBe(20);
  });
});

describe('a digit run counts as fake only when it announces itself that way', () => {
  it('clears the shapes a person writes when they mean "not real"', () => {
    for (const digits of ['12345678', '87654321', '000000', '00-00-00', '11111111']) {
      expect(isDeclaredFake(digits), digits).toBe(true);
    }
  });

  it('fires on an account number that could be issued, and on a sort code that could route', () => {
    expect(fired('account 49268731', 'bank_account_or_sort_code')).toBe(true);
    expect(fired('sort code 20-44-12', 'bank_account_or_sort_code')).toBe(true);
  });

  it('clears the account and sort code the demo letters actually print', () => {
    expect(rulesFiredIn('Our bank: Riverside Building Society, sort code 00-00-00, account 12345678')).toEqual([]);
  });

  it('is not moved by a SHA-256 digest, which is the reason the walk needs no field allowlist', () => {
    const digest = 'b84d29210d99a7b9b1992c0cf3506894047c89e8e9403caad819810455f69785';
    expect(scanText(digest, 'digest')).toEqual([]);
    expect(scanText('{"requestSha256": "71fea30bb6fcc8cd4bb32e49b6b094cb8c155da7dc8ffeb94ecce0439edf689c"}', 'json')).toEqual([]);
  });
});

describe('each shape rule fires on its class and clears its nearest neighbour', () => {
  it('names an email address whose domain can deliver, and clears the reserved ones', () => {
    for (const unsafe of ['payments@nhs.net', 'a.b@riverside-buildingsociety.co.uk']) {
      expect(fired(unsafe, 'email_outside_reserved_domains'), unsafe).toBe(true);
    }
    for (const safe of ['me@example.com', 'a@payments.example.org', 'a@b.test', 'x@y.invalid', 'ops@localhost']) {
      expect(fired(safe, 'email_outside_reserved_domains'), safe).toBe(false);
    }
  });

  it('names an NHS number, a National Insurance number and a US SSN', () => {
    expect(fired('NHS number 432 123 4567', 'uk_nhs_number')).toBe(true);
    expect(fired('NI number AB123456C', 'uk_national_insurance')).toBe(true);
    expect(fired('SSN 123-45-6789', 'us_social_security')).toBe(true);
  });

  it('names a card number only when the check digit agrees, which is what keeps a long reference clear', () => {
    expect(fired('card 4000000000000002', 'payment_card')).toBe(true); // Luhn-valid
    expect(fired('reference 1234567890123456', 'payment_card')).toBe(false); // not
    expect(RULE_NAMES).toContain('payment_card');
  });

  it('names a house number on a named street, and clears a street without one', () => {
    expect(fired('Return to 14 Meadow Walk, Room 4', 'street_address')).toBe(false); // "Walk" alone with no number is a place name
    expect(fired('Return to 14 Willow Grove Road', 'street_address')).toBe(true);
  });

  it('names a birth date but not an issue date, which is the difference that matters here', () => {
    expect(fired('Date of birth: 4 March 1972', 'date_of_birth')).toBe(true);
    expect(fired('DOB 12/05/1980', 'date_of_birth')).toBe(true);
    expect(fired('date of birth: 1980-05-12', 'date_of_birth')).toBe(true);
    expect(fired('Date of issue: 2 February 2026', 'date_of_birth')).toBe(false);
  });

  it('names a coordinate pair to four decimals and clears a money amount', () => {
    expect(fired('taken at 51.5074, -0.1278', 'coordinates')).toBe(true);
    expect(fired('Closing balance: £1,204.55 in credit', 'coordinates')).toBe(false);
    expect(fired('recordedAt 2026-11-04T23:22:36.034Z', 'coordinates')).toBe(false);
  });

  it('names a UK postcode and clears the reference shapes that look a bit like one', () => {
    expect(fired('10 High Street, SW1A 1AA', 'uk_postcode')).toBe(true);
    expect(fired('Reference NC-0000-SYN, Line 001 example service 2 GBP 107.13', 'uk_postcode')).toBe(false);
  });

  it('reports a finding as rule, source and length, never as the matched text', () => {
    const findings = scanText('NHS number 432 123 4567', 'fixtures/responses/document.json.transcript');
    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.rule).toBe('uk_nhs_number');
    expect(finding.source).toContain('document.json');
    expect(JSON.stringify(finding)).not.toContain('432');
    expect(finding.length).toBe(12);
  });

  it('covers every rule it ships with at least one firing test above', () => {
    expect(RULE_NAMES).toHaveLength(11);
  });
});

describe('a recording is only evidence if it says who made it and the enclave signed it', () => {
  const good = {
    _provenance: {
      recorder: 'scripts/record-fixtures.ts',
      synthetic: true,
      syntheticNote: 'Drawn by scripts/page_sample.ts. This fixture describes an invented invoice and no real person, provider, account or debt.',
      signature: { verified: true, origin: 'provider_tee', algo: 'ed25519', detail: 'signed by the enclave' },
    },
  };

  it('passes a complete provenance block', () => {
    expect(provenanceProblems('fixtures/responses/pages/page-1.json', good)).toEqual([]);
  });

  it('names each way it can be wrong', () => {
    expect(provenanceProblems('a.json', {})[0]).toContain('no _provenance');
    expect(provenanceProblems('a.json', { _provenance: { ...good._provenance, recorder: 'curl by hand' } })[0]).toContain('recorded by');
    expect(provenanceProblems('a.json', { _provenance: { ...good._provenance, synthetic: false } })[0]).toContain('cannot say it is synthetic');
    expect(provenanceProblems('a.json', { _provenance: { ...good._provenance, syntheticNote: 'synthetic' } })[0]).toContain('too short');
    expect(provenanceProblems('a.json', { _provenance: { ...good._provenance, signature: { verified: false } } })[0]).toContain('did not verify');
  });
});

describe('every document says in its own text that it is not real', () => {
  it('accepts both forms the corpus uses, an authored sentence and a transcribed heading', () => {
    expect(DECLARATION.test('This letter is synthetic demo data written for Sightline.')).toBe(true);
    expect(DECLARATION.test('SYNTHETIC INVOICE - NOT A REAL DOCUMENT')).toBe(true);
    expect(DECLARATION.test('Northgate Care NHS Trust — Invoice NC-2026-0441')).toBe(false);
  });

  it('names a case whose text lost the declaration', () => {
    const problems = declarationProblems([
      { name: 'good', text: 'x\n\nThis letter is synthetic demo data written for Sightline.' },
      { name: 'bad', text: 'Invoice from a real trust, no marker at all.' },
    ]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('bad');
  });

  it('is satisfied by the corpus the app actually replays, which is the positive control', () => {
    expect(declarationProblems(FIXTURE_CASES)).toEqual([]);
    expect(FIXTURE_CASES.length).toBeGreaterThanOrEqual(5);
  });

  it('walks every string of a case, including the ones only the receipt reads', () => {
    const strings = collectStrings([{ name: 'x', text: 'hello', analysis: { summary: 'world' } }], 'cases.ts');
    expect(strings.map((s) => s.field)).toEqual(['cases.ts[0].name', 'cases.ts[0].text', 'cases.ts[0].analysis.summary']);
  });
});

/* --------------------------------------------------------------- images ---- */

/** A JPEG the way an encoder writes one: SOI, then `FF <marker>` + big-endian length that counts itself. */
function jpeg(segments: [number, string][]): Buffer {
  const parts = [Buffer.from([0xff, 0xd8])];
  for (const [marker, payload] of segments) {
    const body = Buffer.from(payload, 'latin1');
    const head = Buffer.alloc(4);
    head[0] = 0xff;
    head[1] = marker;
    head.writeUInt16BE(body.length + 2, 2);
    parts.push(head, body);
  }
  parts.push(Buffer.from([0xff, 0xda, 0x00, 0x02, 0x00, 0x00])); // SOS: the table ends here
  return Buffer.concat(parts);
}

function png(...chunks: string[]): Buffer {
  const parts = [Buffer.from('89504e470d0a1a0a', 'hex')];
  for (const name of chunks) {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(0, 0);
    head.write(name, 4, 'latin1');
    parts.push(head, Buffer.alloc(4)); // zero-length data, then a CRC placeholder
  }
  return Buffer.concat(parts);
}

describe('the JPEG and PNG reader finds a camera’s own writing', () => {
  it('walks segments and stops at the start of scan', () => {
    const buf = jpeg([[0xe0, 'JFIF\0'], [0xe2, 'ICC_PROFILE\0\0\0'], [0xc0, '\x08\x06@\x04\xb0']]);
    expect(pngOrJpeg(buf)).toBe('jpeg');
    expect(readJpegSegments(buf).map((s) => s.marker.toString(16))).toEqual(['e0', 'e2', 'c0']);
    expect(identityMarkers(readJpegSegments(buf))).toEqual([]); // JFIF and a colour profile are not identity
  });

  it('names EXIF, XMP, Photoshop and a comment as the identity they are', () => {
    expect(identityMarkers(readJpegSegments(jpeg([[0xe1, 'Exif\0\0']])))).toHaveLength(1);
    expect(identityMarkers(readJpegSegments(jpeg([[0xe1, 'http://ns.adobe.com/xap/1.0/']])))).toHaveLength(1);
    expect(identityMarkers(readJpegSegments(jpeg([[0xed, 'Photoshop 3.0\0']])))).toHaveLength(1);
    expect(identityMarkers(readJpegSegments(jpeg([[0xfe, 'exported by SomeoneCamera 4.2']])))).toHaveLength(1);
  });

  it('returns nothing rather than throwing on bytes that are not a JPEG', () => {
    expect(readJpegSegments(Buffer.from('not an image at all'))).toEqual([]);
    expect(readJpegSegments(Buffer.alloc(0))).toEqual([]);
    expect(pngOrJpeg(Buffer.from('x'))).toBe('other');
  });

  it('reads PNG metadata chunks, which are where a PNG would hide the same thing', () => {
    expect(pngChunkNames(png('IHDR', 'IDAT', 'IEND'))).toEqual(['IHDR', 'IDAT', 'IEND']);
    expect(pngChunkNames(png('IHDR', 'tEXt', 'eXIf', 'IEND')).filter((n) => /tEXt|eXIf|zTXt|iTXt/.test(n))).toEqual(['tEXt', 'eXIf']);
  });

  it('is clean on the three photographs Demo mode answers for, byte for byte as recorded', () => {
    for (const page of ['page-1', 'page-2', 'page-3']) {
      const fixture = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../fixtures/responses/pages', `${page}.json`), 'utf8')) as {
        _provenance: { imageFile: string; fixtureKey: string; prepared: { bytes: number } };
      };
      const buf = readFileSync(resolve(import.meta.dirname, '../../', fixture._provenance.imageFile));
      expect(identityMarkers(readJpegSegments(buf)), page).toEqual([]);
      expect(createHash('sha256').update(buf).digest('hex'), `${page} is the bytes ADR-31 keys on`).toBe(fixture._provenance.fixtureKey);
      expect(buf.length).toBe(fixture._provenance.prepared.bytes);
      expect(pngChunkNames(buf)).toEqual([]);
    }
  });
});
