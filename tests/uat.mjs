import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.MDB_UAT_URL ?? "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.getByText("Own a thought.").waitFor();
  assert.equal(await page.locator(".piece").count(), 42, "the complete 42-piece brain must render");
  await page.getByRole("heading", { name: "Capital Objective" }).waitFor();
  await page.getByRole("heading", { name: "Technology", exact: true }).waitFor();
  assert.equal(await page.getByText("Risk-on", { exact: true }).count(), 0, "generic placeholder presets must not render");
  await page.getByRole("button", { name: "Fund dev wallet" }).click();
  await page.getByText("Wallet funded with 100,000 test USDG and 2 test ETH.").waitFor({ timeout: 30000 });

  const amount = page.getByLabel("Deposit USDG");
  await amount.fill("1000");
  await page.getByRole("button", { name: "Deposit USDG" }).click();
  await page.getByText("Deposit complete. The 1% entry fee was routed on-chain.").waitFor({ timeout: 45000 });

  const capitalObjective = page.locator(".piece", { has: page.getByRole("heading", { name: "Capital Objective" }) });
  await capitalObjective.getByRole("button", { name: /Buy/ }).click();
  await page.getByText(/Brain piece \d+ is now yours\./).waitFor({ timeout: 45000 });
  const ownedSelect = capitalObjective.getByLabel("Preset for Capital Objective");
  await ownedSelect.selectOption("2");
  await page.getByText(/now sets .+ to .+\./).waitFor({ timeout: 30000 });

  await mkdir("var", { recursive: true });
  await page.screenshot({ path: "var/uat-dashboard.png", fullPage: true });
  assert.equal(errors.length, 0, `browser errors: ${errors.join(" | ")}`);
  console.log("UAT PASS: 42 distinct affinities rendered; wallet funding, deposit, brain purchase, and affinity-specific preset update completed in Chromium.");
} finally {
  await browser.close();
}
