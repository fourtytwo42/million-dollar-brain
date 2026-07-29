import { strict as assert } from "node:assert";
import { mkdirSync } from "node:fs";
import { chromium } from "playwright";
import { generatePrivateKey } from "viem/accounts";

const baseUrl = process.env.MDB_UAT_URL ?? "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless: true });
const privateKey = generatePrivateKey();
const errors = [];
const failures = [];
mkdirSync("var/uat", { recursive: true });

try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  await context.addInitScript(
    ({ key }) => {
      window.sessionStorage.setItem("mdb-test-wallet-31337", key);
    },
    { key: privateKey },
  );
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("requestfailed", (request) => {
    if (request.method() !== "HEAD")
      failures.push(`${request.method()} ${request.url()}`);
  });

  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Fund test wallet" }).click();
  await page.getByText(/Wallet funded|wallet is ready/i).waitFor({
    timeout: 30_000,
  });

  const unowned = page.locator(".brain-cell.ownership-unowned");
  assert.ok(
    await unowned.count(),
    "an unowned responsive-UAT braincell exists",
  );
  await unowned.first().click({ force: true });
  await page.getByRole("button", { name: /Buy piece/ }).click();
  await page.getByText(new RegExp(`Brain piece \\d+ is now yours`)).waitFor({
    timeout: 45_000,
  });

  await page.getByRole("button", { name: "Change controls" }).click();
  const dialog = page.locator('[role="dialog"][aria-modal="true"]');
  await dialog.waitFor();
  assert.ok(
    (await dialog.locator("fieldset").count()) <= 4,
    "editor exposes no more than three levers plus one asset target",
  );
  assert.equal(
    await dialog.getByText(/Desk status|Preferred sleeve|Desk lens/).count(),
    0,
  );
  assert.ok(
    await dialog.getByText("What the machine thinks you said").isVisible(),
  );
  const literalMachineValues = await dialog
    .locator("button b, .control-chips button, output")
    .allTextContents();
  assert.equal(
    literalMachineValues.some((text) =>
      /\$|%|\+\d|\b\d+(?:m|h|d)\b|\btop \d+\b/i.test(text),
    ),
    false,
    "owner-facing controls hide literal machine values",
  );
  const firstChoice = dialog.locator(".control-segments button").first();
  if (await firstChoice.count()) {
    await firstChoice.click();
    assert.ok(
      await dialog.locator(".control-dashboard-reaction").isVisible(),
      "the clown-car dashboard reacts to a control",
    );
  }

  for (const viewport of [
    { name: "desktop", width: 1440, height: 900 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(150);
    const dimensions = await page.evaluate(() => ({
      pageOverflow:
        document.documentElement.scrollWidth >
        document.documentElement.clientWidth,
      dialogOverflow:
        document.querySelector('[role="dialog"]').scrollWidth >
        document.querySelector('[role="dialog"]').clientWidth,
    }));
    assert.equal(
      dimensions.pageOverflow,
      false,
      `${viewport.name} page overflow`,
    );
    assert.equal(
      dimensions.dialogOverflow,
      false,
      `${viewport.name} dialog overflow`,
    );
    await page.screenshot({
      path: `var/uat/control-experience-${viewport.name}.png`,
      fullPage: false,
    });
  }

  assert.deepEqual(errors, [], "browser console remains clean");
  assert.deepEqual(failures, [], "browser requests remain clean");
  await context.close();
} finally {
  await browser.close();
}

console.log("Brain Control Experience responsive UAT passed.");
