const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

async function main() {
  const outDir = path.join(__dirname, "tmp-image-test");
  fs.mkdirSync(outDir, { recursive: true });
  const imgPath = path.join(outDir, "test-product.png");
  fs.writeFileSync(
    imgPath,
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mNk+M9Qz0AEYBxVSF+FABJADveWkH6oAAAAAElFTkSuQmCC",
      "base64",
    ),
  );

  const errors = [];
  const browser = await chromium.launch({
    headless: true,
    channel: "chrome",
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + m.text());
  });

  try {
    await page.goto("http://localhost:3000/login", {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await page.fill("#email", "owner@demo.shop");
    await page.fill("#password", "WalitShop@2026");
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
    console.log("url_after_login", page.url());

    await page.goto("http://localhost:3000/catalog", {
      waitUntil: "networkidle",
      timeout: 30000,
    });
    await page.waitForTimeout(1500);

    const addButtons = page.getByRole("button", { name: /Add product/i });
    console.log("add_buttons", await addButtons.count());
    if ((await addButtons.count()) > 0) {
      await addButtons.first().click();
      await page.waitForTimeout(800);
    }
    // segment control "Add product"
    const seg = page.locator("button").filter({ hasText: /^Add product$/ });
    if ((await seg.count()) > 0) {
      await seg.first().click();
      await page.waitForTimeout(600);
    }

    await page.screenshot({
      path: path.join(outDir, "1-add-panel.png"),
      fullPage: true,
    });
    const before = await page.locator("main").innerText();
    console.log("before_len", before.trim().length);
    console.log("before_snippet", JSON.stringify(before.slice(0, 600)));

    const fileInputs = page.locator('input[type="file"]');
    console.log("file_inputs", await fileInputs.count());

    if ((await fileInputs.count()) === 0) {
      const plus = page.locator("button").filter({ hasText: /^\+$/ }).first();
      const chooserPromise = page
        .waitForEvent("filechooser", { timeout: 5000 })
        .catch(() => null);
      if ((await plus.count()) > 0) {
        await plus.click();
        const chooser = await chooserPromise;
        if (chooser) await chooser.setFiles(imgPath);
      }
    } else {
      // last file input is create-form picker (list rows may also have inputs)
      await fileInputs.last().setInputFiles(imgPath);
    }

    await page.waitForTimeout(3500);
    const after = await page.locator("main").innerText();
    await page.screenshot({
      path: path.join(outDir, "2-after-image.png"),
      fullPage: true,
    });
    console.log("after_len", after.trim().length);
    console.log("after_snippet", JSON.stringify(after.slice(0, 600)));
    console.log(
      "preview_blob",
      await page.locator('main img[src^="blob:"]').count(),
    );
    console.log(
      "preview_data",
      await page.locator('main img[src^="data:"]').count(),
    );
    console.log("errors", JSON.stringify(errors, null, 2));
    const blank = after.trim().length < 40;
    console.log("BLANK_SCREEN", blank);
    console.log(
      "RESULT_OK",
      !blank && !errors.some((e) => e.startsWith("pageerror")),
    );
  } catch (e) {
    console.error("FAIL", e && e.message ? e.message : e);
    await page
      .screenshot({ path: path.join(outDir, "fail.png"), fullPage: true })
      .catch(() => {});
    console.log("errors", JSON.stringify(errors, null, 2));
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

main();
