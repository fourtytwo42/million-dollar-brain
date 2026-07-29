import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { chromium } from "playwright";

const baseUrl = process.env.MDB_UAT_URL ?? "http://127.0.0.1:3000";
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on("pageerror", (error) => errors.push(error.message));

try {
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await mkdir("var", { recursive: true });
  const guide = page.getByRole("dialog", {
    name: "How the brain moves the basket",
  });
  await guide.waitFor();
  assert.equal(
    await guide.locator(".tour-step-tabs button").count(),
    4,
    "the compact tour must expose all four steps",
  );
  assert.equal(
    await guide.locator(".tour-step-panel").count(),
    1,
    "the tour must show one focused explanation at a time",
  );
  assert.equal(
    await guide.evaluate((element) => getComputedStyle(element).position),
    "fixed",
    "the tour must float without pushing the product below it",
  );
  const brainTopWithGuide = await page
    .locator(".brain-primary-grid")
    .evaluate((element) => element.getBoundingClientRect().top);
  await guide.locator(".tour-step-tabs button").nth(3).click();
  await guide
    .getByText(
      "The AI never holds a wallet. Deterministic contracts enforce the asset allowlist, reserve, and risk limits before any rebalance executes.",
      { exact: true },
    )
    .waitFor();
  await guide.getByRole("button", { name: "Got it", exact: true }).click();
  assert.equal(
    await guide.count(),
    0,
    "the first-visit guide must be dismissible",
  );
  const brainTopWithoutGuide = await page
    .locator(".brain-primary-grid")
    .evaluate((element) => element.getBoundingClientRect().top);
  assert.equal(
    brainTopWithGuide,
    brainTopWithoutGuide,
    "opening the tour must not shift the brain layout",
  );
  const helpButton = page.getByRole("button", {
    name: "How it works",
    exact: true,
  });
  await helpButton.click();
  assert.equal(
    await helpButton.getAttribute("aria-expanded"),
    "true",
    "the guide must always be reopenable from the header",
  );
  await page
    .getByRole("dialog", { name: "How the brain moves the basket" })
    .getByRole("button", { name: "Got it", exact: true })
    .click();
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
    artHrefs.filter((href) => href?.startsWith("/brain-art/v4/piece-")).length,
    42,
    "all character portraits must use the cache-safe v3 asset path",
  );
  const imageMetrics = await page.evaluate(async () => {
    const paths = Array.from(
      { length: 42 },
      (_, index) =>
        `/brain-art/v4/piece-${String(index + 1).padStart(2, "0")}.webp`,
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
    "all v4 portraits must be 384 by 384 with transparent corners",
  );
  await page
    .getByRole("heading", { name: "The Moon-Bull Department", exact: true })
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
    /^Data-Diet Chef\./,
    "End must select the final canonical piece",
  );
  await page.keyboard.press("Home");
  assert.match(
    await page
      .locator(".brain-cell[aria-current=true]")
      .getAttribute("aria-label"),
    /^The Moon-Bull Department\./,
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
  const mobileGuide = mobile.getByRole("dialog", {
    name: "How the brain moves the basket",
  });
  await mobileGuide.waitFor();
  assert.equal(
    await mobileGuide.evaluate((element) => getComputedStyle(element).bottom),
    "12px",
    "the compact tour must become a mobile bottom sheet",
  );
  await mobileGuide
    .getByRole("button", { name: "Got it", exact: true })
    .click();
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
  const statusResponse = await page.request.get(`${baseUrl}/api/status`);
  assert.ok(statusResponse.ok(), "status must load before the brain purchase");
  const statusBeforePurchase = await statusResponse.json();
  const affordablePiece = [...statusBeforePurchase.pieces].sort(
    (left, right) => (BigInt(left.price) < BigInt(right.price) ? -1 : 1),
  )[0];
  const affordableCell = page
    .locator(".brain-cell")
    .nth(affordablePiece.id - 1);
  await affordableCell.focus();
  await page.keyboard.press("Enter");
  await page.getByRole("button", { name: "Fund test wallet" }).click();
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
  const targetPreset =
    affordablePiece.preset === 4
      ? affordablePiece.options[0]
      : affordablePiece.options[4];
  const targetPresetValue =
    targetPreset.value > 0 ? `+${targetPreset.value}` : `${targetPreset.value}`;
  const selectedMood = page.getByRole("button", {
    name: `${targetPresetValue} ${targetPreset.label}`,
    exact: true,
  });
  await selectedMood.click();
  const escapedPresetLabel = targetPreset.label.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&",
  );
  await page
    .getByText(new RegExp(`now sets .+ to ${escapedPresetLabel}\\.`))
    .waitFor({ timeout: 30000 });

  await page.getByRole("button", { name: "Basket", exact: true }).click();
  await page
    .getByText(
      "Buy MDBS with USDG to own a proportional share of the basket. Sell MDBS to receive USDG based on the basket's live value.",
      { exact: true },
    )
    .waitFor();
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
  assert.ok(
    BigInt(basketStatus.navPerShare) > 0n,
    "the contract must expose a positive fixed-point MDBS NAV price",
  );
  assert.ok(
    BigInt(basketStatus.walletUsdg) >= 0n,
    "the trade panel must receive the connected wallet's USDG balance",
  );
  assert.equal(
    basketStatus.oracle.fresh,
    true,
    "all valuation prices must be fresh before basket actions",
  );
  assert.deepEqual(
    basketStatus.priceSync.prices.map(({ symbol }) => symbol).sort(),
    ["AAPL", "ETHX", "NVDA"],
    "the local oracle must expose audited official-feed syncs for every risk asset",
  );
  assert.equal(
    basketStatus.priceSync.worker.last_error,
    null,
    "the paired oracle and execution-router sync must be healthy",
  );
  assert.ok(
    basketStatus.performanceHistory.length > 0,
    "the status API must expose persisted MDBS price history",
  );
  assert.notEqual(
    BigInt(basketStatus.portfolioAccounting.totalPnlUsdWad),
    0n,
    "live official prices must produce tracked portfolio gain or loss instead of a permanently flat mock NAV",
  );
  assert.equal(
    BigInt(basketStatus.previews.deposit.expectedShares) > 0n,
    true,
    "the status API must return a contract-backed deposit preview",
  );
  const expectedHeldSymbols = Object.entries(basketStatus.holdings)
    .filter(([, balance]) => BigInt(balance) > 0n)
    .map(([symbol]) => symbol)
    .sort();
  const renderedHeldSymbols = await page
    .getByTestId("basket-holding-row")
    .evaluateAll((rows) =>
      rows.map((row) => row.getAttribute("data-symbol")).sort(),
    );
  assert.deepEqual(
    renderedHeldSymbols,
    expectedHeldSymbols,
    "the Basket portfolio must render only assets with positive balances",
  );
  await page
    .getByRole("img", { name: /^Current portfolio distribution:/ })
    .waitFor();
  assert.equal(
    await page.locator(".holding-pie-slice").count(),
    expectedHeldSymbols.length,
    "the portfolio pie must contain one slice for every held asset",
  );
  assert.equal(
    await page.locator(".holding-table").count(),
    0,
    "the previous holdings bar table must not remain",
  );
  await page
    .getByRole("region", { name: "MDBS portfolio performance" })
    .waitFor();
  await page.getByText("Portfolio gain / loss", { exact: true }).waitFor();
  assert.equal(
    await page.getByText("Reference only", { exact: true }).count(),
    0,
    "the Basket must not show internal reference-universe diagnostics",
  );
  assert.equal(
    await page.getByText("Official history warm-up", { exact: true }).count(),
    0,
    "the Basket must not show raw observation-count diagnostics",
  );
  assert.equal(
    await page.getByRole("region", { name: "Your brain finances" }).count(),
    0,
    "brain ownership and reward finances must not appear on Basket",
  );
  const buyQuoteDetails = page.locator(".compact-quote details").first();
  assert.equal(
    await buyQuoteDetails.getAttribute("open"),
    null,
    "launchpad quote details must be collapsed by default",
  );
  await buyQuoteDetails.locator("summary").click();
  await buyQuoteDetails.getByText("Your USDG buys", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "Sell", exact: true }).click();
  assert.equal(
    await page.getByText("Your USDG buys", { exact: true }).count(),
    0,
    "Sell mode must not retain Buy's expanded allocation details",
  );
  await page.getByRole("tab", { name: "Buy", exact: true }).click();
  assert.equal(
    await page.locator(".compact-quote details").getAttribute("open"),
    null,
    "Buy quote details must reset to compact when returning from Sell",
  );
  const amount = page.getByLabel("USDG to spend");
  await amount.fill("1000");
  await page
    .getByRole("button", { name: "Buy MDBS", exact: true })
    .last()
    .click();
  await page
    .getByText(/Purchase complete\. You bought approximately/)
    .first()
    .waitFor({ timeout: 45000 });

  await amount.fill("100");
  await page
    .getByRole("button", { name: "Buy MDBS", exact: true })
    .last()
    .click();
  await page
    .getByText(/Purchase complete\. You bought approximately/)
    .first()
    .waitFor({ timeout: 45000 });
  await page.getByRole("button", { name: "Brain", exact: true }).click();
  await page.getByRole("region", { name: "Your brain finances" }).waitFor();
  const claim = page.getByRole("button", {
    name: /^Claim \$[\d,.]+ USDG$/,
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
  await page.getByRole("button", { name: "Basket", exact: true }).click();

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
  assert.equal(
    historyStatus.latestCycle.schemaVersion,
    3,
    "new cycles must use the reproducible DecisionContextV3 record",
  );
  assert.equal(
    historyStatus.latestCycle.decisionContext.benchmarks.every(
      (benchmark) => benchmark.executable === false,
    ),
    true,
    "reference benchmarks must never be executable",
  );
  assert.equal(
    historyStatus.marketData.coverage.length,
    5,
    "official collector must track two executable stocks and three reference ETFs",
  );
  assert.equal(
    historyStatus.latestCycle.decisionContext.assets.some((asset) =>
      ["SPY", "QQQ", "SOXX"].includes(asset.symbol),
    ),
    false,
    "reference assets must not enter the executable dossier list",
  );
  assert.equal(
    historyStatus.latestCycle.decisionContext.recentCycles.length <= 12,
    true,
    "the model context must cap detailed history at 12 cycles",
  );
  assert.equal(
    historyStatus.latestCycle.decisionContext.tokenBudget.estimatedTokens <=
      32_000,
    true,
    "the model context must stay inside the 32K input budget",
  );
  assert.match(historyStatus.latestCycle.inputHash, /^0x[0-9a-f]{64}$/i);
  assert.match(historyStatus.latestCycle.promptHash, /^0x[0-9a-f]{64}$/i);
  assert.equal(
    historyStatus.persistence.available,
    true,
    "native PostgreSQL cycle persistence must be healthy",
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Decisions", exact: true }).click();
  await page
    .getByRole("heading", {
      name: "Explore every decision and execution.",
    })
    .waitFor();
  await page.getByText("Data behind this decision").waitFor();
  await page
    .getByText(
      "Follow the full chain of evidence: what brain owners requested, what the AI proposed, and what the protocol actually executed.",
      { exact: true },
    )
    .waitFor();
  const marketDataDetails = page.getByText("Market data and pricing", {
    exact: true,
  });
  await marketDataDetails.click();
  for (const source of [
    "Robinhood Stock Token API",
    "Coinbase Exchange ETH-USD ticker",
  ]) {
    await page.getByText(source, { exact: true }).first().waitFor();
  }
  await page
    .getByText(/Reference benchmarks remain non-executable\./)
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
  const renderedDecisionSymbols = async () =>
    page
      .getByTestId("decision-target-row")
      .evaluateAll((rows) =>
        rows.map((row) => row.getAttribute("data-symbol")).sort(),
      );
  const expectedDecisionSymbols = (cycle) =>
    Object.entries(cycle.allocation)
      .filter(([, weight]) => weight > 0)
      .map(([symbol]) => symbol)
      .sort();
  assert.deepEqual(
    await renderedDecisionSymbols(),
    expectedDecisionSymbols(historyStatus.cycleHistory[0]),
    "the latest Decision must omit zero-weight targets",
  );
  await historyItems.nth(1).click();
  await historyDetail
    .getByText(historyStatus.cycleHistory[1].txHash, { exact: true })
    .waitFor();
  assert.deepEqual(
    await renderedDecisionSymbols(),
    expectedDecisionSymbols(historyStatus.cycleHistory[1]),
    "historical Decisions must omit zero-weight targets",
  );
  await historyItems.nth(0).click();
  await page.getByText("BRAIN DRAMA", { exact: true }).waitFor();
  for (const label of [
    "Download card",
    "Copy recap",
    "Share to X",
    "Farcaster",
    "Telegram",
  ]) {
    assert.equal(
      await page.getByRole("button", { name: label, exact: true }).count(),
      1,
      `${label} must be available for roster-v4 cycles`,
    );
  }
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download card", exact: true })
    .click();
  const decisionCard = await downloadPromise;
  const decisionCardPath = await decisionCard.path();
  const decisionCardBytes = await readFile(decisionCardPath);
  assert.equal(decisionCardBytes.toString("ascii", 1, 4), "PNG");
  assert.equal(decisionCardBytes.readUInt32BE(16), 1200);
  assert.equal(decisionCardBytes.readUInt32BE(20), 630);
  const historyMobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
  });
  await historyMobile.goto(baseUrl, { waitUntil: "networkidle" });
  await historyMobile
    .getByRole("dialog", { name: "How the brain moves the basket" })
    .getByRole("button", { name: "Got it", exact: true })
    .click();
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
  await page
    .getByRole("heading", { name: "AI proposed", exact: true })
    .waitFor();
  await page
    .getByRole("heading", {
      name: "Contracts checked and executed",
      exact: true,
    })
    .waitFor();
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
  await page.screenshot({
    path: "design/mockups/basket-screen-v2-editorial.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.screenshot({
    path: "design/mockups/basket-screen-v2-editorial-dark.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Light", exact: true }).click();
  await page.getByRole("tab", { name: "Sell", exact: true }).click();
  await page.getByRole("button", { name: "50%", exact: true }).click();
  await page
    .getByRole("button", { name: "Sell MDBS", exact: true })
    .last()
    .click();
  await page
    .getByText(
      /Sale complete\. You received approximately .* USDG for your MDBS\./,
    )
    .first()
    .waitFor({ timeout: 45000 });
  const afterAtomicSale = await (
    await page.request.get(`${baseUrl}/api/status?sell=1`)
  ).json();
  assert.equal(
    afterAtomicSale.redemption.pendingRequestId,
    "0",
    "an atomic sale must never create a pending redemption",
  );
  assert.equal(
    await page.getByRole("button", { name: "Cancel queued sale" }).count(),
    0,
    "the Basket must not expose a queued-sale state",
  );
  const postSaleCycle = await page.request.post(`${baseUrl}/api/cycle`, {
    headers: { "x-mdb-cycle-token": "mdb-local-devnet-keeper-v1" },
    timeout: 210000,
  });
  assert.equal(
    postSaleCycle.ok(),
    true,
    `post-sale autonomous cycle failed: ${await postSaleCycle.text()}`,
  );
  const postSaleResult = await postSaleCycle.json();
  assert.equal(
    postSaleResult.redemptionTxHash ?? null,
    null,
    "autonomous cycles must not process a redemption queue",
  );
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Basket", exact: true }).click();
  await page
    .getByRole("heading", { name: "Returns separated from cash flows." })
    .waitFor();
  await page
    .getByRole("region", { name: "MDBS portfolio performance" })
    .waitFor();
  await page.getByRole("tab", { name: "Sell", exact: true }).click();
  await page.getByText("View quote details", { exact: true }).last().click();
  await page.getByText(/Settlement is atomic:/).waitFor();

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
    "UAT PASS: official market collector, paired local oracle/router price synchronization, cash-flow-adjusted accounting, live MDBS performance and P&L, accessible positive-only portfolio pie chart, proportional buy and atomic sell previews, bounded DecisionContext V3 evidence, expandable decision data provenance, PostgreSQL persistence, positive-only decision positions, first-visit explanation, plain-language screen guidance, 42 meme-universe v4 portraits, deterministic Brain Drama, 1200x630 sharing, anatomical segment manifest, character-first map, tooltip, roving keyboard navigation, zoom, mobile list/search, historical decision exploration, responsive overflow, economics, autonomous cycle, queue-free atomic settlement, and dark mode completed in Chromium.",
  );
} finally {
  await browser.close();
}
