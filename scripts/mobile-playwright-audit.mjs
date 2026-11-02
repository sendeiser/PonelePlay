import { chromium } from "@playwright/test";

const VIEWPORTS = [
  { name: "Android Small (360x740)", width: 360, height: 740 },
  { name: "iPhone SE (375x667)", width: 375, height: 667 },
  { name: "iPhone 14 (390x844)", width: 390, height: 844 },
  { name: "Pixel 7 (412x915)", width: 412, height: 915 },
];

async function inspectPage(page, contextName) {
  return await page.evaluate((ctx) => {
    const docW = document.documentElement.scrollWidth;
    const winW = window.innerWidth;
    const bodyW = document.body.scrollWidth;
    const hasHorizontalOverflow = docW > winW + 1 || bodyW > winW + 1;

    const badElements = [];
    const all = document.querySelectorAll("*");
    for (const el of all) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        if (rect.right > winW + 2) {
          badElements.push({
            tag: el.tagName.toLowerCase(),
            className: (el.className || "").toString().slice(0, 100),
            text: (el.innerText || "").slice(0, 40).replace(/\n/g, " "),
            right: Math.round(rect.right),
            width: Math.round(rect.width),
            overflowBy: Math.round(rect.right - winW),
          });
        }
      }
    }

    return {
      contextName: ctx,
      docW,
      winW,
      hasHorizontalOverflow,
      badElements: badElements.slice(0, 5),
    };
  }, contextName);
}

async function runDeepAudit() {
  const browser = await chromium.launch({ headless: true });
  console.log("=== INICIANDO AUDITORÍA PLAYWRIGHT PROFUNDA (TODOS LOS TABS Y PANELES) ===");

  const issues = [];

  for (const vp of VIEWPORTS) {
    console.log(`\n📱 Probando Viewport: ${vp.name}`);
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      userAgent: "Mozilla/5.0 (Linux; Android 13; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36",
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });

    const page = await context.newPage();

    // 1. Landing
    await page.goto("http://localhost:3005/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);
    let res = await inspectPage(page, "Landing / Home");
    if (res.hasHorizontalOverflow) issues.push({ vp: vp.name, res });

    // 2. Client Night - Tab Vivo
    await page.goto("http://localhost:3005/p/billar-aurora", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    res = await inspectPage(page, "Client Tab: En Vivo");
    if (res.hasHorizontalOverflow) issues.push({ vp: vp.name, res });

    // 3. Client Night - Tab Proponer
    const proponerBtn = page.locator('button:has-text("Proponer")');
    if (await proponerBtn.count() > 0) {
      await proponerBtn.first().click();
      await page.waitForTimeout(400);
      res = await inspectPage(page, "Client Tab: Proponer");
      if (res.hasHorizontalOverflow) issues.push({ vp: vp.name, res });
    }

    // 4. Client Night - Tab Canjear
    const canjearBtn = page.locator('button:has-text("Canjear")');
    if (await canjearBtn.count() > 0) {
      await canjearBtn.first().click();
      await page.waitForTimeout(400);
      res = await inspectPage(page, "Client Tab: Canjear");
      if (res.hasHorizontalOverflow) issues.push({ vp: vp.name, res });
    }

    // 5. Client Night - Tab Mi Mesa / Actividad
    const mesaBtn = page.locator('button:has-text("Mi Mesa")');
    if (await mesaBtn.count() > 0) {
      await mesaBtn.first().click();
      await page.waitForTimeout(400);
      res = await inspectPage(page, "Client Tab: Mi Mesa");
      if (res.hasHorizontalOverflow) issues.push({ vp: vp.name, res });
    }

    // 6. Panel Admin / Operador
    await page.goto("http://localhost:3005/panel/billar-aurora", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(800);
    res = await inspectPage(page, "Panel Admin (/panel/billar-aurora)");
    if (res.hasHorizontalOverflow) issues.push({ vp: vp.name, res });

    // 7. Panel Codigos
    await page.goto("http://localhost:3005/panel/billar-aurora/codigos", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);
    res = await inspectPage(page, "Panel Códigos");
    if (res.hasHorizontalOverflow) issues.push({ vp: vp.name, res });

    // 8. Panel Catálogo
    await page.goto("http://localhost:3005/panel/billar-aurora/catalogo", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);
    res = await inspectPage(page, "Panel Catálogo");
    if (res.hasHorizontalOverflow) issues.push({ vp: vp.name, res });

    // 9. Panel Ajustes
    await page.goto("http://localhost:3005/panel/billar-aurora/ajustes", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);
    res = await inspectPage(page, "Panel Ajustes");
    if (res.hasHorizontalOverflow) issues.push({ vp: vp.name, res });

    await context.close();
  }

  await browser.close();

  console.log("\n=== RESUMEN AUDITORÍA PROFUNDA ===");
  if (issues.length === 0) {
    console.log("🎉 ¡EXCELENTE! Cero desbordes horizontales en todas las vistas, tabs y paneles.");
  } else {
    console.log(`⚠️ Se encontraron ${issues.length} desbordes horizontales:`);
    for (const it of issues) {
      console.log(`  ❌ [${it.vp}] ${it.res.contextName}: docW=${it.res.docW} > winW=${it.res.winW}`);
      for (const el of it.res.badElements) {
        console.log(`     👉 <${el.tag} class="${el.className}"> (overflowBy=${el.overflowBy}px)`);
      }
    }
  }
}

runDeepAudit().catch(console.error);
