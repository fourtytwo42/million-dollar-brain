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
    await page.getByText("BASKET SNAPSHOT", { exact: true }).count(),
    0,
    "the Brain screen must not duplicate the dedicated Basket page",
  );
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
    artHrefs.filter((href) => href?.startsWith("/brain-art/v3/piece-")).length,
    42,
    "all character portraits must use the cache-safe v3 asset path",
  );
  const imageMetrics = await page.evaluate(async () => {
    const paths = Array.from(
      { length: 42 },
      (_, index) =>
        `/brain-art/v3/piece-${String(index + 1).padStart(2, "0")}.webp`,
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
    "all v3 portraits must be 384 by 384 with transparent corners",
  );
  await page
    .getByRole("heading", { name: "The Number-Go-Up Department", exact: true })
    .waitFor();
  await page.getByText("BRAIN PULSE", { exact: false }).waitFor();
  await page
    .getByRole("complementary", {
      name: /Selected brain piece:/,
    })
    .waitFor();
  assert.equal(
    await page.getByLabel("Brain map view").count(),
    0,
    "the Brain must not expose the removed map-mode selector",
  );
  await page.locator("svg.brain-map.mode-characters").waitFor();
  for (const [crew, expected] of [
    ["Executive Dysfunction", 6],
    ["Market Mystics", 12],
    ["Sector Weirdos", 16],
    ["Decision Goblins", 8],
  ]) {
    const crewCells = page.locator(`.brain-cell[data-crew="${crew}"]`);
    assert.equal(
      await crewCells.count(),
      expected,
      `${crew} must retain its canonical member count`,
    );
    const centers = await crewCells.evaluateAll((cells) =>
      cells.map((cell) => ({
        x: Number(cell.getAttribute("data-center-x")),
        y: Number(cell.getAttribute("data-center-y")),
      })),
    );
    assert.ok(
      Math.max(...centers.map(({ x }) => x)) -
        Math.min(...centers.map(({ x }) => x)) >
        250,
      `${crew} must be scattered horizontally across the brain`,
    );
    assert.ok(
      Math.max(...centers.map(({ y }) => y)) -
        Math.min(...centers.map(({ y }) => y)) >
        190,
      `${crew} must be scattered vertically across the brain`,
    );
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
    await page.locator(".brain-cell.piece-filter-highlight").count(),
    12,
    "clicking Market Mystics must highlight exactly its 12 members",
  );
  assert.equal(
    await page.locator("svg.brain-map.has-piece-filter").count(),
    1,
    "crew highlighting must visually mute non-members",
  );
  await mysticsCrew.click();
  assert.equal(
    await page.locator(".brain-cell.piece-filter-highlight").count(),
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
  const mineCells = page.locator(".brain-cell.ownership-mine");
  const mineCellCount = await mineCells.count();
  assert.ok(
    mineCellCount >= 1,
    "buying a brain piece must mark it as owned by the connected wallet",
  );
  assert.equal(
    await page.locator(".brain-cell.ownership-mine .ownership-halo").count(),
    mineCellCount,
    "every personally owned piece must render an ownership halo",
  );
  assert.equal(
    await mineCells
      .first()
      .locator(".ownership-halo")
      .evaluate((halo) => getComputedStyle(halo).opacity),
    "1",
    "the personal ownership halo must remain visibly active",
  );
  const yoursFilter = page.getByRole("button", {
    name: /Yours \(\d+\) · double outline/,
  });
  await yoursFilter.click();
  assert.equal(
    await yoursFilter.getAttribute("aria-pressed"),
    "true",
    "the Yours legend must expose its active state",
  );
  assert.equal(
    await page.locator(".brain-cell.piece-filter-highlight").count(),
    mineCellCount,
    "clicking Yours must highlight exactly the connected wallet's pieces",
  );
  assert.equal(
    await page.locator("svg.brain-map.has-piece-filter").count(),
    1,
    "the Yours filter must visually mute pieces owned by other wallets",
  );
  await yoursFilter.click();
  assert.equal(
    await page.locator(".brain-cell.piece-filter-highlight").count(),
    0,
    "clicking Yours again must clear the ownership highlight",
  );
  const selectedMood = page.getByRole("button", {
    name: "+2 Moon With Seatbelts",
    exact: true,
  });
  await selectedMood.click();
  await page
    .getByText(/now sets .+ to Moon With Seatbelts\./)
    .waitFor({ timeout: 30000 });

  await page.getByRole("button", { name: "Basket", exact: true }).click();
  const basketStatusResponse = await page.request.get(`${baseUrl}/api/status`);
  assert.equal(
    basketStatusResponse.ok(),
    true,
    "basket status must load for valuation checks",
  );
  const basketStatus = await basketStatusResponse.json();
  assert.ok(
    basketStatus.holdingValues,
    "basket status must expose router-priced holding values",
  );
  const pricedTotal = Object.values(basketStatus.holdingValues).reduce(
    (sum, value) => sum + BigInt(value),
    0n,
  );
  assert.equal(
    pricedTotal,
    BigInt(basketStatus.nav),
    "router-priced holding values must reconcile exactly to basket NAV",
  );
  for (const symbol of ["USDG", "NVDA", "AAPL", "ETHX"]) {
    assert.notEqual(
      basketStatus.holdingValues[symbol],
      undefined,
      `${symbol} must have a router-priced USD value`,
    );
  }
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
  const historyResponse = await page.request.get(`${baseUrl}/api/status`);
  assert.equal(
    historyResponse.ok(),
    true,
    "decision history status must load after an executed cycle",
  );
  const historyStatus = await historyResponse.json();
  assert.ok(
    historyStatus.cycleHistory.length >= 2,
    "decision archive must expose multiple historical cycles",
  );
  assert.ok(
    historyStatus.cycleHistory.length <= 50,
    "decision archive payload must remain bounded",
  );
  assert.equal(
    historyStatus.latestCycle.txHash,
    historyStatus.cycleHistory[0].txHash,
    "latest cycle must match the first historical record",
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Decisions", exact: true }).click();
  await page
    .getByRole("heading", {
      name: "Explore every decision and execution.",
    })
    .waitFor();
  const historyItems = page.getByTestId("decision-history-item");
  assert.equal(
    await historyItems.count(),
    historyStatus.cycleHistory.length,
    "every returned historical cycle must be selectable",
  );
  const historyDetail = page.getByTestId("decision-history-detail");
  await historyDetail
    .getByText(historyStatus.cycleHistory[0].txHash, { exact: true })
    .waitFor();
  await historyItems.nth(1).click();
  await historyDetail
    .getByText(historyStatus.cycleHistory[1].txHash, { exact: true })
    .waitFor();
  const historyMobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await historyMobile.goto(baseUrl, { waitUntil: "networkidle" });
  await historyMobile
    .getByRole("button", { name: "Decisions", exact: true })
    .click();
  assert.equal(
    await historyMobile.getByTestId("decision-history-item").count(),
    historyStatus.cycleHistory.length,
    "mobile decision archive must expose every returned cycle",
  );
  const historyMobileOverflow = await historyMobile.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  assert.ok(
    historyMobileOverflow <= 1,
    `mobile decision history must not create page-level horizontal scrolling (${historyMobileOverflow}px)`,
  );
  await historyMobile.close();
  await page.getByText("Brain requested").waitFor();
  await page.getByText("Ornith proposed").waitFor();
  await page.getByText("Protocol executed").waitFor();
  await page.screenshot({ path: "var/uat-decisions.png", fullPage: true });
  await page.screenshot({
    path: "design/mockups/decisions-screen-v2-editorial.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.screenshot({
    path: "design/mockups/decisions-screen-v2-editorial-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Light", exact: true }).click();
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
    "UAT PASS: 42 diverse v3 portraits, anatomical segment manifest, character-first map, tooltip, roving keyboard navigation, zoom, mobile list/search, historical decision exploration, responsive overflow, relocated inspector, economics, autonomous cycle, queued settlement, and dark mode completed in Chromium.",
  );
} finally {
  await browser.close();
}
