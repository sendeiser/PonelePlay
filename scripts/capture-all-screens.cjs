const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
const outputDir = path.resolve('C:/Users/TinChoX/.gemini/antigravity/brain/cc2e98cf-9ab1-4ca4-9e49-a3f8710e0fd6/screenshots');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function checkOverflow(page, label) {
  const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
  const clientWidth = await page.evaluate(() => document.documentElement.clientWidth);
  const overflow = scrollWidth - clientWidth;
  if (overflow > 0) {
    console.warn(`[OVERFLOW] ${label}: ${overflow}px horizontal overflow (scrollWidth: ${scrollWidth}, clientWidth: ${clientWidth})`);
  } else {
    console.log(`[OK NO-OVERFLOW] ${label}`);
  }
}

async function run() {
  console.log(`Starting visual capture and audit against ${baseUrl}...`);
  const browser = await chromium.launch({ headless: true });

  // 1. MOBILE SUITE (iPhone 14 / Pixel: 390x844)
  console.log('\n--- CAPTURING MOBILE SCREENS (390x844) ---');
  const mContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
    isMobile: true,
    hasTouch: true,
  });
  const mPage = await mContext.newPage();

  // Landing Mobile
  await mPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await mPage.waitForTimeout(500);
  await checkOverflow(mPage, 'Landing Mobile');
  await mPage.screenshot({ path: path.join(outputDir, '01_landing_mobile.png'), fullPage: false });

  // Client Vivo Mobile
  await mPage.goto(`${baseUrl}/c/billar-aurora`, { waitUntil: 'domcontentloaded' });
  await mPage.waitForTimeout(600);
  await checkOverflow(mPage, 'Client Vivo Mobile');
  await mPage.screenshot({ path: path.join(outputDir, '02_client_vivo_mobile.png'), fullPage: false });

  // Client Proponer tab
  const propBtn = mPage.locator('button:has-text("Proponer")').first();
  if (await propBtn.isVisible()) {
    await propBtn.click({ force: true });
    await mPage.waitForTimeout(400);
    await checkOverflow(mPage, 'Client Proponer Mobile');
    await mPage.screenshot({ path: path.join(outputDir, '03_client_proponer_mobile.png'), fullPage: false });
  }

  // Client Canjear tab
  const canjBtn = mPage.locator('button:has-text("Canjear")').first();
  if (await canjBtn.isVisible()) {
    await canjBtn.click({ force: true });
    await mPage.waitForTimeout(400);
    await checkOverflow(mPage, 'Client Canjear Mobile');
    await mPage.screenshot({ path: path.join(outputDir, '04_client_canjear_mobile.png'), fullPage: false });
  }

  // Client Mi Mesa tab
  const mesaBtn = mPage.locator('button:has-text("Mi Mesa")').first();
  if (await mesaBtn.isVisible()) {
    await mesaBtn.click({ force: true });
    await mPage.waitForTimeout(400);
    await checkOverflow(mPage, 'Client Mi Mesa Mobile');
    await mPage.screenshot({ path: path.join(outputDir, '05_client_mesa_mobile.png'), fullPage: false });
  }

  // TV Entry Mobile
  await mPage.goto(`${baseUrl}/tv`, { waitUntil: 'domcontentloaded' });
  await mPage.waitForTimeout(500);
  await checkOverflow(mPage, 'TV Quick Mobile');
  await mPage.screenshot({ path: path.join(outputDir, '06_tv_entry_mobile.png'), fullPage: false });

  // Login Mobile
  await mPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await mPage.waitForTimeout(500);
  await checkOverflow(mPage, 'Login Mobile');
  await mPage.screenshot({ path: path.join(outputDir, '07_login_mobile.png'), fullPage: false });

  // Login execution
  await mPage.locator('input[type="email"]').fill('demo@poneleplay.com');
  await mPage.locator('input[type="password"]').fill('poneleplay2026');
  await mPage.locator('button[type="submit"]').click();
  await mPage.waitForURL('**/panel/**', { timeout: 10000 }).catch(() => {});
  await mPage.waitForTimeout(1000);

  // Panel Dashboard Mobile
  await checkOverflow(mPage, 'Panel Dashboard Mobile');
  await mPage.screenshot({ path: path.join(outputDir, '08_panel_dashboard_mobile.png'), fullPage: false });

  // Open Queue Drawer on Mobile (Track button in footer)
  const mobileDrawerTrigger = mPage.locator('footer button[title*="cola" i]').first();
  if (await mobileDrawerTrigger.isVisible()) {
    await mobileDrawerTrigger.click({ force: true });
    await mPage.waitForTimeout(600);
    await checkOverflow(mPage, 'Panel Drawer Mobile');
    await mPage.screenshot({ path: path.join(outputDir, '09_panel_drawer_mobile.png'), fullPage: false });

    // Close drawer
    const closeBtn = mPage.locator('button[aria-label*="Cerrar" i], button[title*="Cerrar" i]').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click({ force: true });
      await mPage.waitForTimeout(300);
    }
  }

  // Panel Códigos Mobile
  await mPage.goto(`${baseUrl}/panel/billar-aurora/codigos`, { waitUntil: 'domcontentloaded' });
  await mPage.waitForTimeout(600);
  await checkOverflow(mPage, 'Panel Códigos Mobile');
  await mPage.screenshot({ path: path.join(outputDir, '10_panel_codigos_mobile.png'), fullPage: false });

  // Panel Catálogo Mobile
  await mPage.goto(`${baseUrl}/panel/billar-aurora/catalogo`, { waitUntil: 'domcontentloaded' });
  await mPage.waitForTimeout(600);
  await checkOverflow(mPage, 'Panel Catálogo Mobile');
  await mPage.screenshot({ path: path.join(outputDir, '11_panel_catalogo_mobile.png'), fullPage: false });

  // Panel Ajustes Mobile
  await mPage.goto(`${baseUrl}/panel/billar-aurora/ajustes`, { waitUntil: 'domcontentloaded' });
  await mPage.waitForTimeout(600);
  await checkOverflow(mPage, 'Panel Ajustes Mobile');
  await mPage.screenshot({ path: path.join(outputDir, '12_panel_ajustes_mobile.png'), fullPage: false });

  await mContext.close();

  // 2. DESKTOP SUITE (1440x900)
  console.log('\n--- CAPTURING DESKTOP SCREENS (1440x900) ---');
  const dContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const dPage = await dContext.newPage();

  // Landing Desktop
  await dPage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await dPage.waitForTimeout(500);
  await checkOverflow(dPage, 'Landing Desktop');
  await dPage.screenshot({ path: path.join(outputDir, '13_landing_desktop.png'), fullPage: false });

  // Client Vivo Desktop
  await dPage.goto(`${baseUrl}/c/billar-aurora`, { waitUntil: 'domcontentloaded' });
  await dPage.waitForTimeout(600);
  await checkOverflow(dPage, 'Client Vivo Desktop');
  await dPage.screenshot({ path: path.join(outputDir, '14_client_vivo_desktop.png'), fullPage: false });

  // Client Proponer Desktop
  const dPropBtn = dPage.locator('button:has-text("Proponer")').first();
  if (await dPropBtn.isVisible()) {
    await dPropBtn.click({ force: true });
    await dPage.waitForTimeout(400);
    await checkOverflow(dPage, 'Client Proponer Desktop');
    await dPage.screenshot({ path: path.join(outputDir, '15_client_proponer_desktop.png'), fullPage: false });
  }

  // TV Player Screen Desktop
  await dPage.goto(`${baseUrl}/player/billar-aurora`, { waitUntil: 'domcontentloaded' });
  await dPage.waitForTimeout(1000);
  await checkOverflow(dPage, 'Player TV Desktop');
  await dPage.screenshot({ path: path.join(outputDir, '16_player_tv_desktop.png'), fullPage: false });

  // TV Quick Entry Desktop
  await dPage.goto(`${baseUrl}/tv`, { waitUntil: 'domcontentloaded' });
  await dPage.waitForTimeout(500);
  await checkOverflow(dPage, 'TV Quick Desktop');
  await dPage.screenshot({ path: path.join(outputDir, '17_tv_entry_desktop.png'), fullPage: false });

  // Login Desktop
  await dPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
  await dPage.waitForTimeout(500);
  await checkOverflow(dPage, 'Login Desktop');
  await dPage.screenshot({ path: path.join(outputDir, '18_login_desktop.png'), fullPage: false });

  // Login execution for desktop panel
  await dPage.locator('input[type="email"]').fill('demo@poneleplay.com');
  await dPage.locator('input[type="password"]').fill('poneleplay2026');
  await dPage.locator('button[type="submit"]').click();
  await dPage.waitForURL('**/panel/**', { timeout: 10000 }).catch(() => {});
  await dPage.waitForTimeout(1000);

  // Panel Dashboard Desktop
  await checkOverflow(dPage, 'Panel Dashboard Desktop');
  await dPage.screenshot({ path: path.join(outputDir, '19_panel_dashboard_desktop.png'), fullPage: false });

  // Click track or Cola button to open drawer on Desktop
  const desktopDrawerTrigger = dPage.locator('footer button[title*="cola" i]').first();
  if (await desktopDrawerTrigger.isVisible()) {
    await desktopDrawerTrigger.click({ force: true });
    await dPage.waitForTimeout(600);
    await checkOverflow(dPage, 'Panel Drawer Desktop');
    await dPage.screenshot({ path: path.join(outputDir, '20_panel_drawer_desktop.png'), fullPage: false });

    // Close drawer
    const closeBtn = dPage.locator('button[aria-label*="Cerrar" i], button[title*="Cerrar" i]').first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click({ force: true });
      await dPage.waitForTimeout(300);
    }
  }

  // Panel Códigos Desktop
  await dPage.goto(`${baseUrl}/panel/billar-aurora/codigos`, { waitUntil: 'domcontentloaded' });
  await dPage.waitForTimeout(600);
  await checkOverflow(dPage, 'Panel Códigos Desktop');
  await dPage.screenshot({ path: path.join(outputDir, '21_panel_codigos_desktop.png'), fullPage: false });

  // Panel Catálogo Desktop
  await dPage.goto(`${baseUrl}/panel/billar-aurora/catalogo`, { waitUntil: 'domcontentloaded' });
  await dPage.waitForTimeout(600);
  await checkOverflow(dPage, 'Panel Catálogo Desktop');
  await dPage.screenshot({ path: path.join(outputDir, '22_panel_catalogo_desktop.png'), fullPage: false });

  // Panel Ajustes Desktop
  await dPage.goto(`${baseUrl}/panel/billar-aurora/ajustes`, { waitUntil: 'domcontentloaded' });
  await dPage.waitForTimeout(600);
  await checkOverflow(dPage, 'Panel Ajustes Desktop');
  await dPage.screenshot({ path: path.join(outputDir, '23_panel_ajustes_desktop.png'), fullPage: false });

  await dContext.close();
  await browser.close();

  console.log('\n--- ALL SCREENSHOTS CAPTURED SUCCESSFULLY! ---');
  console.log(`Directory: ${outputDir}`);
  const files = fs.readdirSync(outputDir);
  console.log(`Total files: ${files.length}`);
}

run().catch((err) => {
  console.error('Error running capture:', err);
  process.exit(1);
});
