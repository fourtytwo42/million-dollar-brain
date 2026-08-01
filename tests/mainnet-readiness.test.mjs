import assert from "node:assert/strict";
import test from "node:test";
import {
  CAPACITY_PROBES_USD,
  fullCanonicalUniverseInspected,
  MAINNET_PRIORITY_SYMBOLS,
  poolObservationFresh,
  selectPreliminaryAssets,
  summarizePausedDeploymentReadiness,
  summarizeMainnetReadiness,
} from "../scripts/lib/mainnet-readiness.mjs";

test("pool observation freshness matches the one-hour valuation bound", () => {
  assert.equal(
    poolObservationFresh({
      blockTimestamp: 10_000n,
      observationTimestamp: 6_400n,
    }),
    true,
  );
  assert.equal(
    poolObservationFresh({
      blockTimestamp: 10_001n,
      observationTimestamp: 6_400n,
    }),
    false,
  );
  assert.equal(
    poolObservationFresh({
      blockTimestamp: 10_000n,
      observationTimestamp: 10_001n,
    }),
    false,
  );
});

const wad = (value) => (BigInt(value) * 10n ** 18n).toString();
const qualified = (
  symbol,
  capacityUsd = 25_000,
  riskClass = "standard",
  assetId = `4663:${symbol.toLowerCase()}`,
) => ({
  assetId,
  symbol,
  riskClass,
  maximumWeightBps: 2_000,
  safeTwoSidedCapacityUsdWad: wad(capacityUsd),
  identityValid: true,
  routeMaturityScoreBps: 10_000,
  qualificationWindowPassed: true,
});

test("capacity ladder is deterministic and begins at a usable small trade", () => {
  assert.deepEqual(
    CAPACITY_PROBES_USD,
    [1_000, 5_000, 10_000, 25_000, 100_000, 250_000],
  );
  assert.deepEqual(MAINNET_PRIORITY_SYMBOLS, [
    "WETH",
    "NVDA",
    "GME",
    "SPY",
    "SPCX",
    "VIRTUAL",
  ]);
});

test("full-universe gate follows the official deployable registry count", () => {
  assert.equal(
    fullCanonicalUniverseInspected({
      officialMainnetDeploymentCount: 96,
      inspectedStockAssetCount: 96,
    }),
    true,
  );
  assert.equal(
    fullCanonicalUniverseInspected({
      officialMainnetDeploymentCount: 96,
      inspectedStockAssetCount: 95,
    }),
    false,
  );
  assert.equal(
    fullCanonicalUniverseInspected({
      officialMainnetDeploymentCount: 96,
      inspectedStockAssetCount: 96,
      diagnosticFilterEnabled: true,
    }),
    false,
  );
  assert.equal(
    fullCanonicalUniverseInspected({
      officialMainnetDeploymentCount: 12,
      inspectedStockAssetCount: 12,
    }),
    false,
  );
});

test("paused canary selects current DEX-valid assets without promoting qualification", () => {
  const rows = [
    {
      ...qualified("WETH", 100_000, "high_volatility", "4663:00"),
      passed: true,
      routeMature: true,
      dexSafetyValid: true,
      qualificationWindowPassed: false,
    },
    ...Array.from({ length: 7 }, (_, index) => ({
      ...qualified(
        `STANDARD${index}`,
        25_000 + index,
        "standard",
        `4663:1${index}`,
      ),
      passed: true,
      routeMature: true,
      dexSafetyValid: true,
      qualificationWindowPassed: false,
    })),
    ...Array.from({ length: 5 }, (_, index) => ({
      ...qualified(
        `HIGH${index}`,
        250_000,
        "high_volatility",
        `4663:2${index}`,
      ),
      passed: true,
      routeMature: true,
      dexSafetyValid: true,
      qualificationWindowPassed: false,
    })),
  ];
  const selected = selectPreliminaryAssets(rows);
  assert.equal(selected.length, 9);
  assert.equal(
    selected.some((asset) => asset.symbol === "WETH"),
    true,
  );
  assert.equal(
    selected.filter((asset) => asset.riskClass === "high_volatility").length <=
      3,
    true,
  );
  const deployment = summarizePausedDeploymentReadiness(rows);
  assert.equal(deployment.pausedShadowReady, true);
  assert.equal(deployment.preliminaryRiskAssetCount, 9);
  assert.equal(summarizeMainnetReadiness(rows).coreQualificationPassed, false);
});

test("readiness requires four assets and enough post-risk-cap capacity for 80% exposure", () => {
  const insufficient = summarizeMainnetReadiness([
    qualified("WETH", 25_000, "high_volatility"),
    qualified("NVDA"),
    qualified("SPY"),
    qualified("GME", 25_000, "high_volatility"),
  ]);
  assert.equal(insufficient.coreQualificationPassed, false);
  assert.match(insufficient.missingRequirements.join(" "), /80%/);

  const ready = summarizeMainnetReadiness([
    qualified("WETH", 25_000, "high_volatility"),
    qualified("NVDA"),
    qualified("SPY"),
    qualified("MSFT"),
    qualified("GME", 25_000, "high_volatility"),
  ]);
  assert.equal(ready.aggregateRiskCapacityBps, 8_000);
  assert.equal(ready.coreQualificationPassed, true);
  assert.deepEqual(ready.missingRequirements, []);
});

test("canonical WETH identity is independent from its 48-hour qualification clock", () => {
  const readiness = summarizeMainnetReadiness([
    {
      ...qualified("WETH", 250_000, "high_volatility"),
      qualificationWindowPassed: false,
    },
    qualified("NVDA"),
    qualified("SPY"),
    qualified("MSFT"),
    qualified("AAPL"),
  ]);
  assert.doesNotMatch(
    readiness.missingRequirements.join(" "),
    /canonical WETH identity/,
  );
});

test("selection is capacity-first with canonical asset ID as the stable tie-break", () => {
  const readiness = summarizeMainnetReadiness([
    qualified("WETH", 250_000, "high_volatility", "4663:03"),
    qualified("BETA", 25_000, "standard", "4663:02"),
    qualified("ALPHA", 25_000, "standard", "4663:01"),
    qualified("GAMMA", 25_000, "standard", "4663:04"),
  ]);
  assert.deepEqual(readiness.includedAssetIds.slice(1), [
    "4663:01",
    "4663:02",
    "4663:04",
  ]);
});

test("launch witness does not waste its nine slots on excess high-volatility capacity", () => {
  const assets = [
    qualified("WETH", 250_000, "high_volatility", "4663:00"),
    ...Array.from({ length: 8 }, (_, index) =>
      qualified(`HIGH${index}`, 250_000, "high_volatility", `4663:1${index}`),
    ),
    ...Array.from({ length: 4 }, (_, index) =>
      qualified(`STANDARD${index}`, 25_000, "standard", `4663:2${index}`),
    ),
  ];
  const readiness = summarizeMainnetReadiness(assets);
  assert.equal(readiness.coreQualificationPassed, true);
  assert.equal(readiness.includedAssetIds.length <= 9, true);
  assert.equal(
    readiness.includedAssetIds.filter((id) => id.startsWith("4663:2")).length,
    4,
  );
});
