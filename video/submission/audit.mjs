/**
 * Layout audit: samples the film across its whole length and reports the things a still
 * cannot tell you by eye — text overflowing its box, content outside the frame, two
 * visible blocks overlapping, and frames that are visually empty.
 */
import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('file://' + path.resolve(ROOT, 'film.html'));
await page.waitForFunction(() => window.filmReady === true);
await page.evaluate(() => document.fonts.ready);

const duration = await page.evaluate(() => window.filmMeta.duration);
const times = [];
for (let t = 0.2; t < duration; t += 0.7) times.push(+t.toFixed(2));

const problems = [];
let lastSig = '';
for (const t of times) {
  const r = await page.evaluate(async (time) => {
    window.seek(time);
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    const out = { overflow: [], outside: [], overlaps: [], visible: [], ink: 0 };
    const stage = document.getElementById('stage').getBoundingClientRect();
    const groups = [...document.querySelectorAll('.group')].filter((g) => parseFloat(getComputedStyle(g).opacity) > 0.65);
    out.visible = groups.map((g) => g.id);
    for (const id of ['brand', 'forgetBtn', 'lineOut', 'wipeNote', 'sheet']) {
      const e = document.getElementById(id);
      if (e && parseFloat(getComputedStyle(e).opacity) > 0.65) out.visible.push(id);
    }
    const boxes = [];
    for (const g of groups) {
      for (const el of g.querySelectorAll('*')) {
        const st = getComputedStyle(el);
        if (st.display === 'none' || st.opacity === '0') continue;
        if (el.children.length > 0 && el.textContent.trim() === '') continue;
        // decorative layers are meant to sit on top of text
        if (el.closest('.redact,.pmini,#cursor,#ripple,#grain,#vignette,.quote-underline,#scan,#sealRing,#sheet-edge,#sheet-dark,.side-rule')) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const name = g.id + ' ' + el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '') + ' "' + el.textContent.trim().slice(0, 28) + '"';
        if (r.right - stage.right > 1 || r.left - stage.left < -1 || r.bottom - stage.bottom > 1 || r.top - stage.top < -1) {
          out.outside.push(name + ' @ ' + [r.left, r.top, r.right, r.bottom].map((n) => Math.round(n)).join(','));
        }
        if ((el.scrollWidth - el.clientWidth > 2 || el.scrollHeight - el.clientHeight > 16) && st.overflow === 'visible' && el.clientWidth > 0) {
          out.overflow.push(name + ` sw${el.scrollWidth}/cw${el.clientWidth} sh${el.scrollHeight}/ch${el.clientHeight}`);
        }
        if (el.children.length === 0 && !el.matches('.redact,.pmini i')) boxes.push({ name, r });
        // content must stay inside the sheet it lives on
        const sheetR = document.getElementById('sheet').getBoundingClientRect();
        if (el.matches('.lrow,.lval,.letter-head,.letter-sub,.lnote,.s3-title,.s3-head,.chip,.kicker,.proof,.chk,.res-h1,.res-h2,.summary,.fact,.notice,.qa,.page-label,.page-body,#askBox,#askHeading,.r-row,.r-claim,.r-title')) {
          if (r.right - sheetR.right > 2 || r.left - sheetR.left < -2 || r.bottom - sheetR.bottom > 2 || r.top - sheetR.top < -2) {
            out.overflow.push('SHEET ' + name);
          }
        }
      }
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i].r, b = boxes[j].r;
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left);
        const oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
        if (ox > 6 && oy > 6) out.overlaps.push(boxes[i].name + ' <> ' + boxes[j].name);
      }
    }
    const sc = document.querySelector('#stage');
    out.ink = sc ? 1 : 0;
    return out;
  }, t);

  const sig = r.visible.join(',') + '|' + r.overflow.length + '|' + r.overlaps.length;
  if (r.overflow.length) problems.push(`t=${t} OVERFLOW ${r.overflow.slice(0, 4).join(' | ')}`);
  if (r.outside.length) problems.push(`t=${t} OUTSIDE ${r.outside.slice(0, 3).join(' | ')}`);
  if (r.overlaps.length) problems.push(`t=${t} OVERLAP ${r.overlaps.slice(0, 3).join(' | ')}`);
  if (t > 1.2 && r.visible.length === 0) problems.push(`t=${t} NO VISIBLE CONTENT`);
  lastSig = sig;
}

console.log(problems.length ? problems.join('\n') : 'no layout problems');
console.log(`samples=${times.length} duration=${duration} lastSig=${lastSig}`);
await browser.close();
