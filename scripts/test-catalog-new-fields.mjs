/**
 * Exercise every New Item input on /catalog/new against the local app.
 * Usage: node scripts/test-catalog-new-fields.mjs
 */
import { chromium } from "playwright";

const BASE = process.env.UPOS_BASE_URL || "http://127.0.0.1:3000";
const EMAIL = process.env.UPOS_EMAIL || "owner@retail.demo";
const PASSWORD = process.env.UPOS_PASSWORD || "WalitShop@2026";

const results = [];

function ok(name, detail = "") {
  results.push({ name, pass: true, detail });
  console.log(`  PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail) {
  results.push({ name, pass: false, detail });
  console.log(`  FAIL  ${name} — ${detail}`);
}

async function fillAndCheck(page, selector, value, label) {
  const el = page.locator(selector).first();
  if (!(await el.count())) {
    fail(label, `missing: ${selector}`);
    return false;
  }
  await el.click({ timeout: 8000 });
  await el.fill("");
  await el.fill(String(value));
  const got = await el.inputValue();
  if (got !== String(value) && got.replace(/\.0+$/, "") !== String(value)) {
    fail(label, `typed "${value}" but field shows "${got}"`);
    return false;
  }
  ok(label, `"${got}"`);
  return true;
}

async function clickChip(page, name) {
  const btn = page.getByRole("button", { name, exact: true }).first();
  if (!(await btn.count())) {
    fail(`Type chip: ${name}`, "button not found");
    return;
  }
  await btn.click();
  const selected = await btn.evaluate((n) =>
    n.className.includes("border-[#1a56db]"),
  );
  if (!selected) fail(`Type chip: ${name}`, "did not stay selected");
  else ok(`Type chip: ${name}`);
}

const browser = await chromium.launch({
  headless: true,
  channel: "msedge",
});
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(15000);

try {
  console.log(`\nLogin ${EMAIL} → ${BASE}`);
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.locator("#email").fill(EMAIL);
  await page.locator("#password").fill(PASSWORD);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/\/(organizations|dashboard|catalog)/, {
    timeout: 25000,
  });

  if (page.url().includes("/organizations")) {
    const openBtn = page.getByRole("button", { name: /open/i }).first();
    if (await openBtn.count()) {
      await openBtn.click();
      await page.waitForURL(/\/(dashboard|catalog|counter)/, { timeout: 25000 });
    }
  }

  await page.goto(`${BASE}/catalog/new`, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "New Item" }).waitFor({ timeout: 20000 });
  ok("Page /catalog/new loaded");

  await fillAndCheck(
    page,
    'input[placeholder="Scan or type barcode"]',
    "8901234567890",
    "Barcode",
  );
  await fillAndCheck(page, "#catalog-item-name", "Field test cotton shirt", "Name");

  await clickChip(page, "Goods");
  await clickChip(page, "Service");
  await clickChip(page, "Goods");

  // Category combobox
  const catBtn = page.getByRole("button", { name: /select or search category/i }).first();
  if (await catBtn.count()) {
    await catBtn.click();
    const search = page.getByPlaceholder(/search category/i);
    if (await search.count()) {
      await search.fill("a");
      ok("Category search input");
    } else {
      fail("Category search input", "not found after open");
    }
    await page.keyboard.press("Escape");
    await page.locator("body").click({ position: { x: 10, y: 10 } });
  } else {
    fail("Category", "combobox trigger missing");
  }

  const brandBtn = page.getByRole("button", { name: /select or type brand/i }).first();
  if (await brandBtn.count()) {
    await brandBtn.click();
    const bSearch = page.getByPlaceholder(/search brand/i);
    if (await bSearch.count()) {
      await bSearch.fill("test");
      ok("Brand search input");
    } else {
      fail("Brand search input", "not found after open");
    }
    await page.locator("body").click({ position: { x: 10, y: 10 } });
  } else {
    fail("Brand", "combobox trigger missing");
  }

  // Status / Unit searchable selects — click trigger then an option
  async function pickSelectNearLabel(labelText, optionRe) {
    const row = page.locator("div.grid").filter({ hasText: labelText }).first();
    const trigger = row.getByRole("button").first();
    if (!(await trigger.count())) {
      fail(labelText, "select trigger missing");
      return;
    }
    await trigger.click();
    const opt = page.getByRole("option").filter({ hasText: optionRe }).first();
    if (!(await opt.count())) {
      // panel is portaled
      const anyOpt = page.locator('[role="option"]').filter({ hasText: optionRe }).first();
      if (await anyOpt.count()) {
        await anyOpt.click();
        ok(labelText, "picked option");
        return;
      }
      fail(labelText, `option ${optionRe} not listed`);
      await page.keyboard.press("Escape");
      return;
    }
    await opt.click();
    ok(labelText, "picked option");
  }

  await pickSelectNearLabel("Status", /Draft/i);
  await pickSelectNearLabel("Unit", /kg/i);

  await fillAndCheck(page, "#catalog-item-rate", "199.5", "Rate");
  await fillAndCheck(page, "#catalog-item-cost", "80", "Cost");
  await fillAndCheck(page, "#catalog-item-mrp", "249", "MRP");
  await fillAndCheck(page, "#catalog-item-tax", "18", "Tax %");
  await fillAndCheck(page, "#catalog-item-hsn", "GST18", "HSN / SAC");
  await fillAndCheck(page, "#catalog-item-sku", "FT-SHIRT-01", "SKU");

  const soh = page.locator('input[placeholder="e.g. 50"], input[placeholder="e.g. 12.5"]').first();
  if (await soh.count()) {
    await soh.fill("12");
    const v = await soh.inputValue();
    if (v === "12") ok("Stock on Hand", v);
    else fail("Stock on Hand", `got ${v}`);
  } else {
    fail("Stock on Hand", "input missing (maybe Track inventory off)");
  }

  const reorder = page.getByPlaceholder("e.g. 5");
  if (await reorder.count()) {
    await reorder.fill("3");
    const v = await reorder.inputValue();
    if (v === "3") ok("Reorder Point", v);
    else fail("Reorder Point", `got ${v}`);
  } else {
    fail("Reorder Point", "missing");
  }

  for (const label of [
    "Track inventory",
    "Track serial numbers",
    "Track batch / expiry",
    "Can sell",
    "Can purchase",
    "Show on counter",
  ]) {
    const box = page.getByRole("checkbox", { name: label });
    if (!(await box.count())) {
      fail(`Checkbox: ${label}`, "not found");
      continue;
    }
    const before = await box.isChecked();
    const disabled = await box.isDisabled();
    if (disabled) {
      ok(`Checkbox: ${label}`, "present (locked for this type)");
      continue;
    }
    await box.click({ force: true });
    const after = await box.isChecked();
    if (after === before) fail(`Checkbox: ${label}`, "did not toggle");
    else ok(`Checkbox: ${label}`, `${before} → ${after}`);
    // restore inventory on so remaining fields stay visible
    if (label === "Track inventory" && !after) await box.click({ force: true });
  }

  await page.getByRole("button", { name: /more details/i }).click();
  await fillAndCheck(page, "#catalog-item-short-name", "FT Shirt", "Short name");
  await fillAndCheck(page, "#catalog-item-internal-code", "INT-1", "Internal code");
  await fillAndCheck(
    page,
    "#catalog-item-short-desc",
    "Blue cotton",
    "Short description",
  );
  await fillAndCheck(
    page,
    "#catalog-item-description",
    "Full description for the catalog test.",
    "Description",
  );

  const unitGroup = page.getByText("Unit group", { exact: false }).first();
  if (await unitGroup.count()) ok("Unit & pricing section visible");
  else fail("Unit & pricing section", "not rendered");

  const save = page.getByRole("button", { name: /^save$/i }).first();
  if (await save.count()) ok("Save button present");
  else fail("Save button", "missing");
} catch (e) {
  fail("Script", e instanceof Error ? e.message : String(e));
  await page.screenshot({
    path: "scripts/catalog-new-fields-fail.png",
    fullPage: true,
  });
  console.log("  screenshot: frontend/scripts/catalog-new-fields-fail.png");
} finally {
  await browser.close();
}

const passed = results.filter((r) => r.pass).length;
const failed = results.filter((r) => !r.pass).length;
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
