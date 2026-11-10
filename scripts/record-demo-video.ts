import { chromium } from '@playwright/test';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const OUTPUT_DIR = path.resolve(process.cwd(), 'demo_recordings');
const FINAL_MP4 = path.resolve(process.cwd(), 'public/sightline-demo-video.mp4');

async function record() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log('🎬 Starting Playwright browser for 1080p demo recording (2:06 synchronized pace)...');
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

  const page = await context.newPage();

  // Helper for human-paced animated typing
  async function typeSlowly(selector: string, text: string, charDelay = 45) {
    await page.focus(selector);
    await page.fill(selector, '');
    for (const char of text) {
      await page.keyboard.type(char);
      await page.waitForTimeout(charDelay);
    }
  }

  // Inject sleek HUD overlay adhering strictly to NEAR / Sightline theme
  async function setupHUD() {
    await page.evaluate(() => {
      const existing = document.getElementById('sightline-video-hud');
      if (existing) existing.remove();

      // Inject mobile readability styles: utilize whitespace, enlarge text for mobile UX
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
          background: rgba(4, 4, 7, 0.92);
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
          background: rgba(4, 4, 7, 0.95);
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
      `;
      document.head.appendChild(style);
      document.documentElement.appendChild(hud);
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

  // Smooth natural scroll helper
  async function smoothScroll(deltaY: number, steps = 30, stepDelay = 25) {
    for (let i = 0; i < steps; i++) {
      await page.mouse.wheel(0, deltaY / steps);
      await page.waitForTimeout(stepDelay);
    }
  }

  console.log('📍 Navigating to Sightline at http://localhost:3300...');
  await page.goto('http://localhost:3300/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await setupHUD();

  // ==========================================
  // BEAT 1: THE PRIVACY DILEMMA (0:00 - 0:20 | 20s)
  // ==========================================
  console.log('🎬 Recording Beat 1: The Privacy Dilemma (0:00 - 0:20)...');
  await updateHUD(
    'BEAT 1 / 6 · THE PRIVACY DILEMMA',
    'Private Document Intelligence for Blind & Low-Vision Users',
    'Paper documents carry intimate medical and financial records. Sightline guarantees hardware-attested enclave privacy.',
    15,
  );
  // Dwell on hero and live telemetry
  await page.waitForTimeout(5000);

  // Smooth scroll down to 4-pillar cryptographic guarantee cards
  await smoothScroll(380, 30, 25);
  await page.waitForTimeout(4500);

  // Smooth scroll down to execution pipeline
  await smoothScroll(420, 30, 25);
  await page.waitForTimeout(4500);

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

  // Scroll to input streams workbench
  await page.locator('#workbench').scrollIntoViewIfNeeded();
  await page.waitForTimeout(4000);

  // Focus on Document input stream
  await page.locator('#capture-heading').scrollIntoViewIfNeeded();
  await page.waitForTimeout(6000);

  // Dwell highlighting pre-upload attestation checks
  await page.waitForTimeout(7000);

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

  // Click Load Sample Document button
  const loadSampleBtn = page.getByRole('button', { name: /load sample document/i });
  if (await loadSampleBtn.isVisible()) {
    await loadSampleBtn.click();
    await page.waitForTimeout(3000);
  }

  // Scroll to observe the loaded pages in the tray
  await smoothScroll(280, 25, 25);
  await page.waitForTimeout(5000);

  // Press Read these photographs
  await updateHUD(
    'BEAT 3 / 6 · TEE PIPELINE EXECUTION',
    'Reading Photographs Inside Intel TDX Enclaves',
    'Confidential vision transcription and fact extraction running inside attested hardware memory.',
    60,
  );

  const readPhotosBtn = page.getByRole('button', { name: /read these photographs/i });
  if (await readPhotosBtn.isVisible()) {
    await readPhotosBtn.click();
  }

  // Allow pipeline completion to transition smoothly to /read
  await page.waitForTimeout(4000);
  await page.waitForURL('**/read', { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await setupHUD(); // Re-inject HUD after client navigation

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

  // View summary card
  await page.waitForTimeout(5500);

  // Smooth scroll through Summary to Key facts
  await smoothScroll(360, 30, 25);
  await page.waitForTimeout(3000);

  // Expand a grounded fact disclosure to show verbatim quote
  const factDisclosure = page.locator('details summary').first();
  if (await factDisclosure.isVisible()) {
    await factDisclosure.click();
    await page.waitForTimeout(5000);
  }

  // Scroll down to Safety Notices
  await smoothScroll(380, 30, 25);
  await page.waitForTimeout(6500);

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
  if (await askHeading.isVisible()) {
    await askHeading.scrollIntoViewIfNeeded();
  }
  await page.waitForTimeout(1500);

  // Question 1: Grounded query (reference number)
  const q1Btn = page.getByRole('button', { name: 'What reference number is on these pages?' });
  if (await q1Btn.isVisible()) {
    await q1Btn.click();
    await page.waitForTimeout(800);
  } else {
    await typeSlowly('#question', 'What reference number is on these pages?', 40);
    await page.waitForTimeout(600);
  }
  const askButton = page.getByRole('button', { name: /^ask$/i });
  if (await askButton.isVisible()) {
    await askButton.click();
    await page.waitForTimeout(4500);
  }

  // Question 2: Unanswerable query to demonstrate honest refusal (payment deadline)
  const q2Btn = page.getByRole('button', { name: 'Is there a payment deadline in this document?' });
  if (await q2Btn.isVisible()) {
    await q2Btn.click();
    await page.waitForTimeout(800);
  } else {
    await typeSlowly('#question', 'Is there a payment deadline in this document?', 40);
    await page.waitForTimeout(600);
  }
  if (await askButton.isVisible()) {
    await askButton.click();
    await page.waitForTimeout(4500);
  }

  // Scroll to showcase both answers in the Answers region
  const answersSection = page.locator('[data-testid="answers"]');
  if (await answersSection.isVisible()) {
    await answersSection.scrollIntoViewIfNeeded();
    await page.waitForTimeout(3000);
  }

  // ==========================================
  // BEAT 6: TRUST RECEIPT & ONE-CLICK FORGET (1:45 - 2:06 | 21s)
  // ==========================================
  console.log('🎬 Recording Beat 6: Trust Receipt & Complete Forget (1:45 - 2:06)...');
  await updateHUD(
    'BEAT 6 / 6 · TRUST RECEIPT & PURGE',
    'Cryptographic Trust Receipt & One-Click Forget',
    'Lists every hardware attestation and signature check. One-click Forget wipes memory and object URLs completely.',
    98,
  );

  // Navigate to /trust
  const trustLink = page.getByRole('link', { name: 'Verification' });
  if (await trustLink.isVisible()) {
    await trustLink.click();
    await page.waitForURL('**/trust', { timeout: 10000 }).catch(() => {});
  }
  await page.waitForTimeout(1000);
  await setupHUD();
  await updateHUD(
    'BEAT 6 / 6 · TRUST RECEIPT & PURGE',
    'Cryptographic Trust Receipt & One-Click Forget',
    'Lists every hardware attestation and signature check. One-click Forget wipes memory and object URLs completely.',
    98,
  );

  // Review the verification checklist
  await page.waitForTimeout(4000);
  await smoothScroll(400, 25, 25);
  await page.waitForTimeout(3000);

  // Scroll to "Forget this document" button
  await smoothScroll(400, 25, 25);
  await page.waitForTimeout(3000);

  // Press Forget this document
  const forgetBtn = page.getByRole('button', { name: /forget this document/i });
  if (await forgetBtn.isVisible()) {
    await forgetBtn.click();
    await page.waitForTimeout(2500);
  }

  // Final confirmation screen
  await page.waitForURL('**/', { timeout: 10000 }).catch(() => {});
  await setupHUD();
  await updateHUD(
    'SIGHTLINE · ZERO CUSTODY VERIFIED',
    'Document Forgotten. All In-Memory State Purged.',
    'Built for NEAR Hackathon 2026 · Privacy & Private AI Track · Open Source MIT',
    100,
  );
  await page.waitForTimeout(5000);

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

  const ffmpegCmd = `ffmpeg -y -i "${latestWebm}" -c:v libx264 -pix_fmt yuv420p -r 30 -preset fast -crf 22 -movflags +faststart "${FINAL_MP4}"`;
  execSync(ffmpegCmd, { stdio: 'inherit' });

  const finalSize = (fs.statSync(FINAL_MP4).size / 1024 / 1024).toFixed(2);
  console.log(`✅ Demo video successfully generated: ${FINAL_MP4} (${finalSize} MB)`);
}

record().catch((err) => {
  console.error('Recording error:', err);
  process.exit(1);
});
