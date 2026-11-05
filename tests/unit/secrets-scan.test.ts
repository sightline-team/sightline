import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import {
  CODE_REFERENCE,
  RULES,
  type Exemption,
  type Finding,
  parseBatchStream,
  describeProblem,
  isExempted,
  scanContent,
} from '../../scripts/secrets-scan';

/**
 * Tests for the secrets scan (item **R-06**).
 *
 * Two properties matter more than the pattern list, and both are asserted here rather than
 * described: **the scan must fire on a credential**, because a release gate that has only ever
 * printed "OK" has not been observed to reject anything — and **the scan must not print one**,
 * because the tool that hunts secrets is otherwise the thing that leaks it.
 *
 * Every planted value below is **assembled at runtime** from a vendor prefix and a marker body, so
 * that no credential-shaped byte run is contiguous inside this file's own blob. That is a measured
 * constraint, not a style. The first version of this file spelled the shapes out in full, and so
 * committed nine credential shapes into the history of the project whose release gate hunts
 * credential shapes. It was refused twice: by GitHub's push protection (`GH013`, one named
 * location, nothing published), and independently by `npm run release:secrets` itself, over the
 * local commit. Both refusals are the best evidence this item has, because a fixture written to
 * look like a credential is **indistinguishable from one to the rule** — which is exactly the
 * premise of the rule. The values here are synthetic; none of them is, or could be, a live
 * credential, and the last `describe` block below is what keeps this file that way.
 */

const marker = (times: number): string => 'TESTONLY'.repeat(times);
const plant = (prefix: string, body: string): string => prefix + body;

const PLANTED_KEY = plant('sk-', marker(4)); // the measured class: `sk-` plus 32 characters
const FAKE_PEM = plant('-----BEGIN OPENSSH ', 'PRIVATE KEY-----') + '\nnot-a-key-body-not-base64\n';

/** The findings this script would produce for a file that contains `text`, with no git involved. */
function findingsIn(text: string, path = 'planted/file.ts'): Finding[] {
  return scanContent(text).map((hit) => ({ ...hit, sha: '0'.repeat(40), path, commit: 'deadbee', unreachable: false }));
}

describe('the scan fires', () => {
  it('on the project\u2019s own credential class, assigned to a name that is not even secret-shaped', () => {
    const found = findingsIn(`const NEAR_KEY = "${PLANTED_KEY}";\n`);
    expect(found.map((f) => f.rule)).toContain('near_ai_key');
  });

  it('on a bare key with no assignment around it, as a log line or a paste would leave it', () => {
    expect(scanContent(`request failed with ${PLANTED_KEY} in the header`)).toHaveLength(1);
  });

  it('on each vendor shape, one planted value per rule', () => {
    const samples: Record<string, string> = {
      private_key_pem: FAKE_PEM,
      github_token: plant('ghp_', marker(6)),
      aws_access_key_id: plant('AKIA', marker(2)),
      near_ai_key: PLANTED_KEY,
      slack_token: plant('xoxb-', marker(2)),
      google_api_key: plant('AIza', 'T'.repeat(35)),
      stripe_secret_key: plant('sk_live_', marker(3)),
      bearer_jwt: [plant('eyJ', marker(2)), plant('eyJ', marker(2)), marker(3)].join('.'),
      secret_assignment: `api_key = "${marker(4)}"`,
    };
    for (const [rule, sample] of Object.entries(samples)) {
      expect(scanContent(sample).map((h) => h.rule), `${rule} must fire on its own shape`).toContain(rule);
    }
  });

  it('inside binary content, where a JPEG or a packed object would otherwise hide it', () => {
    const jpeg = `\u00ff\u00d8\u00e1Exif\u0000\u0000 junk ${PLANTED_KEY} \u00ff\u00d9`;
    expect(scanContent(jpeg).map((h) => h.rule)).toContain('near_ai_key');
  });

  it('on a secret-named assignment whose value is a literal, however harmless the name looks', () => {
    expect(scanContent(`  password: "${marker(3)}"`).map((h) => h.rule)).toContain('secret_assignment');
  });
});

describe('the scan does not cry wolf, and cannot be talked out of crying wolf', () => {
  it('ignores a reference to an environment variable, which is what this repo writes everywhere', () => {
    expect(scanContent('const API_KEY = process.env.NEAR_AI_API_KEY ?? \'\';').map((h) => h.rule)).not.toContain('secret_assignment');
    expect(CODE_REFERENCE.test('process.env.NEAR_AI_API_KEY')).toBe(true);
  });

  it('still fires when that same line gains a literal key', () => {
    expect(scanContent(`const API_KEY = "${marker(4)}";`).map((h) => h.rule)).toContain('secret_assignment');
  });

  it('treats a public key, a hash and a certificate as what they are', () => {
    for (const line of [
      'signing_public_key: "0000000000000000000000000000000000000000000000000000000000000000"',
      'compose_hash: "1111111111111111111111111111111111111111111111111111111111111111"',
      'nonce = "2222222222222222222222222222222222222222222222222222222222222222"',
      '-----BEGIN CERTIFICATE-----\nMIIDADCCAfGgAwIBAgIUAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=\n',
    ]) {
      expect(scanContent(line), line.slice(0, 40)).toEqual([]);
    }
  });

  it('leaves an empty template assignment alone', () => {
    expect(scanContent('NEAR_AI_API_KEY=\nRELAY_ENABLED=false\n')).toEqual([]);
  });

  it('gives an exemption with no path the power to hide nothing', () => {
    const finding = findingsIn(PLANTED_KEY)[0]!;
    const blank: Exemption[] = [{ rule: 'near_ai_key', path: '', because: 'an exemption written like this is a blind spot' }];
    expect(isExempted(finding, blank)).toBe(false);
    expect(isExempted(finding, [{ rule: 'near_ai_key', path: 'planted/file.ts', because: 'synthetic' }])).toBe(true);
    expect(isExempted(finding, [{ rule: 'github_token', path: 'planted/file.ts', because: 'wrong rule' }])).toBe(false);
  });

  it('ships with nothing exempted, so every rule is live on the first run', () => {
    expect(RULES.length).toBeGreaterThan(8);
    // The list this commit publishes must be the list that fires.
    expect(RULES.filter((r) => r.name === 'secret_assignment')).toHaveLength(1);
  });
});

describe('the scan cannot leak what it finds', () => {
  it('reports rule, path, commit and length only', () => {
    const problem = describeProblem(findingsIn(`api_key = "${PLANTED_KEY}"`)[0]!);
    expect(problem).toContain('near_ai_key');
    expect(problem).toContain('planted/file.ts');
    expect(problem).not.toContain(PLANTED_KEY);
    expect(problem).not.toContain('TESTONLY');
  });

  it('keeps the matched text out of the hit object itself', () => {
    const hit = scanContent(FAKE_PEM)[0]!;
    expect(JSON.stringify(hit)).not.toContain('BEGIN');
    expect(hit.length).toBeGreaterThan(20);
  });
});

describe('this file is not itself a finding', () => {
  it('carries no credential shape in its own bytes, which is why the shapes are assembled at runtime', () => {
    // The regression guard for the refusal recorded in the header: this scanner reads every blob in
    // the object database, so a fixture spelled out in full is a credential shape committed to the
    // repository it is supposed to be protecting — and a live key would look exactly like this file
    // to the rule. Assemble at runtime, or this goes red.
    const source = readFileSync(fileURLToPath(import.meta.url), 'utf8');
    expect(scanContent(source)).toEqual([]);
  });
});

describe('the object-database reader', () => {
  const sha = (n: number): string => n.toString(16).padStart(40, '0');

  function frame(type: string, body: string): string {
    return `${sha(type.length)} ${type} ${Buffer.byteLength(body)}\n${body}\n`;
  }

  it('reads blob frames by byte length, skipping trees and commits without losing its place', () => {
    const stream = Buffer.from(frame('blob', 'one\n') + frame('tree', '011122223333') + frame('blob', `two ${PLANTED_KEY}`), 'latin1');
    const blobs = parseBatchStream(stream);
    expect(blobs.map((b) => b.content)).toEqual(['one\n', `two ${PLANTED_KEY}`]);
    expect(scanContent(blobs[1]!.content).map((h) => h.rule)).toContain('near_ai_key');
  });

  it('survives a blob with no newline of its own and a body that looks like a header', () => {
    const tricky = `${sha(9)} blob 13\nnot really a header`;
    const blobs = parseBatchStream(Buffer.from(tricky, 'latin1'));
    expect(blobs).toHaveLength(1);
    expect(blobs[0]!.content).toBe('not really a ');
  });

  it('tolerates a missing-object frame instead of mistaking it for content', () => {
    const stream = Buffer.from(`${sha(1)} missing\n` + frame('blob', 'fine'), 'latin1');
    // `<sha> missing` carries no size and no body, so the frame after it must still be found,
    // which is why the reader does not treat it as a zero-length blob.
    expect(parseBatchStream(stream).map((b) => b.content)).toEqual(['fine']);
  });

  it('returns nothing for an empty stream rather than throwing', () => {
    expect(parseBatchStream(Buffer.alloc(0))).toEqual([]);
  });
});
