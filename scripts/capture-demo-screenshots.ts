import { chromium } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOT_DIR = path.resolve(process.cwd(), 'public/screenshots');

async function capture() {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  console.log('📸 Launching Chromium to capture 6-beat demo screenshots...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });

  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2, // Retina 2x for ultra crisp screenshots
  });

  async function applyMobileTune() {
    await page.evaluate(() => {
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
    });
  }

  // Beat 1: Hero & Telemetry
  console.log('📸 Beat 1: Hero & Telemetry...');
  await page.goto('http://localhost:3300/', { waitUntil: 'networkidle' });
  await applyMobileTune();
  await page.waitForTimeout(1000);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'beat-1-hero-telemetry.png') });

  // Beat 2: Hardware Attestation / Workbench
  console.log('📸 Beat 2: Hardware Attestation Workbench...');
  await applyMobileTune();
  await page.locator('#workbench').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'beat-2-hardware-attestation.png') });

  // Beat 3: Multi-Page Capture
  console.log('📸 Beat 3: Multi-page document loaded in tray...');
  const loadSampleBtn = page.getByRole('button', { name: /load sample document/i });
  if (await loadSampleBtn.isVisible()) {
    await loadSampleBtn.click();
    await page.waitForTimeout(1500);
  }
  await applyMobileTune();
  await page.locator('#capture-heading').scrollIntoViewIfNeeded();
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'beat-3-multipage-capture.png') });

  // Read documents to enter /read
  console.log('📸 Reading document to get to results...');
  const readBtn = page.getByRole('button', { name: /read these photographs/i });
  if (await readBtn.isVisible()) {
    await readBtn.click();
    await page.waitForURL('**/read', { timeout: 15000 });
    await page.waitForTimeout(1500);
  }
  await applyMobileTune();

  // Beat 4: Verifiable hierarchy & Fact Grounding (expand disclosure)
  console.log('📸 Beat 4: Grounded Results & Verbatim Quote Disclosure...');
  await applyMobileTune();
  const factDisclosure = page.locator('details summary').first();
  if (await factDisclosure.isVisible()) {
    await factDisclosure.click();
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'beat-4-grounded-results.png') });

  // Beat 5: Grounded Q&A
  console.log('📸 Beat 5: Grounded Q&A & Honest Refusal...');
  const askHeading = page.locator('#ask-heading');
  if (await askHeading.isVisible()) {
    await askHeading.scrollIntoViewIfNeeded();
  }
  const q1Btn = page.getByRole('button', { name: 'What reference number is on these pages?' });
  if (await q1Btn.isVisible()) {
    await q1Btn.click();
  } else {
    await page.fill('#question', 'What reference number is on these pages?');
  }
  const askBtn = page.getByRole('button', { name: /^ask$/i });
  if (await askBtn.isVisible()) {
    await askBtn.click();
    await page.waitForTimeout(1500);
  }
  const q2Btn = page.getByRole('button', { name: 'Is there a payment deadline in this document?' });
  if (await q2Btn.isVisible()) {
    await q2Btn.click();
    if (await askBtn.isVisible()) {
      await askBtn.click();
      await page.waitForTimeout(1500);
    }
  }
  const answersList = page.locator('[data-testid="answers"]');
  if (await answersList.isVisible()) {
    await answersList.scrollIntoViewIfNeeded();
    await page.waitForTimeout(800);
  }
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'beat-5-grounded-qa.png') });

  // Beat 6: Trust Receipt
  console.log('📸 Beat 6: Trust Receipt...');
  const trustLink = page.getByRole('link', { name: 'Verification' });
  if (await trustLink.isVisible()) {
    await trustLink.click();
    await page.waitForURL('**/trust', { timeout: 10000 });
    await page.waitForTimeout(1200);
  }
  await applyMobileTune();
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'beat-6-trust-receipt.png') });

  await browser.close();
  console.log('✅ All 6 demo screenshots successfully captured in public/screenshots/');
}

capture().catch((err) => {
  console.error('Screenshot capture failed:', err);
  process.exit(1);
});
