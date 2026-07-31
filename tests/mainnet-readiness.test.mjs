import assert from "node:assert/strict";
import test from "node:test";
import {
  CAPACITY_PROBES_USD,
  MAINNET_PRIORITY_SYMBOLS,
  summarizeMainnetReadiness,
} from "../scripts/lib/mainnet-readiness.mjs";

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
