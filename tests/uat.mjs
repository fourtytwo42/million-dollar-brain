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
  assert.equal(
    await page.locator(".piece").count(),
    42,
    "the complete 42-piece brain must render",
  );
  await page
    .getByRole("heading", { name: "The Number-Go-Up Department" })
    .waitFor();
  await page.getByRole("heading", { name: "Silicon-Valley Brain" }).waitFor();
  await page.getByRole("heading", { name: "Meme Lord" }).waitFor();
  await page.getByText("Forty-two weird little minds.").waitFor();
  assert.equal(
    await page.getByText("Risk-on", { exact: true }).count(),
    0,
    "generic placeholder presets must not render",
  );
  await page.getByRole("button", { name: "Sector Weirdos" }).click();
  assert.equal(
    await page.locator(".piece").count(),
    16,
    "crew filters must expose the sixteen sector characters",
  );
  await page.getByRole("button", { name: "All minds" }).click();
  assert.equal(
    await page.locator(".piece").count(),
    42,
    "All minds must restore the complete collection",
  );
  await page.getByRole("button", { name: "Fund dev wallet" }).click();
  await page
    .getByText("Wallet funded with 100,000 test USDG and 2 test ETH.")
    .waitFor({ timeout: 30000 });

  const amount = page.getByLabel("Deposit USDG");
  await amount.fill("1000");
  await page.getByRole("button", { name: "Deposit USDG" }).click();
  await page
    .getByText("Deposit complete. The 1% entry fee was routed on-chain.")
    .waitFor({ timeout: 45000 });

  const capitalObjective = page.locator(".piece", {
    has: page.getByRole("heading", { name: "The Number-Go-Up Department" }),
  });
  await capitalObjective.getByRole("button", { name: /Buy/ }).click();
  await page
    .getByText(/Brain piece \d+ is now yours\./)
    .waitFor({ timeout: 45000 });
  const ownedSelect = capitalObjective.getByLabel(
    "Mood for The Number-Go-Up Department",
  );
  assert.equal(
    await ownedSelect.locator("option").count(),
    5,
    "every brain piece must expose five closed moods",
  );
  await ownedSelect.selectOption("4");
  await page.getByText(/now sets .+ to .+\./).waitFor({ timeout: 30000 });

  await amount.fill("100");
  await page.getByRole("button", { name: "Deposit USDG" }).click();
  await page
    .getByText("Deposit complete. The 1% entry fee was routed on-chain.")
    .waitFor({ timeout: 45000 });
  const claim = page.getByRole("button", { name: "Claim brain rewards" });
  await claim.waitFor({ state: "visible" });
  assert.equal(
    await claim.isEnabled(),
    true,
    "an NFT owner must accrue claimable entry-fee rewards",
  );
  await claim.click();
  await page
    .getByText("Brain-owner rewards claimed to your development wallet.")
    .waitFor({ timeout: 45000 });

  const cycleResponse = await page.request.post(`${baseUrl}/api/cycle`, {
    headers: { "x-mdb-cycle-token": "mdb-local-devnet-keeper-v1" },
    timeout: 210000,
  });
  assert.equal(
    cycleResponse.ok(),
    true,
    `authorized allocation cycle failed: ${await cycleResponse.text()}`,
  );
  await page.getByRole("button", { name: "Refresh on-chain state" }).click();
  await page
    .getByRole("button", { name: "Redeem half of my liquid shares" })
    .click();
  await page
    .getByText(
      "Redemption queued on-chain for the next bounded hourly settlement.",
    )
    .waitFor({ timeout: 45000 });
  await page
    .getByText(/Redemption #\d+ is escrowed in the FIFO queue\./)
    .waitFor();
  const settlementCycle = await page.request.post(`${baseUrl}/api/cycle`, {
    headers: { "x-mdb-cycle-token": "mdb-local-devnet-keeper-v1" },
    timeout: 210000,
  });
  assert.equal(
    settlementCycle.ok(),
    true,
    `queue settlement cycle failed: ${await settlementCycle.text()}`,
  );
  const settlement = await settlementCycle.json();
  assert.match(
    settlement.redemptionTxHash ?? "",
    /^0x[0-9a-f]{64}$/i,
    "hourly cycle must submit a queued-redemption settlement transaction",
  );
  await page.getByRole("button", { name: "Refresh on-chain state" }).click();
  await page
    .getByText(/Redemption #\d+ is escrowed in the FIFO queue\./)
    .waitFor();
  await page.getByRole("button", { name: "Cancel queued redemption" }).click();
  await page
    .getByText("Queued redemption cancelled; escrowed shares returned.")
    .waitFor({ timeout: 45000 });

  await mkdir("var", { recursive: true });
  await page.screenshot({ path: "var/uat-dashboard.png", fullPage: true });
  await page.getByRole("button", { name: "Dark" }).click();
  await page.screenshot({ path: "var/uat-dashboard-dark.png", fullPage: true });
  assert.equal(errors.length, 0, `browser errors: ${errors.join(" | ")}`);
  console.log(
    "UAT PASS: 42 collectible brain characters and five-option moods rendered; wallet funding, deposit, brain purchase, memeable preset update, reward claim, authorized allocation cycle, partial queued settlement, and cancellation completed in Chromium.",
  );
} finally {
  await browser.close();
}
