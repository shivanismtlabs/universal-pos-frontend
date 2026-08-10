const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");

async function makePng(filePath) {
  // minimal valid PNG without external deps if pngjs missing
  try {
    const png = new PNG({ width: 64, height: 64 });
    for (let y = 0; y < 64; y++) {
      for (let x = 0; x < 64; x++) {
        const i = (64 * y + x) << 2;
        png.data[i] = 26;
        png.data[i + 1] = 86;
        png.data[i + 2] = 219;
        png.data[i + 3] = 255;
      }
    }
    await new Promise((res, rej) => {
      png.pack().pipe(fs.createWriteStream(filePath)).on("finish", res).on("error", rej);
    });
  } catch {
    // 1x1 PNG base64
    const b64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    fs.writeFileSync(filePath, Buffer.from(b64, "base64"));
  }
}

(async () => {
  const outDir = path.join(__dirname, "tmp-image-test");
  fs.mkdirSync(outDir, { recursive: true });
  const imgPath = path.join(outDir, "test-product.png");
  await makePng(imgPath);

  const errors = [];
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push("console: " + msg.text());
  });

  try {
    await page.goto("http://localhost:3000/login", { waitUntil: "networkidle" });
    await page.fill("#email", "owner@demo.shop");
    await page.fill("#password", "WalitShop@2026");
    await page.click('button[type="submit"]');
    await page.waitForURL(/dashboard|catalog|pos/, { timeout: 20000 });

    await page.goto("http://localhost:3000/catalog", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // open Add product panel
    const addBtn = page.getByRole("button", { name: /Add product/i }).first();
    if (await addBtn.count()) {
      await addBtn.click();
      await page.waitForTimeout(500);
    }
    // also try secontrol Add product tab
    const addTab = page.getByRole("button", { name: "Add product" });
    if (await addTab.count()) {
      await addTab.first().click();
    }
    await page.waitForTimeout(800);

    // fill minimal form if present
    const title = page.locator('input').filter({ has: page.locator(':scope') });
    // Prefer labels
    const titleLabel = page.getByLabel(/Title/i);
    if (await titleLabel.count()) {
      await titleLabel.first().fill("Playwright Photo Test");
    }

    // count text fields before image
    const bodyBefore = await page.locator("main").innerText();
    await page.screenshot({ path: path.join(outDir, "before-image.png"), fullPage: true });

    // Find file input(s) and set file
    const fileInputs = page.locator('input[type="file"]');
    const fileCount = await fileInputs.count();
    console.log("file_inputs:", fileCount);
    if (fileCount === 0) {
      // click + button for ProductImagePicker
      const plus = page.getByRole("button", { name: "+" }).first();
      if (await plus.count()) {
        // bind filechooser
        const [chooser] = await Promise.all([
          page.waitForEvent("filechooser", { timeout: 5000 }).catch(() => null),
          plus.click(),
        ]);
        if (chooser) {
          await chooser.setFiles(imgPath);
        }
      }
    } else {
      await fileInputs.first().setInputFiles(imgPath);
    }

    await page.waitForTimeout(2500);

    const bodyAfter = await page.locator("main").innerText();
    await page.screenshot({ path: path.join(outDir, "after-image.png"), fullPage: true });

    const mainEmpty = !bodyAfter || bodyAfter.trim().length < 20;
    const lostForm =
      bodyBefore.includes("Title") && !bodyAfter.includes("Title") &&
      !bodyAfter.includes("Add product") && !bodyAfter.includes("Products");

    console.log("mainEmpty:", mainEmpty);
    console.log("lostForm:", lostForm);
    console.log("bodyAfter_snippet:", JSON.stringify(bodyAfter.slice(0, 400)));
    console.log("errors:", JSON.stringify(errors, null, 2));
    console.log(
      "hasPreviewImg:",
      await page.locator('main img[src^="blob:"], main img[src^="data:"]').count(),
    );
    console.log(
      "ok:",
      !mainEmpty && !lostForm && errors.filter((e) => !e.includes("favicon")).length === 0,
    );
  } catch (e) {
    console.error("TEST_FAILED:", e.message);
    await page.screenshot({ path: path.join(outDir, "fail.png"), fullPage: true }).catch(() => {});
    console.log("errors:", JSON.stringify(errors, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
})();
