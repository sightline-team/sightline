import { describe, expect, it } from 'vitest';
import {
  validateSubmissionPayload,
  SIGHTLINE_PROJECT_SUBMISSION_META,
  MAX_PAYLOAD_BYTES,
  NEAR_ADDRESS_REGEX,
  type SubmissionPayload,
} from '@/lib/submission/payload';

describe('submission payload validation (X-04)', () => {
  const sampleValidPayload: SubmissionPayload = {
    requestId: 'a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d',
    projectName: SIGHTLINE_PROJECT_SUBMISSION_META.projectName,
    leadName: 'Adenike Ajala',
    email: 'adenikeajala2018@gmail.com',
    size: '1',
    tracks: ['privacy'],
    nearAddress: 'abrcrmb.near',
    projectUrl: SIGHTLINE_PROJECT_SUBMISSION_META.projectUrl,
    demoUrl: 'https://x.com/sightline_demo/status/1987654321098765432',
    idea: SIGHTLINE_PROJECT_SUBMISSION_META.idea,
    consent: true,
  };

  it('accepts a fully compliant submission payload', () => {
    const result = validateSubmissionPayload(sampleValidPayload);
    expect(result.valid).toBe(true);
    expect(result.payload).toEqual(sampleValidPayload);
    expect(result.byteLength).toBeDefined();
    expect(result.byteLength!).toBeLessThan(MAX_PAYLOAD_BYTES);
  });

  it('rejects the forbidden website spam-trap field', () => {
    const dirty = {
      ...sampleValidPayload,
      website: 'https://example.com/honeypot',
    };
    const result = validateSubmissionPayload(dirty);
    expect(result.valid).toBe(false);
    expect(result.errors?.some((e) => e.includes('website') || e.includes('unrecognized_keys'))).toBe(true);
  });

  it('rejects any unrecognized arbitrary fields', () => {
    const dirty = {
      ...sampleValidPayload,
      extraParam: 'disallowed',
    };
    const result = validateSubmissionPayload(dirty);
    expect(result.valid).toBe(false);
  });

  it('validates requestId as a valid UUID', () => {
    const invalidUuid = { ...sampleValidPayload, requestId: 'not-a-uuid-string' };
    const result = validateSubmissionPayload(invalidUuid);
    expect(result.valid).toBe(false);
    expect(result.errors?.some((e) => e.includes('requestId'))).toBe(true);
  });

  it('validates projectName length (2-80 characters)', () => {
    expect(validateSubmissionPayload({ ...sampleValidPayload, projectName: 'A' }).valid).toBe(false);
    expect(validateSubmissionPayload({ ...sampleValidPayload, projectName: 'A'.repeat(81) }).valid).toBe(false);
    expect(validateSubmissionPayload({ ...sampleValidPayload, projectName: 'A'.repeat(80) }).valid).toBe(true);
    expect(validateSubmissionPayload({ ...sampleValidPayload, projectName: 'Sightline' }).valid).toBe(true);
  });

  it('validates leadName length (2-80 characters)', () => {
    expect(validateSubmissionPayload({ ...sampleValidPayload, leadName: 'X' }).valid).toBe(false);
    expect(validateSubmissionPayload({ ...sampleValidPayload, leadName: 'X'.repeat(81) }).valid).toBe(false);
    expect(validateSubmissionPayload({ ...sampleValidPayload, leadName: 'Ada Lovelace' }).valid).toBe(true);
  });

  it('validates email format and maximum length', () => {
    expect(validateSubmissionPayload({ ...sampleValidPayload, email: 'invalid-email-address' }).valid).toBe(false);
    expect(validateSubmissionPayload({ ...sampleValidPayload, email: `${'a'.repeat(161)}@example.com` }).valid).toBe(false);
    expect(validateSubmissionPayload({ ...sampleValidPayload, email: 'valid.user@domain.org' }).valid).toBe(true);
  });

  it('validates team size to exact allowed values', () => {
    const allowed = ['1', '2 - 4', '4 - 6', '6 - 8', '8+'] as const;
    for (const size of allowed) {
      expect(validateSubmissionPayload({ ...sampleValidPayload, size }).valid).toBe(true);
    }

    const disallowed = ['2-4', '2 -4', 'single', 'solo', '3', '10', ''];
    for (const size of disallowed) {
      expect(validateSubmissionPayload({ ...sampleValidPayload, size: size as unknown as '1' }).valid).toBe(false);
    }
  });

  it('validates tracks array: must be non-empty, unique, and valid track IDs', () => {
    // Valid track
    expect(validateSubmissionPayload({ ...sampleValidPayload, tracks: ['privacy'] }).valid).toBe(true);

    // Empty tracks array
    expect(validateSubmissionPayload({ ...sampleValidPayload, tracks: [] }).valid).toBe(false);

    // Duplicated tracks
    expect(validateSubmissionPayload({ ...sampleValidPayload, tracks: ['privacy', 'privacy'] }).valid).toBe(false);

    // Unknown track
    expect(validateSubmissionPayload({ ...sampleValidPayload, tracks: ['unknown-track' as unknown as 'privacy'] }).valid).toBe(false);
  });

  describe('nearAddress regex and constraints', () => {
    it('accepts valid named and implicit NEAR accounts', () => {
      const validAccounts = [
        'alice.near',
        'bob_wallet.near',
        'charlie-dev.near',
        'sub.account.testnet',
        'my-team-123.near',
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef', // 64-char implicit
      ];

      for (const nearAddress of validAccounts) {
        expect(NEAR_ADDRESS_REGEX.test(nearAddress)).toBe(true);
        expect(validateSubmissionPayload({ ...sampleValidPayload, nearAddress }).valid).toBe(true);
      }
    });

    it('rejects uppercase, invalid punctuation, or out-of-bound NEAR accounts', () => {
      const invalidAccounts = [
        'Alice.near', // uppercase forbidden
        'TEAM.NEAR',
        'a', // min length is 2
        'a'.repeat(65), // max length is 64
        'invalid@char.near',
        'double..dots.near',
        '-leading-dash.near',
        '.leading-dot.near',
        'trailing-dash-.near',
      ];

      for (const nearAddress of invalidAccounts) {
        expect(validateSubmissionPayload({ ...sampleValidPayload, nearAddress }).valid).toBe(false);
      }
    });
  });

  it('validates URL formatting and length for projectUrl and demoUrl', () => {
    expect(validateSubmissionPayload({ ...sampleValidPayload, projectUrl: 'not-a-url' }).valid).toBe(false);
    expect(validateSubmissionPayload({ ...sampleValidPayload, demoUrl: 'not-a-url' }).valid).toBe(false);
    expect(validateSubmissionPayload({ ...sampleValidPayload, projectUrl: `https://${'a'.repeat(305)}.com` }).valid).toBe(false);
  });

  it('validates idea length (20-2000 characters)', () => {
    expect(validateSubmissionPayload({ ...sampleValidPayload, idea: 'Short idea' }).valid).toBe(false); // < 20 chars
    expect(validateSubmissionPayload({ ...sampleValidPayload, idea: 'X'.repeat(2001) }).valid).toBe(false); // > 2000 chars
    expect(validateSubmissionPayload({ ...sampleValidPayload, idea: 'Valid description of Sightline built for NEAR Hackathon.' }).valid).toBe(true);
  });

  it('requires explicit consent: true', () => {
    expect(validateSubmissionPayload({ ...sampleValidPayload, consent: false as unknown as true }).valid).toBe(false);
  });

  it('enforces total payload size cap <= 12,000 bytes', () => {
    const normalResult = validateSubmissionPayload(sampleValidPayload);
    expect(normalResult.byteLength!).toBeLessThan(MAX_PAYLOAD_BYTES);

    // Construct a payload whose idea is just under 2000 chars and verify it fits well within 12,000 bytes
    const fullIdeaPayload = {
      ...sampleValidPayload,
      idea: 'A'.repeat(1999),
    };
    const fullResult = validateSubmissionPayload(fullIdeaPayload);
    expect(fullResult.valid).toBe(true);
    expect(fullResult.byteLength!).toBeLessThan(MAX_PAYLOAD_BYTES);
  });
});
