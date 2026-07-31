import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRiskCapacityWitness,
  maximumSupportedDeposit,
} from "../apps/web/lib/capacity-policy.ts";

const wad = (value: number) => BigInt(value) * 10n ** 18n;

test("global basket headroom limits deposits", () => {
  assert.deepEqual(
    maximumSupportedDeposit({
      navUsdWad: wad(55_000),
      tvlCapUsdWad: wad(60_000),
      walletValueUsdWad: null,
      assets: [],
    }),
    {
      maximumDepositUsdWad: (wad(5_000) * 10_000n) / 9_900n,
      limitingConstraint: "global basket limit",
    },
  );
});

test("creator and DEX exposure headroom can be the limiting rule", () => {
  const result = maximumSupportedDeposit({
    navUsdWad: wad(20_000),
    tvlCapUsdWad: wad(60_000),
    walletValueUsdWad: null,
    assets: [
      {
        symbol: "NVDA",
        active: true,
        maximumWeightBps: 2_000,
        maximumExposureUsdWad: wad(5_000),
        currentExposureUsdWad: wad(4_000),
        currentWeightBps: 2_000,
      },
    ],
  });
  assert.equal(
    result.maximumDepositUsdWad,
    (wad(1_000) * 10_000n * 10_000n) / (2_000n * 9_900n),
  );
  assert.equal(result.limitingConstraint, "NVDA effective exposure limit");
});

test("per-wallet headroom is included without weakening global limits", () => {
  const result = maximumSupportedDeposit({
    navUsdWad: wad(10_000),
    tvlCapUsdWad: wad(60_000),
    walletValueUsdWad: wad(24_900),
    assets: [],
  });
  assert.equal(result.maximumDepositUsdWad, (wad(100) * 10_000n) / 9_900n);
  assert.equal(result.limitingConstraint, "per-wallet basket limit");
});

test("risk witness maximizes usable capacity without wasting high-volatility slots", () => {
  const assets = [
    ...Array.from({ length: 7 }, (_, index) => ({
      address:
        `0x${(index + 1).toString(16).padStart(40, "0")}` as `0x${string}`,
      id: `S${index}`,
      active: true,
      qualified: true,
      creatorApproved: true,
      riskClass: "standard",
      maximumWeightBps: 2_000,
      maximumExposureUsdWad: wad(12_000),
    })),
    ...Array.from({ length: 4 }, (_, index) => ({
      address:
        `0x${(index + 20).toString(16).padStart(40, "0")}` as `0x${string}`,
      id: `H${index}`,
      active: true,
      qualified: true,
      creatorApproved: true,
      riskClass: "high_volatility",
      maximumWeightBps: 2_000,
      maximumExposureUsdWad: wad(12_000),
    })),
  ];
  const result = buildRiskCapacityWitness(assets, wad(60_000));
  assert.equal(result.valid, true);
  assert.ok(result.witness.length <= 9);
  assert.equal(result.supportedRiskCapacityUsdWad, wad(102_000));
  assert.equal(
    result.witness.filter((address) => BigInt(address) >= 20n).length,
    2,
  );
});
