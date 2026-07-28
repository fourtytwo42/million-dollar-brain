import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import {
  appendFile,
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from "node:fs/promises";
import { promisify } from "node:util";
import { chromium } from "playwright";

const execFileAsync = promisify(execFile);
const baseUrl = process.env.MDB_ENDURANCE_URL ?? "http://127.0.0.1:3001";
const durationMs = Number(
  process.env.MDB_ENDURANCE_DURATION_MS ?? 2 * 60 * 60 * 1000,
);
const intervalMs = Number(
  process.env.MDB_ENDURANCE_INTERVAL_MS ?? 20 * 60 * 1000,
);
const stateDirectory =
  process.env.MDB_ENDURANCE_STATE_DIR ?? "var/testnet-v3-endurance";
const singleCheckpoint = process.env.MDB_ENDURANCE_SINGLE_CHECKPOINT === "true";
const statePath = `${stateDirectory}/state.json`;
const checkpointPath = `${stateDirectory}/checkpoints.jsonl`;
const summaryPath = `${stateDirectory}/summary.json`;
const armedPath = `${stateDirectory}/armed`;
const services = [
  "mdb-web.service",
  "mdb-web-testnet.service",
  "mdb-market-collector.timer",
  "mdb-market-collector-testnet.timer",
  "mdb-cycle.timer",
  "mdb-cycle-testnet.timer",
];

const sleep = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

async function atomicJson(path, value) {
  const temporary = `${path}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`);
  await rename(temporary, path);
}

async function readState() {
  try {
    return JSON.parse(await readFile(statePath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    return null;
  }
}

async function loadOrCreateState() {
  const now = Date.now();
  const existing = await readState();
  if (existing?.status === "running") {
    const configuredEndAt = existing.startedAt + durationMs;
    if (existing.endAt !== configuredEndAt) {
      existing.endAt = configuredEndAt;
      existing.durationMs = durationMs;
      if (existing.nextCheckpointAt > configuredEndAt) {
        existing.nextCheckpointAt = configuredEndAt;
      }
      await atomicJson(statePath, existing);
    }
    if (existing.failureAt) {
      const pausedFor = now - existing.failureAt;
      existing.endAt += pausedFor;
      existing.nextCheckpointAt += pausedFor;
      existing.failureAt = null;
      existing.lastResumedAt = now;
      await atomicJson(statePath, existing);
    }
    return existing;
  }
  const created = {
    version: 1,
    status: "running",
    startedAt: now,
    endAt: now + durationMs,
    durationMs,
    intervalMs,
    nextCheckpointAt: now,
    completedCheckpoints: 0,
    failedAttempts: 0,
    lastCheckpoint: null,
    failureAt: null,
  };
  await atomicJson(statePath, created);
  return created;
}

async function getHealthyStatus(page) {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      const response = await page.request.get(
        `${baseUrl}/api/status?endurance=${Date.now()}`,
        { timeout: 30_000 },
      );
      if (!response.ok()) {
        throw new Error(`status returned HTTP ${response.status()}`);
      }
      const status = await response.json();
      assert.equal(status.network.mode, "testnet");
      assert.equal(status.network.chainId, 46630);
      assert.equal(status.oracle.fresh, true);
      assert.equal(status.persistence.available, true);
      assert.equal(status.priceSync.worker.last_error, null);
      assert.equal(status.pieces.length, 42);
      assert.ok(BigInt(status.nav) > 0n);
      assert.ok(BigInt(status.navPerShare) > 0n);
      assert.ok(status.latestCycle);
      assert.ok(
        status.latestCycle.source === "ai" ||
          status.latestCycle.source === "fallback",
        `unsupported cycle source: ${status.latestCycle.source}`,
      );
      if (status.latestCycle.source === "fallback") {
        assert.match(
          status.latestCycle.rationale,
          /^Deterministic hold:/,
          "fallback cycle must explain the deterministic rejection",
        );
      }
      assert.equal(
        status.latestCycle.decisionContext.mode,
        "robinhood_testnet_replica",
      );
      const recentCycles = [
        status.latestCycle,
        ...(status.latestCycle.decisionContext.recentCycles ?? []),
      ];
      const recentAiCycle = recentCycles.find(
        (cycle) =>
          cycle.source === "ai" &&
          Date.now() - Date.parse(cycle.at) < 95 * 60 * 1000,
      );
      assert.ok(
        recentAiCycle,
        "no successful autonomous AI cycle was recorded in the last 95 minutes",
      );
      return status;
    } catch (error) {
      lastError = error;
      await sleep(4_000);
    }
  }
  throw lastError;
}

async function runAcceptanceActor(page, scenario) {
  const token = process.env.MDB_CYCLE_TOKEN;
  assert.ok(token, "MDB_CYCLE_TOKEN is unavailable to the endurance runner");
  const response = await page.request.post(
    `${baseUrl}/api/testnet-acceptance`,
    {
      headers: { "x-mdb-cycle-token": token },
      data: { scenario },
      timeout: 360_000,
    },
  );
  const body = await response.json();
  assert.equal(
    response.ok(),
    true,
    `testnet acceptance returned HTTP ${response.status()}: ${JSON.stringify(body)}`,
  );
  assert.equal(body.ok, true);
  assert.equal(body.assertions?.noQueuedSale, true);
  assert.equal(body.assertions?.oracleFresh, true);
  assert.equal(body.assertions?.oversizedSellRejected, true);
  assert.equal(body.assertions?.actorFunded, true);
  assert.equal(body.scenario, scenario);
  assert.ok(body.transactions?.buy);
  assert.ok(body.transactions?.sell);
  assert.ok(body.transactions?.preset);
  assert.ok(body.transactions?.brainPurchase);
  return body;
}

async function runAcceptance(page, checkpoint) {
  const baseScenario = checkpoint * 3;
  const setupUser = await runAcceptanceActor(page, baseScenario);
  const concurrentUsers = await Promise.all([
    runAcceptanceActor(page, baseScenario + 1),
    runAcceptanceActor(page, baseScenario + 2),
  ]);
  const users = [setupUser, ...concurrentUsers];
  assert.equal(new Set(users.map((user) => user.actor)).size, 3);
  assert.ok(users.some((user) => user.purchaseType === "initial"));
  assert.ok(users.some((user) => user.purchaseType === "resale"));
  return { ok: true, concurrentRequests: 2, userActions: 3, users };
}

async function verifyServices() {
  const { stdout } = await execFileAsync("systemctl", [
    "is-active",
    ...services,
  ]);
  const states = stdout.trim().split(/\s+/);
  assert.deepEqual(
    states,
    services.map(() => "active"),
  );
  return Object.fromEntries(
    services.map((service, index) => [service, states[index]]),
  );
}

async function waitForMessage(page, expression, timeout = 60_000) {
  await page.getByText(expression).first().waitFor({
    state: "visible",
    timeout,
  });
}

async function dismissGuide(page) {
  const guide = page.getByRole("dialog", {
    name: "How the brain moves the basket",
  });
  if ((await guide.count()) === 1 && (await guide.isVisible())) {
    await guide.getByRole("button", { name: "Got it", exact: true }).click();
  }
}

function presetAccessibleName(option) {
  const value = option.value > 0 ? `+${option.value}` : `${option.value}`;
  return `${value} ${option.label}`;
}

async function buyBrainPieceAndSetPreset(page, checkpoint, status) {
  const resaleCheckpoint = checkpoint === 0;
  const preferredCandidates = status.pieces.filter((piece) =>
    resaleCheckpoint ? !piece.unowned : piece.unowned,
  );
  const candidates =
    preferredCandidates.length > 0
      ? preferredCandidates
      : status.pieces.filter((piece) => piece.unowned);
  const candidate = candidates.sort((left, right) =>
    BigInt(left.price) < BigInt(right.price) ? -1 : 1,
  )[0];
  if (!candidate) {
    return { skipped: "no unowned pieces remain" };
  }
  await page.getByRole("button", { name: "Brain", exact: true }).click();
  const cells = page.locator(".brain-cell");
  assert.equal(await cells.count(), 42);
  await cells.nth(candidate.id - 1).focus();
  await page.keyboard.press("Enter");
  const buyButton = page.getByRole("button", {
    name: /Buy (piece|next)/,
  });
  assert.equal(await buyButton.count(), 1);
  await buyButton.click();
  await waitForMessage(
    page,
    new RegExp(`Brain piece ${candidate.id} is now yours\\.`),
    90_000,
  );

  let presetIndex = (checkpoint + 1) % candidate.options.length;
  if (presetIndex === candidate.preset) {
    presetIndex = (presetIndex + 1) % candidate.options.length;
  }
  const presetButton = page.getByRole("button", {
    name: presetAccessibleName(candidate.options[presetIndex]),
    exact: true,
  });
  assert.equal(await presetButton.count(), 1);
  await presetButton.click();
  await waitForMessage(
    page,
    new RegExp(`Piece ${candidate.id} now sets .+ to .+\\.`),
    90_000,
  );
  return {
    pieceId: candidate.id,
    purchaseType: candidate.unowned ? "initial" : "resale",
    paidWad: candidate.price,
    preset: presetIndex,
    presetLabel: candidate.options[presetIndex].label,
  };
}

async function buyAndSellMdbs(page, checkpoint) {
  await page.getByRole("button", { name: "Basket", exact: true }).click();
  const panel = page.locator("#basket-trade");
  assert.equal(await panel.count(), 1);
  await panel.getByRole("tab", { name: "Buy", exact: true }).click();
  const amount = panel.getByLabel("USDG to spend");
  const spend = String(100 + (checkpoint % 4) * 25);
  await amount.fill(spend);
  await panel.getByRole("button", { name: "Buy MDBS", exact: true }).click();
  await waitForMessage(
    page,
    /Purchase complete\. You bought approximately/,
    90_000,
  );

  await panel.getByRole("tab", { name: "Sell", exact: true }).click();
  await panel.getByRole("button", { name: "25%", exact: true }).click();
  await panel.getByRole("button", { name: "Sell MDBS", exact: true }).click();
  await waitForMessage(
    page,
    /Sale complete\. You received approximately .* USDG for your MDBS\./,
    90_000,
  );
  return { spendUsdG: spend, soldSharePreset: "25%" };
}

async function claimRewards(page) {
  await page.getByRole("button", { name: "Brain", exact: true }).click();
  const claim = page.getByRole("button", {
    name: /^Claim \$[\d,.]+ USDG$/,
  });
  if ((await claim.count()) !== 1 || !(await claim.isEnabled())) {
    return { skipped: "nothing claimable" };
  }
  const label = await claim.innerText();
  await claim.click();
  await waitForMessage(
    page,
    "Brain-owner rewards claimed to your development wallet.",
    90_000,
  );
  return { claimed: label };
}

async function verifyUi(page, checkpoint) {
  const viewports = [
    { width: 390, height: 844, name: "mobile" },
    { width: 768, height: 1024, name: "tablet" },
    { width: 1440, height: 1100, name: "desktop" },
  ];
  const responsive = [];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    await page.reload({ waitUntil: "networkidle", timeout: 60_000 });
    await dismissGuide(page);
    const widths = await page.evaluate(() => ({
      client: document.documentElement.clientWidth,
      scroll: document.documentElement.scrollWidth,
    }));
    assert.ok(
      widths.scroll <= widths.client,
      `${viewport.name} has horizontal page overflow`,
    );
    responsive.push({ ...viewport, ...widths });
  }

  await page.getByRole("button", { name: "Decisions", exact: true }).click();
  await page
    .getByRole("heading", {
      name: "Explore every decision and execution.",
      exact: true,
    })
    .waitFor({ state: "visible", timeout: 30_000 });
  assert.ok((await page.getByTestId("decision-history-item").count()) > 0);
  await page.getByText("Market data and pricing", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });
  await page.getByText("BRAIN DRAMA", { exact: true }).waitFor({
    state: "visible",
    timeout: 30_000,
  });

  const theme = page.getByRole("button", {
    name: checkpoint % 2 === 0 ? "Dark" : "Light",
    exact: true,
  });
  if ((await theme.count()) === 1) await theme.click();

  await page.getByRole("button", { name: "Brain", exact: true }).click();
  const crew = page.getByRole("button", {
    name: "Decision Goblins (8)",
    exact: true,
  });
  await crew.click();
  assert.equal(await crew.getAttribute("aria-pressed"), "true");
  await crew.click();
  assert.equal(await page.locator(".brain-cell").count(), 42);
  assert.equal(
    await page
      .getByRole("button", { name: "Connect wallet", exact: true })
      .count(),
    1,
  );
  return responsive;
}

async function runCheckpoint(page, checkpoint, browserErrors) {
  const startedAt = Date.now();
  await page.reload({ waitUntil: "networkidle", timeout: 60_000 });
  await dismissGuide(page);
  const servicesBefore = await verifyServices();
  const statusBefore = await getHealthyStatus(page);

  const acceptance = await runAcceptance(page, checkpoint);
  const responsive = await verifyUi(page, checkpoint);

  const statusAfter = await getHealthyStatus(page);
  assert.equal(statusAfter.redemption.pendingRequestId, "0");
  const pricedNav = Object.values(statusAfter.holdingValues).reduce(
    (total, value) => total + BigInt(value),
    0n,
  );
  assert.equal(pricedNav, BigInt(statusAfter.nav));
  assert.equal(browserErrors.length, 0, browserErrors.join(" | "));

  if (checkpoint % 3 === 0) {
    await page.screenshot({
      path: `${stateDirectory}/checkpoint-${String(checkpoint).padStart(2, "0")}.png`,
      fullPage: true,
    });
  }

  return {
    checkpoint,
    startedAt: new Date(startedAt).toISOString(),
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    blockBefore: statusBefore.blockNumber,
    blockAfter: statusAfter.blockNumber,
    navBeforeWad: statusBefore.nav,
    navAfterWad: statusAfter.nav,
    navPerShareBeforeWad: statusBefore.navPerShare,
    navPerShareAfterWad: statusAfter.navPerShare,
    latestCycleAt: statusAfter.latestCycle.at,
    latestCycleTxHash: statusAfter.latestCycle.txHash,
    services: servicesBefore,
    actions: acceptance,
    responsive,
    browserErrors: [...browserErrors],
  };
}

await mkdir(stateDirectory, { recursive: true });
const state = await loadOrCreateState();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const browserErrors = [];
page.on("pageerror", (error) => browserErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") browserErrors.push(message.text());
});

try {
  await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 60_000 });
  await dismissGuide(page);

  while (Date.now() <= state.endAt) {
    if (state.nextCheckpointAt > state.endAt) break;
    const waitMs = Math.max(0, state.nextCheckpointAt - Date.now());
    if (waitMs > 0) await sleep(waitMs);
    browserErrors.length = 0;
    const checkpoint = state.completedCheckpoints;
    try {
      const result = await runCheckpoint(page, checkpoint, browserErrors);
      await appendFile(checkpointPath, `${JSON.stringify(result)}\n`);
      state.completedCheckpoints += 1;
      state.lastCheckpoint = result;
      state.lastFailure = null;
      state.nextCheckpointAt =
        state.startedAt + state.completedCheckpoints * state.intervalMs;
      state.failureAt = null;
      await atomicJson(statePath, state);
      console.log(
        `ENDURANCE CHECKPOINT ${checkpoint} PASS at ${result.completedAt}`,
      );
      if (singleCheckpoint) break;
    } catch (error) {
      const failure = {
        checkpoint,
        failedAt: new Date().toISOString(),
        error: error instanceof Error ? error.stack : String(error),
        visibleMessage: await page
          .locator(".editorial-banner")
          .textContent()
          .catch(() => null),
        browserErrors: [...browserErrors],
      };
      state.failedAttempts += 1;
      state.failureAt = Date.now();
      state.lastFailure = failure;
      await appendFile(checkpointPath, `${JSON.stringify(failure)}\n`);
      await atomicJson(statePath, state);
      await page
        .screenshot({
          path: `${stateDirectory}/failure-${checkpoint}-${Date.now()}.png`,
          fullPage: true,
        })
        .catch(() => {});
      throw error;
    }
  }

  state.status = "completed";
  state.completedAt = Date.now();
  await atomicJson(statePath, state);
  await atomicJson(summaryPath, {
    chainId: 46630,
    status: "completed",
    startedAt: new Date(state.startedAt).toISOString(),
    completedAt: new Date(state.completedAt).toISOString(),
    activeDurationMs: state.completedAt - state.startedAt,
    durationHours: (state.completedAt - state.startedAt) / 3_600_000,
    completedCheckpoints: state.completedCheckpoints,
    failures: state.failedAttempts,
    failedAttempts: state.failedAttempts,
    atomicBuys: Boolean(
      state.lastCheckpoint?.actions?.users?.every(
        (user) => user.transactions?.buy,
      ),
    ),
    atomicSells: Boolean(
      state.lastCheckpoint?.actions?.users?.every(
        (user) => user.transactions?.sell,
      ),
    ),
    autonomousCycles: Boolean(state.lastCheckpoint?.latestCycleTxHash),
    lastCheckpoint: state.lastCheckpoint,
  });
  await unlink(armedPath).catch(() => {});
  console.log(
    `ENDURANCE COMPLETE: ${state.completedCheckpoints} checkpoints over ${state.completedAt - state.startedAt}ms`,
  );
} finally {
  await browser.close();
}
