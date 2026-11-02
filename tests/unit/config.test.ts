import { describe, expect, it } from 'vitest';
import { publicConfig, resolveMode, type Availability } from '@/lib/config';

const none: Availability = { relayEnabled: false, directEnabled: false };
const relayOn: Availability = { relayEnabled: true, directEnabled: false };
const directOn: Availability = { relayEnabled: false, directEnabled: true };

describe('mode selection fails closed to fixtures', () => {
  it('uses fixtures with no environment at all', () => {
    const cfg = publicConfig({}, none);
    expect(cfg.mode).toBe('fixtures');
    expect(cfg.baseUrl).toBe('https://cloud-api.near.ai/v1');
    expect(cfg.downgraded).toBe(false);
  });

  it('downgrades relay to fixtures when the relay is not available', () => {
    const cfg = publicConfig({ NEXT_PUBLIC_DEFAULT_MODE: 'relay' }, none);
    expect(cfg.mode).toBe('fixtures');
    expect(cfg.requestedMode).toBe('relay');
    expect(cfg.downgraded).toBe(true);
    expect(cfg.downgradeReason).toBe('relay');
  });

  it('keeps relay only when it is actually available', () => {
    expect(publicConfig({ NEXT_PUBLIC_DEFAULT_MODE: 'relay' }, relayOn).mode).toBe('relay');
  });

  it('does not offer direct mode unless the operator allowed it', () => {
    // NEXT_PUBLIC_ALLOW_DIRECT defaults to false: browser-direct calls are unproven
    // until spike item S-06, and a mode with a different privacy story cannot be
    // reached by accident.
    expect(publicConfig({ NEXT_PUBLIC_DEFAULT_MODE: 'direct' }, none).mode).toBe('fixtures');
    expect(publicConfig({ NEXT_PUBLIC_ALLOW_DIRECT: 'true' }, none).allowDirect).toBe(true);
    expect(publicConfig({ NEXT_PUBLIC_DEFAULT_MODE: 'direct' }, directOn).mode).toBe('direct');
  });

  it.each([
    ['true', true],
    ['1', true],
    ['false', false],
    ['0', false],
    ['', false],
    [undefined, false],
  ] as const)('reads NEXT_PUBLIC_ALLOW_DIRECT=%s as %s', (value, expected) => {
    const env = value === undefined ? {} : { NEXT_PUBLIC_ALLOW_DIRECT: value };
    expect(publicConfig(env, none).allowDirect).toBe(expected);
  });

  it('rejects a mode name that is not one of the three', () => {
    expect(() => publicConfig({ NEXT_PUBLIC_DEFAULT_MODE: 'cloud' }, none)).toThrow();
  });

  it('rejects a non-URL base', () => {
    expect(() => publicConfig({ NEXT_PUBLIC_NEAR_AI_BASE_URL: 'cloud-api.near.ai' }, none)).toThrow();
  });

  it('resolveMode never invents a mode', () => {
    expect(resolveMode('fixtures', relayOn)).toBe('fixtures');
    expect(resolveMode('relay', directOn)).toBe('fixtures');
    expect(resolveMode('direct', relayOn)).toBe('fixtures');
  });
});
