import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE_URL = process.env.AUDIT_URL || 'http://127.0.0.1:4173';
const OUT_DIR =
  process.argv[2] || 'd:/PonelePlay V2/docs/audits/round-1';

fs.mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'mobile', width: 375, height: 812 },
];

async function launchBrowser() {
  const candidates = [
    undefined,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Users\\TinChoX\\AppData\\Local\\ms-playwright\\chromium-1248\\chrome-win64\\chrome.exe',
    'C:\\Users\\TinChoX\\AppData\\Local\\ms-playwright\\chromium-1228\\chrome-win64\\chrome.exe',
  ];
  for (const executablePath of candidates) {
    try {
      return await chromium.launch({
        headless: true,
        ...(executablePath ? { executablePath } : {}),
      });
    } catch {
      // try next browser executable
    }
  }
  throw new Error('No Chromium/Chrome executable found for Playwright.');
}

async function auditDom(page, label) {
  return page.evaluate((currentLabel) => {
    const docEl = document.documentElement;
    const horizontalOverflow = docEl.scrollWidth > docEl.clientWidth;
    const scrollWidth = docEl.scrollWidth;
    const clientWidth = docEl.clientWidth;

    const brokenImages = Array.from(document.querySelectorAll('img'))
      .filter((img) => !img.complete || img.naturalWidth === 0)
      .map((img) => img.getAttribute('src'));

    const smallButtons = Array.from(
      document.querySelectorAll('button, a[href], [role="tab"]')
    )
      .filter((el) => {
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && (rect.height < 44 || rect.width < 44);
      })
      .map((el) => {
        const rect = el.getBoundingClientRect();
        return {
          text: (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 40),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      });

    return {
      label: currentLabel,
      horizontalOverflow,
      scrollWidth,
      clientWidth,
      brokenImages,
      smallButtonsCount: smallButtons.length,
      smallButtonsSample: smallButtons.slice(0, 12),
    };
  }, label);
}

async function run() {
  const browser = await launchBrowser();
  const report = [];

  try {
    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
      });
      const page = await context.newPage();

      // 1. Landing Page
      await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(350);
      report.push(await auditDom(page, `landing-${vp.name}`));
      await page.screenshot({ path: path.join(OUT_DIR, `01-landing-${vp.name}.png`), fullPage: true });

      // 2. Join Page
      await page.goto(`${BASE_URL}/join/PLAY42`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);
      report.push(await auditDom(page, `join-${vp.name}`));
      await page.screenshot({ path: path.join(OUT_DIR, `02-join-${vp.name}.png`), fullPage: true });

      // 3. Live Room (Host)
      await page.goto(`${BASE_URL}/room/PLAY42`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(350);
      report.push(await auditDom(page, `room-host-${vp.name}`));
      await page.screenshot({ path: path.join(OUT_DIR, `03-room-host-${vp.name}.png`), fullPage: true });

      // 4. Live Room (Guest) + Empty Queue State (only desktop/mobile to keep output focused)
      if (vp.name === 'mobile' || vp.name === 'desktop') {
        await page.getByRole('button', { name: 'Invitado (Guest)' }).click();
        await page.waitForTimeout(200);
        report.push(await auditDom(page, `room-guest-${vp.name}`));
        await page.screenshot({ path: path.join(OUT_DIR, `04-room-guest-${vp.name}.png`), fullPage: true });

        // Back to Host + Open Search Modal
        await page.getByRole('button', { name: 'Anfitrión (Host)' }).click();
        await page.getByRole('button', { name: /Buscar canción o pegar link/i }).click();
        await page.waitForTimeout(250);
        report.push(await auditDom(page, `modal-search-${vp.name}`));
        await page.screenshot({ path: path.join(OUT_DIR, `05-modal-search-${vp.name}.png`) });
        await page.getByRole('button', { name: 'Cerrar buscador' }).click();

        // Open QR Modal
        await page.getByRole('button', { name: /^QR$/i }).click();
        await page.waitForTimeout(250);
        report.push(await auditDom(page, `modal-qr-${vp.name}`));
        await page.screenshot({ path: path.join(OUT_DIR, `06-modal-qr-${vp.name}.png`) });
        await page.getByRole('button', { name: 'Cerrar modal de compartir' }).click();

        // Open Host Settings Modal
        await page.getByRole('button', { name: 'Ajustes de sala del Anfitrión' }).click();
        await page.waitForTimeout(250);
        report.push(await auditDom(page, `modal-settings-${vp.name}`));
        await page.screenshot({ path: path.join(OUT_DIR, `07-modal-settings-${vp.name}.png`) });
        await page.getByRole('button', { name: 'Cerrar ajustes' }).click();
      }

      // 5. TV Mode Web + Android TV Native Preview
      await page.goto(`${BASE_URL}/room/PLAY42/tv`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);
      report.push(await auditDom(page, `tv-web-${vp.name}`));
      await page.screenshot({ path: path.join(OUT_DIR, `08-tv-web-${vp.name}.png`), fullPage: true });

      if (vp.name === 'desktop' || vp.name === 'mobile') {
        await page.getByRole('button', { name: /App Nativa Android TV/i }).click();
        await page.waitForTimeout(250);
        report.push(await auditDom(page, `android-tv-room-${vp.name}`));
        await page.screenshot({ path: path.join(OUT_DIR, `09-android-tv-room-${vp.name}.png`), fullPage: true });

        if (vp.name === 'desktop') {
          await page.getByRole('button', { name: /1\. TvHomeScreen/i }).click();
          await page.waitForTimeout(200);
          report.push(await auditDom(page, `android-tv-home-${vp.name}`));
          await page.screenshot({ path: path.join(OUT_DIR, `10-android-tv-home-${vp.name}.png`), fullPage: true });
        }
      }

      // 6. Party Summary
      await page.goto(`${BASE_URL}/room/PLAY42/summary`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(300);
      report.push(await auditDom(page, `summary-${vp.name}`));
      await page.screenshot({ path: path.join(OUT_DIR, `11-summary-${vp.name}.png`), fullPage: true });

      // 7. Light Mode verification on Live Room
      if (vp.name === 'desktop' || vp.name === 'mobile') {
        await page.goto(`${BASE_URL}/room/PLAY42`, { waitUntil: 'networkidle' });
        await page.getByRole('button', { name: /Cambiar a modo claro/i }).click();
        await page.waitForTimeout(300);
        report.push(await auditDom(page, `room-light-${vp.name}`));
        await page.screenshot({ path: path.join(OUT_DIR, `12-room-light-${vp.name}.png`), fullPage: true });
      }

      await context.close();
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(OUT_DIR, 'dom-audit.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
