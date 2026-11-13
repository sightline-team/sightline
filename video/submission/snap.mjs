/** Stills at chosen times plus a one-per-scene contact sheet, for review. */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(ROOT, 'stills');
fs.mkdirSync(OUT, { recursive: true });

const times = (process.argv[2] ? process.argv[2].split(',').map(Number) : [3, 9, 13, 18, 22, 26, 29, 33, 38, 44, 50, 55, 62, 66, 72, 76, 80, 86, 92, 96, 99, 102, 106, 110]);

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto('file://' + path.join(ROOT, 'film.html'));
await page.waitForFunction(() => window.filmReady === true);
await page.evaluate(() => document.fonts.ready);

for (const t of times) {
  await page.evaluate((time) => window.seek(time), t);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: path.join(OUT, `t${String(t).padStart(6, '0')}.png`) });
}
await browser.close();

const ffmpeg = path.resolve(ROOT, '../../node_modules/ffmpeg-static/ffmpeg');
const list = fs.readdirSync(OUT).filter((f) => f.endsWith('.png')).sort();
execFileSync(ffmpeg, [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-pattern_type', 'glob', '-i', path.join(OUT, '*.png'),
  '-filter_complex', 'scale=480:-1,tile=4x6:padding=8:color=0x2a2a2a',
  '-frames:v', '1', path.join(OUT, 'contact_sheet.png'),
]);
console.log(`stills: ${list.length}, contact sheet: stills/contact_sheet.png`);
