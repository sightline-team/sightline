import { chromium, type Locator } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.resolve(process.cwd(), 'demo_recordings');
const FINAL_MP4 = path.resolve(process.cwd(), 'public/sightline-demo-video.mp4');

async function record() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log('🎬 Starting Playwright browser for 1080p demo recording (60fps smooth scrolling, cursor, exact 2:06 sync)...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  });

  const context = await browser.newContext({
    recordVideo: {
      dir: OUTPUT_DIR,
      size: { width: 1920, height: 1080 },
    },
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    locale: 'en-US',
  });

  // Ensure tsx/esbuild helper exists in browser context across all pages
  await context.addInitScript(() => {
    (window as any).__name = (target: any) => target;
  });

  const page = await context.newPage();

  // Inject sleek HUD overlay + high-visibility custom SVG cursor with click ripples
  async function setupHUDAndCursor() {
    await page.evaluate(() => {
      // Remove existing overlays if any
      const existingHud = document.getElementById('sightline-video-hud');
      if (existingHud) existingHud.remove();
      const existingCursor = document.getElementById('demo-cursor');
      if (existingCursor) existingCursor.remove();

      // Mobile readability and scale optimization
      let mobileTune = document.getElementById('sightline-mobile-ux-tune');
      if (!mobileTune) {
        mobileTune = document.createElement('style');
        mobileTune.id = 'sightline-mobile-ux-tune';
        mobileTune.textContent = `
          :root {
            --measure: 68rem !important;
          }
          main, nav, .banner {
            max-width: var(--measure) !important;
          }
          body {
            zoom: 1.32 !important;
          }
        `;
        document.head.appendChild(mobileTune);
      }

      // HUD overlay elements
      const hud = document.createElement('div');
      hud.id = 'sightline-video-hud';
      hud.innerHTML = `
        <div id="hud-top-telemetry">
          <span class="hud-pill"><span class="hud-dot"></span>NEAR AI CLOUD TEE</span>
          <span class="hud-pill">INTEL TDX HARDWARE ENCLAVE</span>
          <span class="hud-pill">ZERO SERVER STORAGE</span>
        </div>
        <div id="hud-lower-third">
          <div id="hud-badge-tag">SIGHTLINE DEMO</div>
          <div id="hud-title-text">INITIALIZING...</div>
          <div id="hud-desc-text">Non-visual document intelligence powered by hardware-attested enclaves.</div>
          <div id="hud-progress-bar"><div id="hud-progress-fill"></div></div>
        </div>
      `;

      // Custom animated pointer cursor
      const cursor = document.createElement('div');
      cursor.id = 'demo-cursor';
      cursor.dataset.x = '960';
      cursor.dataset.y = '540';
      cursor.innerHTML = `
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none">
          <path d="M3 3L10.5 21L13.5 13.5L21 10.5L3 3Z" fill="#00EC97" stroke="#040407" stroke-width="1.8" stroke-linejoin="round"/>
        </svg>
      `;

      const style = document.createElement('style');
      style.textContent = `
        #sightline-video-hud {
          position: fixed;
          top: 0; left: 0; width: 100vw; height: 100vh;
          pointer-events: none;
          z-index: 999999;
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
        }
        #hud-top-telemetry {
          position: absolute;
          top: 24px;
          right: 44px;
          display: flex;
          gap: 14px;
        }
        .hud-pill {
          background: rgba(4, 4, 7, 0.94);
          border: 1px solid #232736;
          color: #a0aec0;
          font-size: 14px;
          letter-spacing: 0.08em;
          padding: 9px 18px;
          font-weight: 600;
          text-transform: uppercase;
          display: flex;
          align-items: center;
          gap: 10px;
          box-shadow: 0 4px 14px rgba(0,0,0,0.55);
          backdrop-filter: blur(8px);
        }
        .hud-dot {
          width: 10px;
          height: 10px;
          background: #00EC97;
          border-radius: 50%;
          box-shadow: 0 0 10px #00EC97;
        }
        #hud-lower-third {
          position: absolute;
          bottom: 36px;
          left: 44px;
          width: 960px;
          background: rgba(4, 4, 7, 0.96);
          border: 1px solid #232736;
          border-left: 6px solid #00EC97;
          padding: 22px 30px;
          box-shadow: 0 16px 40px rgba(0,0,0,0.85);
          backdrop-filter: blur(14px);
          transition: all 0.3s ease;
        }
        #hud-badge-tag {
          font-size: 14px;
          font-weight: 700;
          color: #00EC97;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        #hud-title-text {
          font-size: 26px;
          font-weight: 700;
          color: #ffffff;
          letter-spacing: -0.01em;
          margin-bottom: 8px;
        }
        #hud-desc-text {
          font-size: 18px;
          color: #cbd5e1;
          line-height: 1.5;
        }
        #hud-progress-bar {
          margin-top: 14px;
          width: 100%;
          height: 5px;
          background: #1a1f2e;
          overflow: hidden;
        }
        #hud-progress-fill {
          height: 100%;
          width: 0%;
          background: #00EC97;
          transition: width 0.4s ease;
        }
        #demo-cursor {
          position: fixed;
          top: 0;
          left: 0;
          width: 28px;
          height: 28px;
          pointer-events: none;
          z-index: 10000000;
          transform: translate3d(960px, 540px, 0);
          filter: drop-shadow(0 3px 10px rgba(0,0,0,0.9));
        }
        .demo-click-ripple {
          position: fixed;
          width: 48px;
          height: 48px;
          margin-top: -24px;
          margin-left: -24px;
          border-radius: 50%;
          border: 2px solid #00EC97;
          background: rgba(0, 236, 151, 0.25);
          pointer-events: none;
          z-index: 9999999;
          animation: ripple-anim 0.5s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
        }
        @keyframes ripple-anim {
          0% { transform: scale(0.2); opacity: 1; }
          100% { transform: scale(1.6); opacity: 0; }
        }
      `;
      document.head.appendChild(style);
      document.documentElement.appendChild(hud);
      document.body.appendChild(cursor);
    });
  }

  async function updateHUD(badge: string, title: string, desc: string, progress: number) {
    await page.evaluate(
      ({ badge, title, desc, progress }) => {
        const badgeEl = document.getElementById('hud-badge-tag');
        const titleEl = document.getElementById('hud-title-text');
        const descEl = document.getElementById('hud-desc-text');
        const fillEl = document.getElementById('hud-progress-fill');
        if (badgeEl) badgeEl.textContent = badge;
        if (titleEl) titleEl.textContent = title;
        if (descEl) descEl.textContent = desc;
        if (fillEl) fillEl.style.width = `${progress}%`;
      },
      { badge, title, desc, progress },
    );
  }

  // Smooth cursor glide using requestAnimationFrame easing
  async function moveCursor(x: number, y: number, durationMs = 600) {
    await page.evaluate(
      ({ x, y, durationMs }) => {
        return new Promise<void>((resolve) => {
          const cursor = document.getElementById('demo-cursor');
          if (!cursor) {
            resolve();
            return;
          }
          const curX = parseFloat(cursor.dataset.x || '960');
          const curY = parseFloat(cursor.dataset.y || '540');
          const diffX = x - curX;
          const diffY = y - curY;
          if (Math.abs(diffX) < 1 && Math.abs(diffY) < 1) {
            resolve();
            return;
          }
          const startTime = performance.now();
          const easeInOutQuad = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
          const step = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / durationMs, 1);
            const ease = easeInOutQuad(progress);
            const posX = curX + diffX * ease;
            const posY = curY + diffY * ease;
            cursor.style.transform = `translate3d(${posX}px, ${posY}px, 0)`;
            cursor.dataset.x = `${posX}`;
            cursor.dataset.y = `${posY}`;
            if (progress < 1) {
              requestAnimationFrame(step);
            } else {
              cursor.dataset.x = `${x}`;
              cursor.dataset.y = `${y}`;
              resolve();
            }
          };
          requestAnimationFrame(step);
        });
      },
      { x, y, durationMs },
    );
  }

  // 60fps in-browser smooth window scroll using requestAnimationFrame and cubic easing
  async function smoothScrollTo(targetY: number, durationMs = 1200) {
    await page.evaluate(
      ({ targetY, durationMs }) => {
        return new Promise<void>((resolve) => {
          const startY = window.scrollY;
          const diff = targetY - startY;
          if (Math.abs(diff) < 2) {
            resolve();
            return;
          }
          const startTime = performance.now();
          const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
          const step = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / durationMs, 1);
            window.scrollTo(0, startY + diff * easeInOutCubic(progress));
            if (progress < 1) {
              requestAnimationFrame(step);
            } else {
              resolve();
            }
          };
          requestAnimationFrame(step);
        });
      },
      { targetY, durationMs },
    );
  }

  // Smoothly scroll to a locator position in viewport
  async function smoothScrollToLocator(locator: Locator, targetViewportY = 400, durationMs = 1200) {
    const box = await locator.boundingBox();
    if (!box) return;
    const currentScrollY = await page.evaluate(() => window.scrollY);
    const targetScrollY = Math.max(0, currentScrollY + box.y - targetViewportY);
    await smoothScrollTo(targetScrollY, durationMs);
  }

  // Glide cursor to an element and click with visible ripple
  async function clickWithCursor(locator: Locator, durationMs = 600, offsetX = 0, offsetY = 0) {
    const box = await locator.boundingBox();
    if (box) {
      const targetX = Math.round(box.x + box.width / 2 + offsetX);
      const targetY = Math.round(box.y + box.height / 2 + offsetY);
      await moveCursor(targetX, targetY, durationMs);
      await page.evaluate(() => {
        const cursor = document.getElementById('demo-cursor');
        if (!cursor) return;
        const x = parseFloat(cursor.dataset.x || '960');
        const y = parseFloat(cursor.dataset.y || '540');
        const ripple = document.createElement('div');
        ripple.className = 'demo-click-ripple';
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        document.body.appendChild(ripple);
        setTimeout(() => ripple.remove(), 600);
      });
      await page.waitForTimeout(100);
      await locator.click();
    }
  }

  // Glide cursor to hover an element
  async function glideToLocator(locator: Locator, durationMs = 600, offsetX = 0, offsetY = 0) {
    const box = await locator.boundingBox();
    if (box) {
      const targetX = Math.round(box.x + box.width / 2 + offsetX);
      const targetY = Math.round(box.y + box.height / 2 + offsetY);
      await moveCursor(targetX, targetY, durationMs);
    }
  }

  console.log('📍 Navigating to Sightline at http://localhost:3300...');
  await page.goto('http://localhost:3300/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await setupHUDAndCursor();

  // ==========================================
  // BEAT 1: THE PRIVACY DILEMMA (0:00 - 0:20 | 20s)
  // ==========================================
  console.log('🎬 Recording Beat 1: The Privacy Dilemma (0:00 - 0:20)...');
  await updateHUD(
    'BEAT 1 / 6 · THE PRIVACY DILEMMA',
    'Private Document Intelligence for Blind & Low-Vision Users',
    'Paper documents carry intimate medical and financial records. Sightline guarantees hardware-attested enclave privacy.',
    12,
  );

  // Initial glide towards top telemetry indicators
  await moveCursor(1350, 48, 1200);
  await page.waitForTimeout(1500);

  // Hover telemetry pills
  await moveCursor(1580, 48, 1000);
  await page.waitForTimeout(1500);

  // Smooth scroll down to 4-pillar cryptographic guarantee cards
  await smoothScrollTo(460, 1600);
  await moveCursor(480, 520, 1000);
  await page.waitForTimeout(2000);
  await moveCursor(880, 520, 1000);
  await page.waitForTimeout(2000);

  // Smooth scroll down to architecture & execution pipeline
  await smoothScrollTo(1050, 1600);
  await moveCursor(400, 480, 1000);
  await page.waitForTimeout(1200);
  await moveCursor(960, 480, 1200);
  await page.waitForTimeout(1200);
  await moveCursor(1400, 480, 1200);
  await page.waitForTimeout(2000);

  // ==========================================
  // BEAT 2: PRE-UPLOAD HARDWARE ATTESTATION (0:20 - 0:40 | 20s)
  // ==========================================
  console.log('🎬 Recording Beat 2: Pre-Upload Hardware Attestation (0:20 - 0:40)...');
  await updateHUD(
    'BEAT 2 / 6 · HARDWARE ATTESTATION',
    'Intel TDX Enclave Proof & Fresh Session Nonce',
    'Before a single byte leaves the device, Sightline verifies TDX quote measurements and binds fresh nonces in-browser.',
    32,
  );

  // Smooth scroll to input streams workbench
  const workbench = page.locator('#workbench');
  await smoothScrollToLocator(workbench, 140, 1600);
  await moveCursor(550, 320, 1000);
  await page.waitForTimeout(2000);
  await moveCursor(950, 320, 1000);
  await page.waitForTimeout(2000);

  // Scroll to Document capture stream
  const captureHeading = page.locator('#capture-heading');
  await smoothScrollToLocator(captureHeading, 140, 1400);
  await moveCursor(720, 360, 1000);
  await page.waitForTimeout(2500);

  // Scroll smoothly to "Load sample document" button
  const loadSampleBtn = page.getByRole('button', { name: /load sample document/i });
  await smoothScrollToLocator(loadSampleBtn, 480, 1200);
  await glideToLocator(loadSampleBtn, 1000);
  await page.waitForTimeout(3000);

  // ==========================================
  // BEAT 3: MULTI-PAGE CAPTURE & LOCAL EXIF PURGE (0:40 - 1:00 | 20s)
  // ==========================================
  console.log('🎬 Recording Beat 3: Capture & Transcription Pipeline (0:40 - 1:00)...');
  await updateHUD(
    'BEAT 3 / 6 · MULTI-PAGE CAPTURE',
    '3-Page Document Loading with Local EXIF Purge',
    'Handles camera and file uploads in strict sequence. 100% of camera EXIF, GPS, and device metadata is purged locally.',
    50,
  );

  // Click Load Sample Document button with cursor
  if (await loadSampleBtn.isVisible()) {
    await clickWithCursor(loadSampleBtn, 700);
    await page.waitForTimeout(1600);
  }

  // Observe the 3 loaded pages in the tray
  await moveCursor(520, 580, 1000);
  await page.waitForTimeout(1800);
  await moveCursor(780, 580, 1000);
  await page.waitForTimeout(1800);
  await moveCursor(1040, 580, 1000);
  await page.waitForTimeout(1800);

  // Scroll down to "Read these photographs" button
  const readPhotosBtn = page.getByRole('button', { name: /read these photographs/i });
  await smoothScrollToLocator(readPhotosBtn, 520, 1200);
  await page.waitForTimeout(1200);

  // Press Read these photographs
  await updateHUD(
    'BEAT 3 / 6 · TEE PIPELINE EXECUTION',
    'Reading Photographs Inside Intel TDX Enclaves',
    'Confidential vision transcription and fact extraction running inside attested hardware memory.',
    60,
  );

  if (await readPhotosBtn.isVisible()) {
    await clickWithCursor(readPhotosBtn, 700);
  }

  // Transition to /read
  await page.waitForURL('**/read', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await setupHUDAndCursor(); // Re-inject HUD and cursor on /read

  // ==========================================
  // BEAT 4: VERIFIABLE HIERARCHY & FACT GROUNDING (1:00 - 1:25 | 25s)
  // ==========================================
  console.log('🎬 Recording Beat 4: Honest Results & Fact Grounding (1:00 - 1:25)...');
  await updateHUD(
    'BEAT 4 / 6 · VERIFIABLE RESULTS',
    'Grounded Facts & Verbatim Quote Disclosures',
    'Results follow an invariant, accessible hierarchy: Summary, Key Facts, Actions, Safety Notices, and Verbatim Quotes.',
    75,
  );

  // Screen reader focus on main heading
  await moveCursor(640, 260, 1000);
  await page.waitForTimeout(2500);

  // View summary card
  await smoothScrollTo(280, 1200);
  await moveCursor(720, 420, 1200);
  await page.waitForTimeout(2500);

  // Smooth scroll to Key facts
  const keyFactsHeading = page.getByRole('heading', { name: 'Key facts' });
  await smoothScrollToLocator(keyFactsHeading, 140, 1400);
  await moveCursor(680, 360, 1000);
  await page.waitForTimeout(2500);

  // Expand "Show the other facts" or details disclosure to demonstrate grounding
  const showMoreFacts = page.locator('details summary').first();
  if (await showMoreFacts.isVisible()) {
    await clickWithCursor(showMoreFacts, 800);
    await moveCursor(680, 460, 1200);
    await page.waitForTimeout(2500);
  }

  // Scroll smoothly to Safety Notices & Warnings
  const warningsHeading = page.getByRole('heading', { name: 'Warnings' });
  await smoothScrollToLocator(warningsHeading, 140, 1400);
  await moveCursor(700, 380, 1000);
  await page.waitForTimeout(2500);

  // ==========================================
  // BEAT 5: GROUNDED Q&A WITH HONEST REFUSAL (1:25 - 1:45 | 20s)
  // ==========================================
  console.log('🎬 Recording Beat 5: Grounded Q&A & Honest Refusal (1:25 - 1:45)...');
  await updateHUD(
    'BEAT 5 / 6 · INTERACTIVE Q&A',
    'Fail-Closed Grounded Answers & Honest Refusal',
    'Sightline answers strictly from verified document text. Out-of-scope questions are honestly refused without hallucination.',
    88,
  );

  // Scroll to Ask a question section
  const askHeading = page.locator('#ask-heading');
  await smoothScrollToLocator(askHeading, 140, 1200);
  await page.waitForTimeout(1500);

  // Question 1: Grounded query (reference number)
  const q1Btn = page.getByRole('button', { name: 'What reference number is on these pages?' });
  const askButton = page.getByRole('button', { name: /^ask$/i });
  if (await q1Btn.isVisible()) {
    await clickWithCursor(q1Btn, 800);
    await page.waitForTimeout(800);
    await clickWithCursor(askButton, 700);
    await page.waitForTimeout(1800);
    // Cursor glides to the answered quote
    await moveCursor(700, 520, 1000);
    await page.waitForTimeout(2200);
  }

  // Question 2: Unanswerable query to demonstrate honest refusal (payment deadline)
  const q2Btn = page.getByRole('button', { name: 'Is there a payment deadline in this document?' });
  if (await q2Btn.isVisible()) {
    await clickWithCursor(q2Btn, 800);
    await page.waitForTimeout(800);
    await clickWithCursor(askButton, 700);
    await page.waitForTimeout(1800);

    // Scroll slightly down to showcase both answers in the Answers region
    const answersSection = page.locator('[data-testid="answers"]');
    if (await answersSection.isVisible()) {
      await smoothScrollToLocator(answersSection, 180, 1000);
      await moveCursor(720, 480, 1000);
      await page.waitForTimeout(2600);
    }
  }

  // ==========================================
  // BEAT 6: TRUST RECEIPT & ONE-CLICK FORGET (1:45 - 2:06 | 21s)
  // ==========================================
  console.log('🎬 Recording Beat 6: Trust Receipt & Complete Forget (1:45 - 2:06)...');
  await updateHUD(
    'BEAT 6 / 6 · TRUST RECEIPT & PURGE',
    'Cryptographic Trust Receipt & One-Click Forget',
    'Lists every hardware attestation and signature check. One-click Forget wipes memory and object URLs completely.',
    96,
  );

  // Smooth scroll back up to navigation header
  await smoothScrollTo(0, 1200);
  const trustLink = page.getByRole('link', { name: 'Verification' });
  if (await trustLink.isVisible()) {
    await clickWithCursor(trustLink, 800);
    await page.waitForURL('**/trust', { timeout: 10000 }).catch(() => {});
  }
  await page.waitForTimeout(1500);
  await setupHUDAndCursor();

  await updateHUD(
    'BEAT 6 / 6 · TRUST RECEIPT & PURGE',
    'Cryptographic Trust Receipt & One-Click Forget',
    'Lists every hardware attestation and signature check. One-click Forget wipes memory and object URLs completely.',
    98,
  );

  // Review the verification checklist
  await smoothScrollTo(320, 1200);
  await moveCursor(680, 360, 1000);
  await page.waitForTimeout(1500);
  await moveCursor(680, 420, 1000);
  await page.waitForTimeout(1500);
  await moveCursor(680, 480, 1000);
  await page.waitForTimeout(2000);

  // Scroll down to "Forget this document" button
  const forgetBtn = page.getByRole('button', { name: /forget this document/i });
  await smoothScrollToLocator(forgetBtn, 480, 1100);
  await page.waitForTimeout(1000);

  // Press Forget this document
  if (await forgetBtn.isVisible()) {
    await clickWithCursor(forgetBtn, 700);
    await page.waitForTimeout(1500);
  }

  // Return to homepage
  const homeLink = page.getByRole('link', { name: /sightline/i }).first();
  if (await homeLink.isVisible()) {
    await clickWithCursor(homeLink, 700);
    await page.waitForURL('**/', { timeout: 10000 }).catch(() => {});
  }
  await page.waitForTimeout(1200);
  await setupHUDAndCursor();

  // Final confirmation screen
  await updateHUD(
    'SIGHTLINE · ZERO CUSTODY VERIFIED',
    'Document Forgotten. All In-Memory State Purged.',
    'Built for NEAR Hackathon 2026 · Privacy & Private AI Track · Open Source MIT',
    100,
  );
  await moveCursor(1400, 920, 1000);
  await page.waitForTimeout(3500);

  console.log('🎬 Video recorded. Closing context...');
  await page.close();
  await context.close();
  await browser.close();

  // Find generated webm video
  const files = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith('.webm'));
  if (files.length === 0) {
    throw new Error('No webm video found in output directory');
  }

  // Pick the newest webm
  const sortedFiles = files.sort(
    (a, b) => fs.statSync(path.join(OUTPUT_DIR, b)).mtimeMs - fs.statSync(path.join(OUTPUT_DIR, a)).mtimeMs,
  );
  const newest = sortedFiles[0];
  if (!newest) {
    throw new Error('No webm files found');
  }
  const latestWebm = path.join(OUTPUT_DIR, newest);

  console.log(`🎥 Raw WebM recording: ${latestWebm} (${(fs.statSync(latestWebm).size / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`⚡ Transcoding to 1080p MP4 with ffmpeg -> ${FINAL_MP4}...`);

  const ffmpegCmd = `ffmpeg -y -i "${latestWebm}" -c:v libx264 -pix_fmt yuv420p -fps_mode cfr -r 30 -preset fast -crf 22 -movflags +faststart "${FINAL_MP4}"`;
  execSync(ffmpegCmd, { stdio: 'inherit' });

  const finalSize = (fs.statSync(FINAL_MP4).size / 1024 / 1024).toFixed(2);
  console.log(`✅ Demo video successfully generated: ${FINAL_MP4} (${finalSize} MB)`);
}

record().catch((err) => {
  console.error('Recording error:', err);
  process.exit(1);
});
