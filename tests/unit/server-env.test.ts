import { describe, expect, it } from 'vitest';
import { serverConfig } from '@/lib/server/env';

const KEY = 'a-key-that-must-never-be-printed';

describe('relay configuration fails closed', () => {
  it('is off with no environment', () => {
    const cfg = serverConfig({});
    expect(cfg.relayEnabled).toBe(false);
    expect(cfg.relayDisabledReason).toBe('not_requested');
    expect(cfg.hasApiKey).toBe(false);
  });

  it('stays off when asked to enable but with no key', () => {
    const cfg = serverConfig({ RELAY_ENABLED: 'true', ALLOWED_MODELS: 'm', RATE_LIMIT_STORE_URL: 'https://kv' });
    expect(cfg.relayEnabled).toBe(false);
    expect(cfg.relayDisabledReason).toBe('no_key');
  });

  it('stays off when no model is allowlisted', () => {
    const cfg = serverConfig({ NEAR_AI_API_KEY: KEY, RELAY_ENABLED: 'true', RATE_LIMIT_STORE_URL: 'https://kv' });
    expect(cfg.relayEnabled).toBe(false);
    expect(cfg.relayDisabledReason).toBe('no_allowed_models');
  });

  it('refuses to run in production without a shared rate-limit store', () => {
    // An in-memory counter does nothing across serverless instances, so an
    // unprotected open relay is the failure mode being prevented.
    const cfg = serverConfig({
      NEAR_AI_API_KEY: KEY,
      RELAY_ENABLED: 'true',
      ALLOWED_MODELS: 'a-model, another-model',
      NODE_ENV: 'production',
    });
    expect(cfg.relayEnabled).toBe(false);
    expect(cfg.relayDisabledReason).toBe('no_rate_limit_store');
    expect(cfg.hasSharedStore).toBe(false);
  });

  it('enables only with key, models and a store', () => {
    const cfg = serverConfig({
      NEAR_AI_API_KEY: KEY,
      RELAY_ENABLED: 'true',
      ALLOWED_MODELS: ' org/model-a , org/model-b ',
      RATE_LIMIT_STORE_URL: 'https://kv.example',
      NODE_ENV: 'production',
    });
    expect(cfg.relayEnabled).toBe(true);
    expect(cfg.relayDisabledReason).toBeNull();
    expect(cfg.allowedModels).toEqual(['org/model-a', 'org/model-b']);
    expect(cfg.rateLimitPerIpPerHour).toBe(20);
  });

  it('does not put the API key on the returned config object', () => {
    // The relay reads the key through relayApiKey() at the point of use only; an
    // object that carries it can be logged or serialized by accident.
    const cfg = serverConfig({ NEAR_AI_API_KEY: KEY, RELAY_ENABLED: 'true' });
    expect(JSON.stringify(cfg)).not.toContain(KEY);
    expect(Object.keys(cfg)).not.toContain('apiKey');
  });

  it('defaults the hourly limit and rejects a nonsense value', () => {
    expect(serverConfig({ RATE_LIMIT_PER_IP_PER_HOUR: '' }).rateLimitPerIpPerHour).toBe(20);
    expect(() => serverConfig({ RATE_LIMIT_PER_IP_PER_HOUR: 'zero' })).toThrow();
    expect(() => serverConfig({ RATE_LIMIT_PER_IP_PER_HOUR: '0' })).toThrow();
  });
});
