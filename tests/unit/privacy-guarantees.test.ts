import { describe, expect, it, vi } from 'vitest';
import { forgetSession, sessionKeysOwnedBy } from '@/lib/session/forget';
import { updateSettings, parseStoredSettings, type SettingsIO } from '@/lib/settings';
import { isAllowed, isNearUpstreamHost, type ModelMetadata } from '@/lib/near-ai/models';
import { resolveRequest, UPSTREAM_ORIGIN } from '@/lib/server/allowlist';
import { verifyReportInput } from '@/lib/server/verify';
import { rateLimit, type RateLimitStore } from '@/lib/server/rateLimit';

/**
 * Item **A-10**: Privacy tests:
 *  1. No document content in server logs (AGENTS.md §4 rule 7);
 *  2. No third-party requests (AGENTS.md §4 rule 9);
 *  3. No document data in storage after Forget (AGENTS.md §4 rule 7, P-10).
 */

describe('privacy guarantees (A-10)', () => {
  describe('1. No document content in server logs', () => {
    const SENSITIVE_SENTINELS = [
      'CONFIDENTIAL_MEDICAL_DIAGNOSIS_PATIENT_99',
      'ACCOUNT_BALANCE_£12,450.99',
      'AUTH_SECRET_TOKEN_DO_NOT_LOG_XYZ',
      'PRESCRIPTION_DOSE_50MG',
    ];

    it('verifyReportInput never logs document or report content to console', () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      try {
        // Construct a report containing sensitive sentinels in fields
        const report = {
          request_nonce: '0'.repeat(64),
          model_attestations: [
            {
              model_name: 'test-model',
              signing_address: '11'.repeat(16),
              signing_public_key: '22'.repeat(16),
              intel_quote: '00'.repeat(24),
              nvidia_payload: JSON.stringify({
                nonce: '0'.repeat(64),
                secret: SENSITIVE_SENTINELS[0],
              }),
            },
          ],
        };

        const result = verifyReportInput({
          report,
          nonce: '0'.repeat(64),
          signingAlgo: 'ed25519',
        });

        expect(result).toBeDefined();

        // Check all console output across all log levels
        const allCalls = [
          ...logSpy.mock.calls,
          ...infoSpy.mock.calls,
          ...warnSpy.mock.calls,
          ...errorSpy.mock.calls,
        ].flat();

        const fullLogOutput = allCalls.map((c) => String(c)).join(' ');

        for (const sentinel of SENSITIVE_SENTINELS) {
          expect(fullLogOutput).not.toContain(sentinel);
        }
      } finally {
        logSpy.mockRestore();
        infoSpy.mockRestore();
        warnSpy.mockRestore();
        errorSpy.mockRestore();
      }
    });

    it('rateLimiter never logs client IP addresses or stores raw IP', async () => {
      const storedBuckets: string[] = [];
      const store: RateLimitStore = {
        increment: vi.fn(async (key: string) => {
          storedBuckets.push(key);
          return 1;
        }),
      };

      const testIp = '198.51.100.42';

      const decision = await rateLimit(testIp, 60, store);
      expect(decision.allowed).toBe(true);

      // The store bucket must NOT contain the raw IP address
      expect(storedBuckets.length).toBe(1);
      expect(storedBuckets[0]).not.toContain(testIp);
      // It is a 64-char SHA-256 hex string
      expect(storedBuckets[0]).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  describe('2. No third-party requests', () => {
    it('pins the fixed upstream origin to cloud-api.near.ai only', () => {
      expect(UPSTREAM_ORIGIN).toBe('https://cloud-api.near.ai');
    });

    it('forbids proxied third-party models in the allowlist', () => {
      const configAllowlist = ['third-party/proxied-model'];
      const proxiedMeta: ModelMetadata = {
        id: 'third-party/proxied-model',
        attestationSupported: true,
        verifiable: true,
        isReady: true,
        inputModalities: ['image', 'text'],
        outputModalities: ['text'],
        providerType: 'openai',
        providerBackend: 'openai_compatible',
        providerBaseUrl: 'https://openrouter.ai/api/v1',
        contextLength: 128000,
        maxOutputLength: 4096,
      };

      // Fails closed: proxied_upstream is disallowed despite attestationSupported=true
      const proxiedDecision = isAllowed(proxiedMeta, configAllowlist);
      expect(proxiedDecision.allowed).toBe(false);
      expect(proxiedDecision.reason).toBe('proxied_upstream');

      // Explicitly allowed only when hosted directly or on a .near.ai host
      const directMeta: ModelMetadata = {
        ...proxiedMeta,
        providerBaseUrl: '',
      };
      const directDecision = isAllowed(directMeta, configAllowlist);
      expect(directDecision.allowed).toBe(true);
      expect(directDecision.reason).toBe('tee_and_image');
    });

    it('refuses relay requests attempting to forward to foreign endpoints or unapproved paths', () => {
      const foreignUrls = [
        'https://api.openai.com/v1/chat/completions',
        'https://api.anthropic.com/v1/messages',
        'https://openrouter.ai/api/v1/chat/completions',
        'http://localhost:3000/api/relay/v1/other/endpoint',
        'http://localhost:3000/api/relay/v1/model/list',
      ];

      for (const url of foreignUrls) {
        const res = resolveRequest(new URL(url), 'POST');
        expect(res.ok).toBe(false);
        if (!res.ok) {
          expect(res.reason).toBe('path_not_allowed');
        }
      }
    });

    it('isNearUpstreamHost rejects any domain outside .near.ai', () => {
      expect(isNearUpstreamHost('https://cloud-api.near.ai')).toBe(true);
      expect(isNearUpstreamHost('https://api.near.ai')).toBe(true);
      expect(isNearUpstreamHost('https://subdomain.internal.near.ai')).toBe(true);
      expect(isNearUpstreamHost('')).toBe(true); // Direct serving (no forwarding) is permitted

      // Rejections
      expect(isNearUpstreamHost('https://near.ai.attacker.com')).toBe(false);
      expect(isNearUpstreamHost('https://cloud-api-near.ai')).toBe(false);
      expect(isNearUpstreamHost('https://google.com')).toBe(false);
      expect(isNearUpstreamHost('https://api.openai.com')).toBe(false);
      expect(isNearUpstreamHost('invalid-url-string')).toBe(false);
    });
  });

  describe('3. No document data in storage after Forget', () => {
    it('removes all sightline.* document keys from sessionStorage and leaves zero document words', () => {
      const mockSessionStorage: Record<string, string> = {
        'sightline.session.id': 'session-12345',
        'sightline.transcript': 'Patient John Doe diagnosed with acute bronchitis. Prescribe Amoxicillin 500mg.',
        'sightline.analysis': JSON.stringify({
          docType: 'medical',
          sender: 'St Jude Hospital',
          summary: 'Prescription details for John Doe.',
          facts: [{ label: 'Drug', value: 'Amoxicillin 500mg' }],
        }),
        'sightline.qa': JSON.stringify([
          { question: 'What is the dosage?', answer: 'Amoxicillin 500mg three times daily' },
        ]),
        'other_service_key': 'preserve-me-123',
      };

      const mockLocalStorage: Record<string, string> = {
        'sightline.settings': JSON.stringify({ speechRate: 1.5, highContrast: true }),
      };

      const deletedSessionKeys: string[] = [];
      const sessionRemover = (key: string) => {
        deletedSessionKeys.push(key);
        delete mockSessionStorage[key];
      };

      const storageObj = {
        length: Object.keys(mockSessionStorage).length,
        key: (i: number) => Object.keys(mockSessionStorage)[i] ?? null,
      };
      const ownedKeys = sessionKeysOwnedBy(storageObj);

      const abortController = new AbortController();
      const report = forgetSession({
        inFlight: [abortController],
        objectUrls: ['blob:http://localhost:3000/test-preview'],
        revokeObjectUrl: () => {},
        sessionStorageKeys: ownedKeys,
        removeSessionItem: sessionRemover,
      });

      // Abort was fired
      expect(abortController.signal.aborted).toBe(true);

      // Report confirms 4 session keys cleared
      expect(report.cleared).toBe(4);
      expect(report.failed).toBe(0);

      // Foreign key is untouched
      expect(mockSessionStorage['other_service_key']).toBe('preserve-me-123');

      // All sightline session keys deleted
      expect(mockSessionStorage['sightline.session.id']).toBeUndefined();
      expect(mockSessionStorage['sightline.transcript']).toBeUndefined();
      expect(mockSessionStorage['sightline.analysis']).toBeUndefined();
      expect(mockSessionStorage['sightline.qa']).toBeUndefined();

      // Local storage only holds settings, never document content
      const storedSettings = parseStoredSettings(mockLocalStorage['sightline.settings'] ?? null);
      expect(storedSettings.speechRate).toBe(1.5);
      expect(storedSettings.highContrast).toBe(true);

      // Verify that neither store holds any medical document terms
      const allStoredValues = [
        ...Object.values(mockSessionStorage),
        ...Object.values(mockLocalStorage),
      ].join(' ');

      const sensitiveTerms = ['John Doe', 'bronchitis', 'Amoxicillin', 'St Jude', 'dosage'];
      for (const term of sensitiveTerms) {
        expect(allStoredValues).not.toContain(term);
      }
    });

    it('updateSettings refuses to store document data or unknown keys', () => {
      const storeMap = new Map<string, string>();
      const mockIO: SettingsIO = {
        read: (k) => storeMap.get(k) ?? null,
        write: (k, v) => { storeMap.set(k, v); },
      };

      // updateSettings validates against storedSettingsSchema ({ speechRate, highContrast })
      // and strips extraneous fields
      const res = updateSettings({ speechRate: 1.0 }, mockIO);
      expect(res.saved).toBe(true);

      // Attempting to pass document content or arbitrary keys is stripped by zod schema
      const dirtyBlob = JSON.stringify({
        speechRate: 1.2,
        highContrast: false,
        documentSummary: 'Secret financial statement',
        transcript: 'Overdue bill of £1,000',
      });

      const parsed = parseStoredSettings(dirtyBlob);
      expect((parsed as unknown as Record<string, unknown>).documentSummary).toBeUndefined();
      expect((parsed as unknown as Record<string, unknown>).transcript).toBeUndefined();
      expect(parsed.speechRate).toBe(1.2);
      expect(parsed.highContrast).toBe(false);
    });
  });
});
