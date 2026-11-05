import { buildSync } from 'esbuild';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { RoundTripSummary } from './support/browser_round_trip';

/**
 * **S-06**'s browser half — the one sentence `docs/SPIKE_RESULTS.md` §6 refused to write on the
 * strength of a Node `fetch`: **"a page in Chromium completed the authenticated round trip and the
 * signature verified."**
 *
 * Why the Node preflight was not enough. §6 measured `OPTIONS /v1/chat/completions` with an
 * `Origin` header *we set by hand*, and the service echoed it back. That is a server telling us what
 * it would send; it is not a browser deciding to send it. A real page can still be refused by three
 * things a header dump cannot show: a `Origin: null` file navigation, a credential rule, or **our own
 * `connect-src`**. So this file navigates to the app, runs the app's own modules inside the page
 * (bundled from source by esbuild, the same way `image-prepare.spec.ts` runs `prepare.ts`), and reads
 * the statuses off the responses the page actually received.
 *
 * What it proves, in order:
 *  1. an authenticated cross-origin `GET` and `POST` **completed from a page** — the report, the
 *     completion and the signature were each read by the app's own client code, and every answer
 *     carried this page's origin in `access-control-allow-origin`, which is what a passed CORS check
 *     looks like from the inside (a refused body throws before `json()` resolves);
 *  2. `GET /v1/attestation/report` from a page succeeded — the premise **ADR-17** has asserted since
 *     it was written (Mode A's browser asks for the report itself, with the user's own key);
 *  3. the report that came back binds 4/4 and its quote passes 8/8 **through the production
 *     `bindReport` and `checkQuote`**, executed by a browser rather than by Node;
 *  4. a non-streamed completion answered, and the production verifier's `response_signature` and
 *     `signed_by_model_enclave` checks both passed against the key that report named.
 *
 * **This file is skipped by the credential-free suite** (AGENTS.md §4 rule 11): `npm run test:e2e`
 * starts the dev server with `NEAR_AI_API_KEY=` and every test here goes without running. It is run
 * by `npm run test:e2e:live`, which loads `.env` the same way `npm run spike` does.
 *
 * **Two things it deliberately does not do.** It sends a fixed probe sentence and nothing
 * document-derived — S-06 never asked what the model says about somebody's bill (§4 rule 6, and rule
 * 7: no content is logged). And it turns tracing **off**, because a retained Playwright trace
 * records request headers, and the `authorization` header in this test is a live key: a failing run
 * would otherwise write the secret into `test-results/`.
 *
 * **The CSP caveat, stated rather than glossed.** `next.config.ts` sends the CSP header only when
 * `NODE_ENV === 'production'`, so a run against the dev server proves the *service*'s CORS and
 * nothing about our own `connect-src`. The test records which of the two was in play on every run,
 * so a green row here can never be read as "CSP compatible" unless the header was actually served.
 */

const SRC = path.join(__dirname, '..', '..', 'src');
const API_KEY = process.env.NEAR_AI_API_KEY ?? '';

const BUNDLE = buildSync({
  entryPoints: [path.join(__dirname, 'support', 'browser_round_trip.ts')],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: 'SightlineRoundTrip',
  platform: 'browser',
  target: 'esnext',
  alias: { '@': SRC },
}).outputFiles[0]!.text;

// A trace is a record of request headers, and one of this test's headers is a key: a failing run
// would otherwise write that key into `test-results/`. Tracing stays off for this file.
test.use({ trace: 'off' });

const PROD_BASE = process.env.SL_LIVE_BASE ?? '';

test.describe('S-06 — an authenticated round trip from a page in Chromium', () => {
  test.skip(API_KEY === '', 'NEAR_AI_API_KEY is not set. `npm run test:e2e` runs with no credentials on purpose (AGENTS.md §4 rule 11); this test is `npm run test:e2e:live`.');
  // Measured 2026-11-05, on a `next start` build: `page.evaluate` fails under our own CSP —
  // "Evaluating a string as JavaScript violates … script-src 'self' 'unsafe-inline'". That is the
  // harness, not the app: Playwright drives the page through `eval`, and a shipped Sightline bundle
  // is a plain script tag, which 'unsafe-inline' admits. So this half runs against the dev origin and
  // the CSP half is answered by the second describe below, which needs no `eval` and no key.
  test.skip(PROD_BASE !== '', 'pointed at a production build, where our CSP refuses the `eval` Playwright needs to inject and read this round trip; run without SL_LIVE_BASE.');

  test('a page reads its own report over an authenticated cross-origin round trip, and the reply verifies', async ({ page }) => {
    const methods: string[] = [];
    const cors: string[] = [];
    page.on('request', (request) => {
      if (!request.url().includes('cloud-api.near.ai')) return;
      methods.push(request.method());
    });
    page.on('response', (response) => {
      if (!response.url().includes('cloud-api.near.ai')) return;
      cors.push(`${response.status} ${new URL(response.url()).pathname} ${response.headers()['access-control-allow-origin'] ?? '(no allow-origin header)'}`);
    });

    // This half always runs on the dev origin (a production build refuses the `eval` it needs, as the
    // skip above records), and `next dev` serves no CSP header — so the line below says so out loud
    // rather than letting a green row be read as a CSP claim. The CSP question is the second describe's.
    const navigation = await page.goto('/');
    const cspHeader = navigation?.headers()['content-security-policy'];
    await page.addScriptTag({ content: BUNDLE });

    const summary = (await page.evaluate(async (key) => {
      const api = (window as unknown as { SightlineRoundTrip: { runRoundTrip: (k: string) => Promise<RoundTripSummary> } }).SightlineRoundTrip;
      return await api.runRoundTrip(key);
    }, API_KEY)) as RoundTripSummary;

    // ---- What was measured. Statuses, byte counts, timings, check names. No key, no reply text.
    console.log(`  origin            ${summary.origin}`);
    console.log(`  CSP served to the page: ${cspHeader === undefined ? 'no (dev serves no CSP header — the CSP question is the second describe below)' : 'yes'}`);
    console.log(`  model asked for   ${summary.model} · served by ${summary.servedBy}`);
    for (const call of summary.calls) console.log(`  ${String(call.status)} ${call.path} ${call.bytes} B in ${call.ms} ms`);
    for (const c of [...summary.bind, ...summary.quote, ...summary.signatureChecks]) {
      console.log(`  [${c.passed ? 'PASS' : c.ran ? 'FAIL' : 'not run'}] ${c.name}`);
    }
    console.log(`  completion: ${summary.completionChars} chars, finish_reason ${summary.finishReason}, id ${summary.chatIdPrefix}…`);
    console.log(`  signature: verified=${summary.signatureVerified} — ${summary.signatureDetail}`);

    // ---- 1. The calls really left the page.
    expect(methods.filter((m) => m === 'GET').length, 'the report and the signature were read from the page').toBeGreaterThanOrEqual(2);
    expect(methods).toContain('POST');

    // ---- 2. Every answer the page received named this page's origin, which is what a passed CORS
    //      check looks like from inside a browser: the read below succeeded, and `response.json()` on
    //      a cross-origin body throws unless the response carries this origin (or `*`).
    expect(cors.length, 'the report, the completion and the signature were all cross-origin reads').toBeGreaterThanOrEqual(3);
    for (const line of cors) expect(line, `the service must echo the page's origin: ${line}`).toContain(summary.origin);

    // **The negative half this file first tried, and why it is not here.** Stripping
    // `access-control-allow-origin` with `page.route` + `route.fulfill` did **not** make Chromium
    // refuse the response — it answered 200 (measured 2026-11-05, first run of this file). A mocked
    // response is therefore not evidence about a real CORS decision, and a control that cannot fail is
    // worse than no control: it would have let this file claim enforcement it had not shown. What the
    // run does show is the positive half over the **real network**, which is the stronger form: an
    // authenticated cross-origin `GET` and `POST` completed from a page, the service echoed the
    // origin on every one, and reading a body the policy refused would have thrown in the page.
    const byPath = summary.calls.map((c) => `${c.status} ${c.path}`);
    expect(byPath.filter((s) => !s.startsWith('2')), `nothing refused: ${byPath.join(', ')}`).toEqual([]);
    expect(byPath).toContain('200 /v1/attestation/report');
    expect(byPath).toContain('200 /v1/chat/completions');
    expect(byPath.some((s) => /^200 \/v1\/signature\/./.test(s)), `a signature lookup answered: ${byPath.join(', ')}`).toBe(true);
    for (const line of cors) expect(line, `the service must echo the page's origin: ${line}`).toContain(summary.origin);

    // ---- 3. The production judgement, run by a browser.
    expect(summary.signingKeyPresent, 'the report must name a key before anything is verified').toBe(true);
    expect(summary.bind.map((c) => `${c.name}:${c.passed}`)).toEqual([
      'attestation_report:true',
      'nonce_fresh:true',
      'signing_address_shape:true',
      'signing_public_key_shape:true',
    ]);
    expect(summary.bindStatus).toBe('verified');
    const quoteFailures = summary.quote.filter((c) => !c.ran || !c.passed).map((c) => c.name);
    expect(quoteFailures, `eight quote checks, none failing: ${quoteFailures.join(', ')}`).toEqual([]);
    expect(summary.quote).toHaveLength(8);

    // ---- 4. The exchange verifies against the attested key, and the name it verifies under is the
    //     enclave's — a gateway signature would be a weaker answer than this test claims (ADR-22).
    expect(summary.signatureChecks.map((c) => `${c.name}:${c.passed}`)).toEqual([
      'response_signature:true',
      'signed_by_model_enclave:true',
    ]);
    expect(summary.signatureVerified, summary.signatureDetail).toBe(true);
    expect(summary.completionChars, 'a probe that answers nothing is not a round trip').toBeGreaterThan(0);
  });
});

/**
 * **The other half of the question §6 said could not be read off a header dump: does our own
 * `connect-src` let Mode A work?**
 *
 * `next.config.ts` sends the CSP header only from a production build, so this test is pointed at one
 * with `SL_LIVE_BASE` and is skipped otherwise — a dev run cannot see a header that is not served.
 *
 * It needs no key and no `page.evaluate` (our `script-src` refuses `eval`, which is exactly why the
 * round trip above cannot run here): the probe is an inline script, which `'unsafe-inline'` admits,
 * and its answer is read out of the DOM. Two fetches, one pair:
 *
 *  - `https://cloud-api.near.ai/v1/models` — the host Mode A talks to. **Measured 2026-11-05: it
 *    answers `200` with no credential at all**, so the list of models is public; what matters here is
 *    not the status but that the browser let the request leave and the page read a status back.
 *  - `https://example.com/` — a host deliberately **not** in `connect-src`. If that one is *not*
 *    refused, this page is not enforcing CSP and the first result would mean nothing.
 *
 * CSP refusal and network failure both surface as an opaque `TypeError` in page JS, so the assertion
 * is carried by the browser's own report of the block: Chromium logs "…violates the following Content
 * Security Policy directive…" for the refused host and nothing for the allowed one.
 *
 * **Measured 2026-11-05:** that report is not only a console line — Playwright raises it out of
 * `addScriptTag` too, so the call rejects even though the script ran and the second probe is the
 * refusal we came for. The call is therefore caught, and the proof that the script *executed* is the
 * `<pre>` the page appends, read below; if `script-src` had blocked the inline script, that read is
 * what would time out.
 */
test.describe('S-06 — our own CSP against Mode A, on a production build', () => {
  test.skip(PROD_BASE === '', 'SL_LIVE_BASE is not set. `next dev` serves no CSP header (next.config.ts gates it on NODE_ENV=production), so there is nothing to measure here; point it at `next start`.');

  test('connect-src admits cloud-api.near.ai and refuses a host outside it', async ({ page }) => {
    const refused: string[] = [];
    const note = (text: string) => {
      if (/violates the following Content Security Policy/i.test(text)) refused.push(text);
    };
    page.on('console', (message) => note(message.text()));
    page.on('pageerror', (error) => note(String(error)));

    const navigation = await page.goto(PROD_BASE);
    const csp = navigation?.headers()['content-security-policy'] ?? '';
    expect(csp, `${PROD_BASE} is not serving a CSP header — this run is pointed at something other than a production build`).toContain('connect-src');

    await page
      .addScriptTag({
        content: `(() => {
          const probe = async (url) => { try { const r = await fetch(url); return 'reached ' + r.status; } catch (e) { return 'refused'; } };
          Promise.all([probe('https://cloud-api.near.ai/v1/models'), probe('https://example.com/')]).then(function (out) {
            const el = document.createElement('pre');
            el.id = 'csp-probe';
            el.textContent = JSON.stringify({ near: out[0], other: out[1] });
            document.body.appendChild(el);
          });
        })();`,
      })
      .catch(() => {});

    const raw = await page.locator('#csp-probe').textContent({ timeout: 30_000 });
    const result = JSON.parse(raw ?? '{}') as { near?: string; other?: string };
    console.log(`  ${PROD_BASE} · CSP served: yes`);
    console.log(`  connect-src clause: ${(csp.match(/connect-src[^;]*/) ?? ['(absent)'])[0]}`);
    console.log(`  cloud-api.near.ai → ${result.near} · example.com → ${result.other}`);
    for (const line of refused) console.log(`  browser: ${line.slice(0, 150)}`);

    expect(result.near, 'the host Mode A needs must not be refused by our own policy').toMatch(/^reached /);
    expect(result.other, 'a host outside connect-src must be refused, or the first result proves nothing').toBe('refused');
    // **Measured 2026-11-05:** the refusal text quotes the whole directive, and our directive *names*
    // `cloud-api.near.ai` — so searching the message for a host matches every refusal. The only host
    // that means anything here is the one the browser was actually connecting to.
    const hostRefused = (message: string) => message.match(/Connecting to '([^']+)'/)?.[1] ?? '';
    const names = refused.map(hostRefused);
    expect(names.filter((u) => u.startsWith('https://example.com/')), 'Chromium must name the refused host in a CSP violation').not.toEqual([]);
    expect(names.filter((u) => u.includes('cloud-api.near.ai')), 'the NEAR host must draw no violation').toEqual([]);
  });
});
