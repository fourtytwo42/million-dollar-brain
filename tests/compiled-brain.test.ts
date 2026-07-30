import assert from "node:assert/strict";
import test from "node:test";
import {
  applyEvidenceAwareAllocationPolicy,
  applyCompiledRestrictions,
  compileBrainV1,
  evaluateBrainEligibility,
  type CompilableAsset,
} from "../apps/web/lib/compiled-brain.ts";
import {
  BRAIN_CONTROL_CATALOG,
  defaultControlBundle,
} from "../apps/web/lib/brain-controls.ts";

const assets: CompilableAsset[] = [
  {
    id: "usdg",
    controlId: 1,
    symbol: "USDG",
    kind: "reserve",
    riskClass: "reserve",
    active: true,
    tags: ["reserve"],
    currentWeightBps: 2000,
  },
  {
    id: "nvda",
    controlId: 3,
    symbol: "NVDA",
    kind: "stock",
    riskClass: "standard",
    active: true,
    tags: ["technology", "ai_semiconductor"],
    currentWeightBps: 3000,
  },
  {
    id: "weth",
    controlId: 12,
    symbol: "WETH",
    kind: "crypto",
    riskClass: "high_volatility",
    active: true,
    tags: ["crypto_major"],
    currentWeightBps: 2000,
  },
];

function pieces() {
  return BRAIN_CONTROL_CATALOG.map((piece) => ({
    id: piece.id,
    weightBps: 100,
    bundle: defaultControlBundle(piece.id),
  }));
}

test("restrictive asset directives beat positive preferences", () => {
  const state = pieces();
  state[20].bundle.assetIds = [3, 0, 0, 3];
  state[20].bundle.values[4] = 4;
  state[19].bundle.assetIds = [3, 0, 0, 3];
  state[19].bundle.values[4] = 7;
  const compiled = compileBrainV1(state, assets);
  assert.equal(compiled.assetDirectives.nvda.directive, "exit");
  assert.equal(compiled.assetDirectives.nvda.maximumTargetBps, 0);
  assert.ok(compiled.conflicts.length > 0);
});

test("reduce caps at half current weight and released weight goes to reserve", () => {
  const state = pieces();
  state[20].bundle.assetIds[3] = 3;
  state[20].bundle.values[4] = 5;
  const compiled = compileBrainV1(state, assets);
  const result = applyCompiledRestrictions(
    { usdg: 2000, nvda: 5000, weth: 3000 },
    compiled,
    "usdg",
  );
  assert.equal(result.nvda, 1500);
  assert.equal(result.usdg, 6500);
  assert.equal(result.weth, 2000);
  assert.equal(
    Object.values(result).reduce((sum, value) => sum + value, 0),
    10000,
  );
});

test("panic cadence accelerates but cooldown and drift remain enforced", () => {
  const compiled = compileBrainV1(pieces(), assets);
  const now = 10_000_000;
  const eligibility = evaluateBrainEligibility(compiled, {
    nowMs: now,
    lastReviewAtMs: now - 31 * 60_000,
    lastTradeAtMs: now - 61 * 60_000,
    currentDriftBps: 250,
    basketVolatility24hBps: 900,
    rollingVolatility80thBps: 700,
    navDrawdownFromSevenDayHighBps: 100,
    fresh: true,
    paused: false,
    cycleRunning: false,
  });
  assert.equal(eligibility.panicState, "volatility");
  assert.equal(eligibility.effectiveCadenceMinutes, 30);
  assert.equal(eligibility.eligible, true);
});

test("stale data, cooldown, drift, and concurrency each prevent execution", () => {
  const compiled = compileBrainV1(pieces(), assets);
  const eligibility = evaluateBrainEligibility(compiled, {
    nowMs: 1_000_000,
    lastReviewAtMs: 999_000,
    lastTradeAtMs: 999_000,
    currentDriftBps: 0,
    basketVolatility24hBps: null,
    rollingVolatility80thBps: null,
    navDrawdownFromSevenDayHighBps: null,
    fresh: false,
    paused: false,
    cycleRunning: true,
  });
  assert.equal(eligibility.eligible, false);
  assert.ok(eligibility.reasons.length >= 4);
});

test("preferred position count is a deterministic maximum, not a target", () => {
  const state = pieces();
  state[2].bundle.values[0] = 1; // Four positions.
  const expanded = [
    ...assets,
    ...["aapl", "msft", "spy", "qqq"].map((id, index) => ({
      id,
      controlId: 20 + index,
      symbol: id.toUpperCase(),
      kind: index > 1 ? "etf" : "stock",
      riskClass: "standard",
      active: true,
      tags: ["broad_market"],
      currentWeightBps: 0,
    })),
  ];
  const compiled = compileBrainV1(state, expanded);
  const result = applyEvidenceAwareAllocationPolicy(
    {
      usdg: 2000,
      nvda: 1200,
      weth: 1000,
      aapl: 1200,
      msft: 1200,
      spy: 1200,
      qqq: 1200,
    },
    compiled,
    "usdg",
    Object.fromEntries(
      expanded.map((asset, index) => [
        asset.id,
        {
          tier:
            index % 3 === 0
              ? ("complete" as const)
              : index % 3 === 1
                ? ("partial" as const)
                : ("price_only" as const),
          coverageScoreBps: 1000 + index,
          liquidityScoreBps: 5000,
        },
      ]),
    ),
  );
  assert.equal(
    Object.entries(result.allocation).filter(
      ([id, weight]) => id !== "usdg" && weight > 0,
    ).length,
    4,
  );
  assert.equal(result.policy.removedAssetIds.length, 2);
  assert.equal(
    Object.values(result.allocation).reduce((sum, value) => sum + value, 0),
    10000,
  );
});

test("equal-weight evidence ties use canonical asset id as final tie-break", () => {
  const state = pieces();
  state[2].bundle.values[0] = 0; // Two positions.
  const tied = [
    assets[0],
    ...["asset-c", "asset-a", "asset-b"].map((id, index) => ({
      ...assets[1],
      id,
      controlId: 20 + index,
      symbol: id.toUpperCase(),
    })),
  ];
  const compiled = compileBrainV1(state, tied);
  const evidence = Object.fromEntries(
    tied.map((asset) => [
      asset.id,
      {
        tier: "partial" as const,
        coverageScoreBps: 5000,
        liquidityScoreBps: 5000,
      },
    ]),
  );
  const first = applyEvidenceAwareAllocationPolicy(
    { usdg: 4000, "asset-a": 2000, "asset-b": 2000, "asset-c": 2000 },
    compiled,
    "usdg",
    evidence,
  );
  const second = applyEvidenceAwareAllocationPolicy(
    { usdg: 4000, "asset-c": 2000, "asset-b": 2000, "asset-a": 2000 },
    compiled,
    "usdg",
    evidence,
  );
  assert.deepEqual(first, second);
  assert.deepEqual(first.policy.selectedAssetIds, ["asset-a", "asset-b"]);
});
