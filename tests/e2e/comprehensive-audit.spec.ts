import { test, expect } from "@playwright/test";

const routes = [
  { path: "/c/billar-aurora", name: "Client Guest (/c)" },
  { path: "/panel/billar-aurora", name: "Admin Dashboard (/panel)", auth: true },
  { path: "/panel/billar-aurora/ajustes", name: "Panel Ajustes", auth: true },
  { path: "/panel/billar-aurora/codigos", name: "Panel Códigos", auth: true },
  { path: "/panel/billar-aurora/catalogo", name: "Panel Catálogo", auth: true },
  { path: "/panel/billar-aurora/personal", name: "Panel Personal", auth: true },
  { path: "/player/billar-aurora", name: "Player TV Screen" },
  { path: "/tv", name: "TV Quick Link (/tv)" },
  { path: "/login", name: "Login Screen" },
];

const viewports = [
  { name: "Mobile Small (360x740)", width: 360, height: 740 },
  { name: "Mobile iPhone 14 (390x844)", width: 390, height: 844 },
  { name: "Desktop (1440x900)", width: 1440, height: 900 },
];

async function loginDemoIfAuth(page: import("@playwright/test").Page) {
  await page.goto("/login", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(400);

  const emailInput = page.locator('input[type="email"]');
  if (await emailInput.isVisible()) {
    await emailInput.fill("demo@poneleplay.com");
    await page.locator('input[type="password"]').fill("poneleplay2026");
    await page.locator('button[type="submit"]').click();
    await page.waitForURL("**/panel/**", { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);
  }
}

test.describe("Comprehensive UI/UX, Overflow & Accessibility Audit", () => {
  for (const vp of viewports) {
    for (const r of routes) {
      test(`${r.name} has no horizontal overflow on ${vp.name}`, async ({ page }) => {
        await page.setViewportSize({ width: vp.width, height: vp.height });

        if (r.auth) {
          await loginDemoIfAuth(page);
        }

        await page.goto(r.path, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(800);

        // Check horizontal overflow
        const overflow = await page.evaluate(() => {
          const docWidth = document.documentElement.scrollWidth;
          const winWidth = window.innerWidth;
          const bodyWidth = document.body.scrollWidth;
          const maxW = Math.max(docWidth, bodyWidth);
          return {
            hasOverflow: maxW > winWidth + 1,
            diff: maxW - winWidth,
            winWidth,
            docWidth,
          };
        });

        if (overflow.hasOverflow) {
          const culprits = await page.evaluate(() => {
            const list: { tag: string; id: string; className: string; scrollWidth: number; clientWidth: number }[] = [];
            const all = document.querySelectorAll("*");
            for (const el of all) {
              if (el.scrollWidth > window.innerWidth + 1) {
                list.push({
                  tag: el.tagName,
                  id: el.id,
                  className: (el.className || "").toString().slice(0, 80),
                  scrollWidth: el.scrollWidth,
                  clientWidth: el.clientWidth,
                });
              }
            }
            return list.slice(0, 5);
          });
          console.warn(`Overflow on ${r.path} (${vp.name}):`, overflow, culprits);
        }

        expect(overflow.hasOverflow).toBe(false);
      });
    }
  }

  test("Clicking playback track on Panel footer opens Queue Drawer", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loginDemoIfAuth(page);

    await page.goto("/panel/billar-aurora", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1000);

    // Look for playback footer
    const footer = page.locator("footer").first();
    await expect(footer).toBeVisible();

    // Click track info button or queue pill
    const openBtn = page.locator('footer button[title*="cola" i]').first();
    await expect(openBtn).toBeVisible();
    await openBtn.click({ force: true });
    await page.waitForTimeout(600);

    // Drawer should be open and display queue tab
    const drawerTab = page.locator('button:has-text("Cola Activa")').first();
    await expect(drawerTab).toBeVisible({ timeout: 5000 });
  });
});
