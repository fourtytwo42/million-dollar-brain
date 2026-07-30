import assert from "node:assert/strict";
import test from "node:test";
import { getAddress, type Address } from "viem";
import {
  ASSET_POLICY,
  assessDynamicFreshness,
  canonicalAssetId,
  compileUniverseContext,
  normalizeAssetId,
  qualificationStatus,
  validateAssetManifest,
  validateDynamicAllocation,
  type AssetRecordV1,
} from "../apps/web/lib/asset-universe.ts";
import {
  buildStructuredResearchResults,
  validateResearchRequests,
} from "../apps/web/lib/decision-research.ts";

const address = (value: number) =>
  `0x${value.toString(16).padStart(40, "0")}` as Address;

test("V4 freshness follows the dynamic manifest rather than legacy ETHX", () => {
  const records = [
    {
      id: "46630:0x0000000000000000000000000000000000000001",
      symbol: "USDG",
      active: true,
    },
    {
      id: "46630:0x0000000000000000000000000000000000000002",
      symbol: "WETH",
      active: true,
    },
  ];
  const detailed = records.map((record) => ({
    id: record.id,
    symbol: record.symbol,
    identity: {
      permissions: { buy: true, sell: true, halted: false },
    },
  }));
  const freshness = assessDynamicFreshness(records, detailed, {
    fresh: true,
    chainTimestamp: 1_000,
    assets: {
      USDG: {
        priceUsdWad: "1000000000000000000",
        updatedAt: 950,
        valid: true,
      },
      WETH: {
        priceUsdWad: "3000000000000000000000",
        updatedAt: 950,
        valid: true,
      },
    },
  });
  assert.equal(freshness.holdRequired, false);
  assert.deepEqual(freshness.reasons, []);
});

test("V4 freshness fails closed for a stale registered asset", () => {
  const record = {
    id: "46630:0x0000000000000000000000000000000000000002",
    symbol: "WETH",
    active: true,
  };
  const freshness = assessDynamicFreshness(
    [record],
    [
      {
        id: record.id,
        symbol: record.symbol,
        identity: {
          permissions: { buy: true, sell: true, halted: false },
        },
      },
    ],
    {
      fresh: true,
      chainTimestamp: 1_000,
      assets: {
        WETH: {
          priceUsdWad: "3000000000000000000000",
          updatedAt: 800,
          valid: true,
        },
      },
    },
  );
  assert.equal(freshness.holdRequired, true);
  assert.deepEqual(freshness.reasons, ["WETH valuation is stale"]);
});

function asset(
  value: number,
  kind: AssetRecordV1["kind"],
  riskClass: AssetRecordV1["riskClass"],
): AssetRecordV1 {
  const token = address(value);
  return {
    id: canonicalAssetId(4663, token),
    chainId: 4663,
    address: token,
    symbol: kind === "reserve" ? "USDG" : `T${value}`,
    name: `Token ${value}`,
    robinhoodUid: kind === "stock" ? `uid-${value}` : null,
    kind,
    riskClass,
    tags: [kind],
    decimals: 18,
    maximumWeightBps: kind === "reserve" ? 10_000 : 2_000,
    valuationAdapter: address(100),
    executionAdapter: kind === "reserve" ? null : address(101),
    circulatingSupplyAdapter:
      kind === "crypto" || kind === "token" ? address(102) : null,
    canonicalSource: "official-fixture",
    qualification: {
      schemaVersion: 3,
      evidenceHash: `hash-${value}`,
      observedAt: new Date().toISOString(),
      validUntil: new Date(Date.now() + 86_400_000).toISOString(),
      qualificationHours: 48,
      regularMarketSessions: 2,
      lastFailureAt: null,
      safeTwoSidedCapacityUsdWad: (25_000n * 10n ** 18n).toString(),
      maximumExposureUsdWad: (12_500n * 10n ** 18n).toString(),
      capacityProbeUsdWad: [(25_000n * 10n ** 18n).toString()],
      buyImpactBps: 100,
      sellImpactBps: 100,
      identityValid: true,
      routeMature: true,
      liquidityValid: true,
      transferBehaviorValid: true,
      tokenStateClear: true,
      dexSafety: {
        shortTwapWindowSeconds: 1800,
        longTwapWindowSeconds: 14400,
        shortTwapValid: true,
        longTwapValid: true,
        timeWeightedLiquidityValid: true,
        spotToShortDeviationBps: 10,
        shortToLongDeviationBps: 20,
        observationCardinality: 8,
        newestObservationAt: new Date().toISOString(),
      },
      reasons: [],
    },
    active: true,
  };
}

test("V3 qualification enforces 48 hours, market sessions, DEX safety, and capacity", () => {
  const crypto = asset(1, "crypto", "high_volatility");
  assert.ok(
    crypto.qualification && "qualificationHours" in crypto.qualification,
  );
  const qualification = crypto.qualification;
  assert.equal(qualificationStatus(crypto, qualification).eligible, true);
  qualification.qualificationHours = 47;
  assert.equal(qualificationStatus(crypto, qualification).eligible, false);
  qualification.qualificationHours = 48;
  crypto.circulatingSupplyAdapter = null;
  assert.equal(qualificationStatus(crypto, qualification).eligible, true);
  qualification.dexSafety.longTwapValid = false;
  assert.match(
    qualificationStatus(crypto, qualification).reasons.join(" "),
    /four-hour/,
  );
});

test("manifest identity is address and chain based rather than symbol based", () => {
  const first = asset(1, "stock", "standard");
  const second = asset(2, "stock", "standard");
  second.symbol = first.symbol;
  assert.equal(validateAssetManifest([first, second], 4663).length, 2);
  second.address = first.address;
  second.id = first.id;
  assert.throws(
    () => validateAssetManifest([first, second], 4663),
    /duplicate/,
  );
});

test("allocation canonicalizes checksum asset IDs and rejects aliases", () => {
  const reserve = asset(1, "reserve", "reserve");
  const risk = asset(0xabc, "stock", "standard");
  const checksumRiskId = `${risk.chainId}:${getAddress(risk.address)}`;
  assert.equal(normalizeAssetId(checksumRiskId), risk.id);
  assert.deepEqual(
    validateDynamicAllocation(
      { [reserve.id]: 8_000, [checksumRiskId]: 2_000 },
      [reserve, risk],
      reserve.id,
    ),
    { [reserve.id]: 8_000, [risk.id]: 2_000 },
  );
  assert.throws(
    () =>
      validateDynamicAllocation(
        { [risk.id]: 1_000, [checksumRiskId]: 1_000, [reserve.id]: 8_000 },
        [reserve, risk],
        reserve.id,
      ),
    /duplicate asset/,
  );
});

test("dynamic allocation accepts any active asset and enforces portfolio caps", () => {
  const reserve = asset(1, "reserve", "reserve");
  const risks = Array.from({ length: 5 }, (_, index) =>
    asset(index + 2, "stock", "standard"),
  );
  const allocation = validateDynamicAllocation(
    Object.fromEntries([
      [reserve.id, 2_000],
      ...risks.map((item) => [item.id, 1_600]),
    ]),
    [reserve, ...risks],
    reserve.id,
  );
  assert.equal(
    Object.values(allocation).reduce((sum, item) => sum + item, 0),
    10_000,
  );
  assert.throws(
    () =>
      validateDynamicAllocation(
        { [reserve.id]: 2_000, [risks[0].id]: 8_000 },
        [reserve, ...risks],
        reserve.id,
      ),
    /weight exceeds/,
  );
});

test("full compact universe is retained while details are capped at 64", () => {
  const compact = Array.from({ length: 96 }, (_, index) => ({
    id: `asset-${index}`,
    symbol: `T${index}`,
    kind: "stock" as const,
    riskClass: "standard" as const,
    tags: ["stock"],
    weightBps: 0,
    return24hBps: index,
    return7dBps: null,
    volatility30dBps: null,
    liquidityScoreBps: index,
    spreadBps: 10,
    qualificationHours: 48,
    maximumWeightBps: 2_000,
  }));
  const context = compileUniverseContext(
    compact,
    compact.map((item) => ({ ...item, portfolio: { weightBps: 0 } })),
  );
  assert.equal(context.compactDirectory.length, 96);
  assert.equal(context.detailedAssets.length, 64);
  assert.equal(context.holdRequired, false);
  assert.equal(ASSET_POLICY.maximumInputTokens, 96_000);
});

test("research is one bounded allowlisted set and returns structured evidence", () => {
  const records = Array.from({ length: 17 }, (_, index) =>
    asset(index + 1, index === 0 ? "reserve" : "stock", "standard"),
  );
  assert.throws(
    () =>
      validateResearchRequests(
        records.map((item) => ({ assetId: item.id, topics: ["identity"] })),
        records,
      ),
    /1-16/,
  );
  const requests = validateResearchRequests(
    [{ assetId: records[1].id, topics: ["identity", "liquidity"] }],
    records,
  );
  const result = buildStructuredResearchResults(requests, records, [], []);
  assert.equal(result.length, 1);
  assert.equal(result[0].assetId, records[1].id);
  assert.deepEqual(result[0].unavailable, []);
});
