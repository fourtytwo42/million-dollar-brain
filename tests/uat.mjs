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
      .locator("svg.brain-map g.brain-cell > .segment-boundary")
      .count(),
    42,
    "every brain piece must have exactly one interactive boundary",
  );
  assert.equal(
    await page.locator("svg.brain-map g.brain-cell > .segment-fill").count(),
    42,
    "every brain piece must have exactly one data fill",
  );
  assert.equal(
    await page.locator("svg.brain-map > .brain-illustration").count(),
    0,
    "the mismatched raster brain must not compete with the shaped mosaic",
  );
  assert.equal(
    await page.locator("svg.brain-map > .brain-backplate").count(),
    1,
    "the complete mosaic must use one continuous anatomical backplate",
  );
  for (const [region, expected] of [
    ["cerebrum", 34],
    ["cerebellum", 6],
    ["brainstem", 2],
  ]) {
    assert.equal(
      await page.locator(`.brain-cell[data-region="${region}"]`).count(),
      expected,
      `${region} must contain its locked number of brain pieces`,
    );
  }
  assert.equal(
    await page.locator("svg.brain-map .piece-portrait").count(),
    42,
    "every brain piece must include its unique generated portrait",
  );
  assert.equal(
    await page.locator("svg.brain-map text").count(),
    0,
    "numbers and glyph placeholders must not cover the generated portraits",
  );
  const artHrefs = await page
    .locator("svg.brain-map image")
    .evaluateAll((images) => images.map((image) => image.getAttribute("href")));
  assert.equal(
    new Set(artHrefs).size,
    42,
    "the rendered brain must reference 42 unique generated portraits",
  );
  for (const href of artHrefs) {
    assert.ok(href, "every generated portrait asset must have an href");
    const response = await page.request.get(new URL(href, baseUrl).toString());
    assert.ok(response.ok(), `generated portrait asset ${href} must load`);
  }
  assert.equal(
    artHrefs.filter((href) => href?.startsWith("/brain-art/v2/piece-")).length,
    42,
    "all character portraits must use the cache-safe v2 asset path",
  );
  const imageMetrics = await page.evaluate(async () => {
    const paths = Array.from(
      { length: 42 },
      (_, index) =>
        `/brain-art/v2/piece-${String(index + 1).padStart(2, "0")}.webp`,
    );
    return Promise.all(
      paths.map(
        (src) =>
          new Promise((resolve, reject) => {
            const image = new Image();
            image.onload = () => {
              const canvas = document.createElement("canvas");
              canvas.width = image.naturalWidth;
              canvas.height = image.naturalHeight;
              const context = canvas.getContext("2d");
              context.drawImage(image, 0, 0);
              const corners = [
                context.getImageData(0, 0, 1, 1).data[3],
                context.getImageData(image.width - 1, 0, 1, 1).data[3],
                context.getImageData(0, image.height - 1, 1, 1).data[3],
                context.getImageData(image.width - 1, image.height - 1, 1, 1)
                  .data[3],
              ];
              resolve({
                src,
                width: image.naturalWidth,
                height: image.naturalHeight,
                maxCornerAlpha: Math.max(...corners),
              });
            };
            image.onerror = reject;
            image.src = src;
          }),
      ),
    );
  });
  assert.equal(
    imageMetrics.every(
      ({ width, height, maxCornerAlpha }) =>
        width === 384 && height === 384 && maxCornerAlpha <= 2,
    ),
    true,
    "all v2 portraits must be 384 by 384 with transparent corners",
  );
  await page
    .getByRole("heading", { name: "The Number-Go-Up Department", exact: true })
    .waitFor();
  await page.getByText("BRAIN PULSE", { exact: false }).waitFor();
  await page.getByText("BASKET SNAPSHOT", { exact: false }).waitFor();
  await page
    .getByRole("complementary", {
      name: /Selected brain piece:/,
    })
    .waitFor();
  for (const mode of ["Ownership", "Influence", "Mood", "Characters"]) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    await page.locator(`svg.brain-map.mode-${mode.toLowerCase()}`).waitFor();
  }
  const mysticsCrew = page.getByRole("button", {
    name: "Market Mystics (12)",
    exact: true,
  });
  await mysticsCrew.click();
  assert.equal(
    await mysticsCrew.getAttribute("aria-pressed"),
    "true",
    "the selected crew legend must expose its active state",
  );
  assert.equal(
    await page.locator(".brain-cell.crew-highlight").count(),
    12,
    "clicking Market Mystics must highlight exactly its 12 members",
  );
  assert.equal(
    await page.locator("svg.brain-map.has-crew-filter").count(),
    1,
    "crew highlighting must visually mute non-members",
  );
  await mysticsCrew.click();
  assert.equal(
    await page.locator(".brain-cell.crew-highlight").count(),
    0,
    "clicking the active crew again must clear the highlight",
  );
  const selectedSegment = page.locator(".brain-cell[aria-current=true]");
  await selectedSegment.focus();
  await page.getByRole("tooltip").waitFor();
  const startingSelection = await selectedSegment.getAttribute("aria-label");
  await page.keyboard.press("ArrowRight");
  const movedSelection = await page
    .locator(".brain-cell[aria-current=true]")
    .getAttribute("aria-label");
  assert.notEqual(
    movedSelection,
    startingSelection,
    "ArrowRight must move roving focus to an explicit spatial neighbor",
  );
  await page.keyboard.press("End");
  assert.match(
    await page
      .locator(".brain-cell[aria-current=true]")
      .getAttribute("aria-label"),
    /^Data Diet\./,
    "End must select the final canonical piece",
  );
  await page.keyboard.press("Home");
  assert.match(
    await page
      .locator(".brain-cell[aria-current=true]")
      .getAttribute("aria-label"),
    /^The Number-Go-Up Department\./,
    "Home must select the first canonical piece",
  );
  await page.getByRole("button", { name: "Zoom in" }).click();
  assert.equal(
    await page.locator(".brain-map-stage").getAttribute("data-zoom"),
    "1.25",
    "Zoom In must advance by one clamped step",
  );
  await page.getByRole("button", { name: "Reset", exact: true }).click();
  assert.equal(
    await page.locator(".brain-map-stage").getAttribute("data-zoom"),
    "1.00",
    "Reset must restore the 1x scale",
  );
  await page.screenshot({
    path: "design/mockups/brain-screen-v3-refined.png",
    fullPage: true,
  });

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await mobile.goto(baseUrl, { waitUntil: "networkidle" });
  await mobile.getByRole("button", { name: "List", exact: true }).click();
  const search = mobile.getByPlaceholder(
    "Search name, crew, affinity, or mood",
  );
  await search.fill("Decision Goblins");
  assert.ok(
    (await mobile.locator(".brain-piece-list > button").count()) > 0,
    "mobile list search must find pieces by crew",
  );
  assert.equal(
    await mobile.getByText(/\$525000000000000000000/).count(),
    0,
    "mobile prices must be formatted from token units instead of raw wei",
  );
  await mobile.locator(".brain-piece-list > button").first().click();
  await mobile
    .getByRole("complementary", { name: /Selected brain piece:/ })
    .waitFor();
  const mobileOverflow = await mobile.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  assert.ok(
    mobileOverflow <= 1,
    `mobile and 200%-equivalent layouts must not create page-level horizontal scrolling (${mobileOverflow}px)`,
  );
  await mobile.screenshot({
    path: "design/mockups/brain-screen-v3-mobile.png",
    fullPage: true,
  });
  await mobile.close();

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
  await page.screenshot({
    path: "design/mockups/brain-screen-v3-refined-dark.png",
    fullPage: true,
  });
  assert.equal(errors.length, 0, `browser errors: ${errors.join(" | ")}`);
  console.log(
    "UAT PASS: 42 v2 portraits, anatomical segment manifest, four map modes, tooltip, roving keyboard navigation, zoom, mobile list/search, responsive overflow, relocated inspector, economics, autonomous cycle, queued settlement, and dark mode completed in Chromium.",
  );
} finally {
  await browser.close();
}
