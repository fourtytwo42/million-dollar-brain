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
  await page.getByRole("button", { name: "Fund dev wallet" }).click();
  await page.getByText("Wallet funded with 100,000 test USDG and 2 test ETH.").waitFor({ timeout: 30000 });

  const amount = page.getByLabel("Deposit USDG");
  await amount.fill("1000");
  await page.getByRole("button", { name: "Deposit USDG" }).click();
  await page.getByText("Deposit complete. The 1% entry fee was routed on-chain.").waitFor({ timeout: 45000 });

  const availableBuy = page.locator(".piece.available button").first();
  await availableBuy.click();
  await page.getByText(/Brain piece \d+ is now yours\./).waitFor({ timeout: 45000 });
  const ownedSelect = page.locator(".piece.owned select").first();
  await ownedSelect.selectOption("2");
  await page.getByText(/now steers the agent toward Defensive\./).waitFor({ timeout: 30000 });

  await mkdir("var", { recursive: true });
  await page.screenshot({ path: "var/uat-dashboard.png", fullPage: true });
  assert.equal(errors.length, 0, `browser errors: ${errors.join(" | ")}`);
  console.log("UAT PASS: wallet funding, deposit, brain purchase, and preset update completed in a browser.");
} finally {
  await browser.close();
}
