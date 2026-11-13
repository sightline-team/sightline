/** Dumps what is visibly on screen at each scene, as text, so the picture can be proof-read. */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
const ROOT = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('file://' + path.resolve(ROOT, 'film.html'));
await page.waitForFunction(() => window.filmReady === true);
await page.evaluate(() => document.fonts.ready);
const TL = await page.evaluate(() => window.TL);
for (let i = 0; i < TL.scenes.length; i++) {
  const t = TL.scenes[i].vo + (TL.scenes[i].end - TL.scenes[i].vo) * 0.55;
  const txt = await page.evaluate((time) => {
    window.seek(time);
    const parts = [];
    for (const el of document.querySelectorAll('.group, #brand, #forgetBtn, #lineOut, #wipeNote')) {
      if (parseFloat(getComputedStyle(el).opacity) < 0.35) continue;
      const t = el.innerText.replace(/\s+/g, ' ').trim();
      if (t) parts.push('[' + (el.id || el.className) + '] ' + t);
    }
    return parts.join('\n');
  }, t);
  console.log(`\n=== scene ${i + 1} @ ${t.toFixed(1)}s — VO: ${TL.scenes[i].line}\n${txt}`);
}
await browser.close();
