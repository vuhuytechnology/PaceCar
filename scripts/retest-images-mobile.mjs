import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const baseURL = process.env.PACECAR_BASE_URL || "http://127.0.0.1:4000";
const executablePath =
  process.env.PACECAR_BROWSER ||
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const browser = await chromium.launch({ executablePath, headless: true });

try {
  const page = await browser.newPage({
    viewport: { width: 430, height: 932 },
    deviceScaleFactor: 1,
  });
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto(baseURL, { waitUntil: "networkidle" });
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);

  const home = await page.evaluate(() => ({
    overflow:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
    optimizedImages: performance
      .getEntriesByType("resource")
      .filter((entry) => /home-dest-.*\.jpg$/.test(entry.name))
      .map((entry) => new URL(entry.name).pathname),
  }));
  assert.ok(home.overflow <= 1, `Trang chủ tràn ngang ${home.overflow}px`);
  assert.ok(
    home.optimizedImages.length >= 4,
    "Ảnh điểm đến tối ưu chưa được tải",
  );

  await page.goto(`${baseURL}/cars`, { waitUntil: "networkidle" });
  const imageLocator = page.locator("main img");
  for (let index = 0; index < (await imageLocator.count()); index += 1) {
    await imageLocator.nth(index).scrollIntoViewIfNeeded();
  }
  await page.waitForFunction(() =>
    [...document.querySelectorAll("main img")].every(
      (image) => image.complete && image.naturalWidth > 0,
    ),
  );
  const carImages = await page.locator("main img").evaluateAll((images) =>
    images.map((image) => ({
      src: image.currentSrc || image.src,
      complete: image.complete,
      naturalWidth: image.naturalWidth,
    })),
  );
  assert.ok(carImages.length > 0, "Không tìm thấy ảnh xe trong danh sách");
  assert.ok(
    carImages.every((image) => image.complete && image.naturalWidth > 0),
    `Có ảnh xe bị vỡ: ${JSON.stringify(carImages.filter((image) => !image.naturalWidth))}`,
  );
  const carsOverflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  assert.ok(carsOverflow <= 1, `Trang xe tràn ngang ${carsOverflow}px`);

  await page.goto(`${baseURL}/login`, { waitUntil: "networkidle" });
  await page.locator('input[type="email"]').fill("owner@pacecar.vn");
  await page.locator('input[type="password"]').fill("123456");
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/dashboard\/owner$/);
  await page.goto(`${baseURL}/owner/cars`, { waitUntil: "networkidle" });
  await page.locator("main h1").waitFor();
  const ownerRouteLoaded = new URL(page.url()).pathname === "/owner/cars";
  assert.ok(ownerRouteLoaded, "Route quản lý xe tách chunk không tải được");
  assert.deepEqual(pageErrors, []);

  console.log(
    JSON.stringify(
      {
        ok: true,
        viewport: "430x932",
        homeOverflow: home.overflow,
        carsOverflow,
        optimizedDestinationImages: home.optimizedImages.length,
        validCarImages: carImages.length,
        ownerRouteLoaded,
        pageErrors: pageErrors.length,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
