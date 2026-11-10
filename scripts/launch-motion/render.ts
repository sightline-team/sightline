import { chromium } from '@playwright/test';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const HTML_FILE = `file://${path.resolve(process.cwd(), 'scripts/launch-motion/index.html')}`;
const OUTPUT_MP4 = path.resolve(process.cwd(), 'public/sightline-product-launch.mp4');

const DURATION_SEC = 24.0;
const FPS = 30; // 30 fps for smooth playback and fast encoding
const TOTAL_FRAMES = Math.round(DURATION_SEC * FPS);

async function render() {
  console.log(`🎬 Initializing Product Launch Motion Film render:`);
  console.log(`   Duration: ${DURATION_SEC}s · FPS: ${FPS} · Total Frames: ${TOTAL_FRAMES}`);
  console.log(`   Output: ${OUTPUT_MP4}`);

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });

  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  });

  await page.goto(HTML_FILE, { waitUntil: 'load' });
  await page.waitForTimeout(500);

  // Spawn ffmpeg to read PNG stream from stdin pipe
  const ffmpeg = spawn(
    'ffmpeg',
    [
      '-y',
      '-f', 'image2pipe',
      '-vcodec', 'png',
      '-r', String(FPS),
      '-i', '-',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'fast',
      '-crf', '18',
      '-movflags', '+faststart',
      OUTPUT_MP4,
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );

  ffmpeg.on('error', (err) => {
    console.error('ffmpeg process error:', err);
  });

  console.log(`⚡ Streaming ${TOTAL_FRAMES} frames from Chromium to ffmpeg...`);
  const startTime = Date.now();

  for (let frame = 0; frame < TOTAL_FRAMES; frame++) {
    const t = frame / FPS;

    // Seek the pure mathematical timeline
    await page.evaluate((time) => {
      // @ts-expect-error seek is global
      window.seek(time);
    }, t);

    // Capture uncompressed PNG screenshot buffer
    const buf = await page.screenshot({ type: 'png' });

    // Stream buffer into ffmpeg pipe
    const canContinue = ffmpeg.stdin.write(buf);
    if (!canContinue) {
      await new Promise((resolve) => ffmpeg.stdin.once('drain', resolve));
    }

    if (frame % 60 === 0 || frame === TOTAL_FRAMES - 1) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const percent = Math.round((frame / TOTAL_FRAMES) * 100);
      console.log(`   [Frame ${frame}/${TOTAL_FRAMES}] ${percent}% rendered · ${elapsed}s elapsed · t=${t.toFixed(2)}s`);
    }
  }

  console.log(`🎬 All frames streamed. Finalizing MP4 container...`);
  ffmpeg.stdin.end();

  await new Promise((resolve, reject) => {
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve(code);
      else reject(new Error(`ffmpeg exited with code ${code}`));
    });
  });

  await browser.close();

  const stat = fs.statSync(OUTPUT_MP4);
  console.log(`✅ Product Launch Motion Film rendered successfully!`);
  console.log(`   File: ${OUTPUT_MP4}`);
  console.log(`   Size: ${(stat.size / 1024 / 1024).toFixed(2)} MB`);
}

render().catch((err) => {
  console.error('Launch motion render failed:', err);
  process.exit(1);
});
