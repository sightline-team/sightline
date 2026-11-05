import { afterEach, describe, expect, it } from 'vitest';
import { POST as relayPost } from '@/app/api/relay/[...path]/route';

/**
 * The relay contract at scaffold time (F-05 owns the real handler, A-09 owns the full suite).
 *
 * Two things are assertable before the handler exists: the route answers, and it forwards
 * nothing. A route file that reached upstream before its allowlist existed would be an open
 * proxy pointed at a service holding our demo key — so this file is written first, and F-05 has
 * to keep it passing while it adds behaviour. When F-05 gives the handlers their `(request)`
 * parameter, these calls gain a body and the rejected-path/oversize tests go in A-09.
 *
 * `/api/verify` was asserted here while it answered 501 as an unbuilt route; **T-03** built it, so its
 * contract lives in `tests/verification/verify_route.test.ts` with the rest of the verification suite.
 */
const saved = { ...process.env };

afterEach(() => {
  process.env = { ...saved };
});

describe('/api/relay refuses until F-05 lands', () => {
  it('POST returns 501 and names its owning item', async () => {
    const response = await relayPost();
    expect(response.status).toBe(501);
    const body = await response.json();
    expect(body.error).toBe('not_implemented');
    expect(body.item).toBe('F-05');
  });

  it('reports the operator-visible reason the relay is unavailable, and never a key', async () => {
    process.env.RELAY_ENABLED = 'true';
    delete process.env.NEAR_AI_API_KEY;
    const response = await relayPost();
    const body = await response.json();
    expect(body.relay_enabled).toBe(false);
    expect(body.reason).toBe('no_key');
    // Only booleans, codes and counts leave this route (AGENTS.md §4 rule 7).
    expect(JSON.stringify(body)).not.toMatch(/api[_-]?key|NEAR_AI/i);
  });

  it('says nothing that claims a document was protected', async () => {
    const text = await relayPost().then((r) => r.text());
    expect(text.toLowerCase()).not.toMatch(/encrypt|secure|private|anonymi[sz]ed/);
  });
});
