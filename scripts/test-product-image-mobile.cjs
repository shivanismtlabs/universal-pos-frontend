const { chromium } = require("playwright");
const path = require("path");

(async () => {
  const outDir = path.join(__dirname, "tmp-image-test");
  const imgPath = path.join(outDir, "test-product.png");
  const errors = [];
  const browser = await chromium.launch({ headless: true, channel: "chrome" });
  const page = await browser.newPage({
    viewport: { width: 438, height: 503 },
    isMobile: true,
    hasTouch: true,
  });
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
  await page.fill("#email", "owner@demo.shop");
  await page.fill("#password", "WalitShop@2026");
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  await page.goto("http://localhost:3000/catalog", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await page.getByRole("button", { name: /Add product/i }).first().click();
  await page.waitForTimeout(800);
  const segs = page.locator("button").filter({ hasText: /^Add product$/ });
  if ((await segs.count()) > 0) await segs.first().click();
  await page.waitForTimeout(600);
  await page.locator('input[type="file"]').last().setInputFiles(imgPath);
  await page.waitForTimeout(3500);
  const after = await page.locator("main").innerText();
  await page.screenshot({
    path: path.join(outDir, "3-mobile-after.png"),
    fullPage: true,
  });
  console.log("after_len", after.trim().length);
  console.log("preview", await page.locator('main img[src^="blob:"]').count());
  console.log("errors", errors);
  console.log("BLANK", after.trim().length < 40);
  console.log("has_Title", after.includes("Title"));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
