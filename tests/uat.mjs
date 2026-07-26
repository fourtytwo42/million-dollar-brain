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
  await mkdir("var", { recursive: true });
  assert.equal(
    await page.locator(".brain-cell").count(),
    42,
    "the complete 42-segment SVG brain must render",
  );
  assert.equal(
    await page
      .locator("svg.brain-map > path, svg.brain-map g.brain-cell > path")
      .count(),
    43,
    "the brain must include one silhouette and exactly 42 interactive paths",
  );
  await page
    .getByRole("heading", { name: "The Number-Go-Up Department", exact: true })
    .waitFor();
  await page.getByText("BRAIN PULSE", { exact: false }).waitFor();
  await page.getByText("BASKET SNAPSHOT", { exact: false }).waitFor();
  assert.equal(
    await page.getByText("Risk-on", { exact: true }).count(),
    0,
    "generic placeholder presets must not render",
  );
  await page.getByRole("button", { name: "Fund dev wallet" }).click();
  await page
    .getByText("Wallet funded with 100,000 test USDG and 2 test ETH.")
    .waitFor({ timeout: 30000 });

  await page.getByRole("button", { name: /Buy (piece|next)/ }).click();
  await page
    .getByText(/Brain piece \d+ is now yours\./)
    .waitFor({ timeout: 45000 });
  const selectedMood = page.getByRole("button", {
    name: "+2 Moon With Seatbelts",
    exact: true,
  });
  await selectedMood.click();
  await page
    .getByText(/now sets .+ to Moon With Seatbelts\./)
    .waitFor({ timeout: 30000 });

  await page.getByRole("button", { name: "Basket", exact: true }).click();
  const amount = page.getByLabel("Deposit USDG");
  await amount.fill("1000");
  await page.getByRole("button", { name: "Deposit USDG" }).click();
  await page
    .getByText("Deposit complete. The 1% entry fee was routed on-chain.")
    .waitFor({ timeout: 45000 });

  await amount.fill("100");
  await page.getByRole("button", { name: "Deposit USDG" }).click();
  await page
    .getByText("Deposit complete. The 1% entry fee was routed on-chain.")
    .waitFor({ timeout: 45000 });
  const claim = page.getByRole("button", {
    name: "Claim brain rewards",
    exact: true,
  });
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
  await page.getByRole("button", { name: "Decisions", exact: true }).click();
  await page
    .getByRole("heading", { name: "From collective brain to bounded trade." })
    .waitFor();
  await page.getByText("Brain requested").waitFor();
  await page.getByText("Ornith proposed").waitFor();
  await page.getByText("Protocol executed").waitFor();
  await page.screenshot({ path: "var/uat-decisions.png", fullPage: true });
  await page.getByRole("button", { name: "Basket", exact: true }).click();
  await page.screenshot({ path: "var/uat-basket.png", fullPage: true });
  await page
    .getByRole("button", { name: "Redeem half my liquid shares" })
    .click();
  await page
    .getByText(
      "Redemption queued on-chain for the next bounded hourly settlement.",
    )
    .waitFor({ timeout: 45000 });
  await page
    .getByRole("button", { name: /Cancel queued redemption #\d+/ })
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
  await page
    .getByRole("button", { name: /Cancel queued redemption #\d+/ })
    .click();
  await page
    .getByText("Queued redemption cancelled; escrowed shares returned.")
    .waitFor({ timeout: 45000 });

  await page.getByRole("button", { name: "Brain", exact: true }).click();
  await page.screenshot({ path: "var/uat-dashboard.png", fullPage: true });
  await page.getByRole("button", { name: "Dark" }).click();
  await page.screenshot({ path: "var/uat-dashboard-dark.png", fullPage: true });
  assert.equal(errors.length, 0, `browser errors: ${errors.join(" | ")}`);
  console.log(
    "UAT PASS: normative three-screen editorial shell and accessible 42-path SVG brain rendered; funding, brain purchase, mood update, deposit, reward claim, decision explanation, queued settlement, cancellation, and dark mode completed in Chromium.",
  );
} finally {
  await browser.close();
}
