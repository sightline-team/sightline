/**
 * Render the film: one Playwright screenshot per frame at 60 fps, piped straight into
 * ffmpeg with the mixed audio. No intermediate image files, so a 1080p60 master costs
 * no disk.
 */
import { chromium } from 'playwright';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const FPS = 60;
const OUT = path.join(ROOT, 'deliver', 'sightline-x.mp4');
const AUDIO = path.join(ROOT, 'build', 'mix.wav');
const FFMPEG = path.resolve(ROOT, '../../node_modules/ffmpeg-static/ffmpeg');
fs.mkdirSync(path.dirname(OUT), { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto('file://' + path.join(ROOT, 'film.html'));
await page.waitForFunction(() => window.filmReady === true);
await page.evaluate(() => document.fonts.ready);

const duration = await page.evaluate(() => window.filmMeta.duration);
const total = Math.round(duration * FPS);
console.log(`render ${duration}s @ ${FPS}fps -> ${total} frames`);

const ffmpeg = spawn(FFMPEG, [
  '-y', '-hide_banner', '-loglevel', 'error',
  '-f', 'image2pipe', '-vcodec', 'mjpeg', '-r', String(FPS), '-i', '-',
  '-i', AUDIO,
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p',
  '-c:a', 'aac', '-b:a', '192k', '-ar', '48000',
  '-shortest', '-movflags', '+faststart',
  OUT,
], { stdio: ['pipe', 'inherit', 'pipe'] });
let err = '';
ffmpeg.stderr.on('data', (d) => { err += d.toString(); });

const started = Date.now();
for (let i = 0; i < total; i++) {
  await page.evaluate((t) => window.seek(t), i / FPS);
  const buf = await page.screenshot({ type: 'jpeg', quality: 94 });
  if (!ffmpeg.stdin.write(buf)) await new Promise((r) => ffmpeg.stdin.once('drain', r));
  if (i % 300 === 0 || i === total - 1) {
    const el = (Date.now() - started) / 1000;
    console.log(`  frame ${i}/${total}  ${(i / el).toFixed(1)} fps  ${el.toFixed(0)}s elapsed`);
  }
}
ffmpeg.stdin.end();
const code = await new Promise((r) => ffmpeg.on('close', r));
await browser.close();
if (code !== 0) { console.error(err.slice(-2000)); process.exit(1); }
console.log(`done: ${OUT} ${(fs.statSync(OUT).size / 1048576).toFixed(1)} MiB`);
