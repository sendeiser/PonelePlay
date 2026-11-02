import { test, expect } from "@playwright/test";

test.describe("Mobile UX & PWA Verification", () => {
  const viewports = [
    { name: "Android Small", width: 360, height: 740 },
    { name: "iPhone 14", width: 390, height: 844 },
    { name: "Pixel 7", width: 412, height: 915 },
  ];

  test("PWA manifest is valid and accessible", async ({ request }) => {
    const res = await request.get("http://localhost:3005/manifest.json");
    expect(res.status()).toBe(200);
    const data = await res.json();
    expect(data.name).toContain("PonelePlay");
    expect(data.display).toBe("standalone");
    expect(data.icons.length).toBeGreaterThan(0);
  });

  test("Service Worker sw.js is accessible and precaches assets", async ({ request }) => {
    const res = await request.get("http://localhost:3005/sw.js");
    expect(res.status()).toBe(200);
    const text = await res.text();
    expect(text).toContain("poneleplay-cache");
    expect(text).toContain("install");
  });

  test("PWA Icons are accessible and return 200", async ({ request }) => {
    const icon192 = await request.get("http://localhost:3005/icons/icon-192.png");
    expect(icon192.status()).toBe(200);

    const icon512 = await request.get("http://localhost:3005/icons/icon-512.png");
    expect(icon512.status()).toBe(200);

    const appleIcon = await request.get("http://localhost:3005/icons/apple-touch-icon.png");
    expect(appleIcon.status()).toBe(200);
  });

  for (const vp of viewports) {
    test(`No horizontal overflow on client night screen (${vp.name})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("http://localhost:3005/p/billar-aurora", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(500);

      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 1;
      });
      expect(hasOverflow).toBe(false);

      // Check tab switching without overflow
      const tabs = ["Proponer", "Canjear", "Mi Mesa", "En Vivo"];
      for (const tabText of tabs) {
        const btn = page.locator(`button:has-text("${tabText}")`);
        if (await btn.count() > 0) {
          await btn.first().click();
          await page.waitForTimeout(300);
          const tabOverflow = await page.evaluate(() => {
            return document.documentElement.scrollWidth > window.innerWidth + 1;
          });
          expect(tabOverflow).toBe(false);
        }
      }
    });

    test(`Landing page responsive and clean (${vp.name})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto("http://localhost:3005/", { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(400);

      const hasOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > window.innerWidth + 1;
      });
      expect(hasOverflow).toBe(false);
    });
  }
});

