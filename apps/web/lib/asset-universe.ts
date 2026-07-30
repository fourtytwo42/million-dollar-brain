import { isAddress, type Address } from "viem";
import { stableDecisionJson } from "./decision-math.ts";

export type AssetKind = "reserve" | "stock" | "etf" | "crypto" | "token";
export type RiskClass = "reserve" | "standard" | "high_volatility";

export type AssetQualificationV1 = {
  evidenceHash: string;
  observedAt: string;
  validUntil: string;
  consecutiveDays: number;
  marketCapOrAumUsdWad: string | null;
  executableDepthUsdWad: string | null;
  buyImpactBps: number | null;
  sellImpactBps: number | null;
  identityValid: boolean;
  oracleValid: boolean;
  liquidityValid: boolean;
  transferBehaviorValid: boolean;
  corporateActionClear: boolean;
  reasons: string[];
};

export type AssetQualificationWindowV2 = Omit<
  AssetQualificationV1,
  "consecutiveDays"
> & {
  schemaVersion: 2;
  qualificationHours: number;
  regularMarketSessions: number;
  lastFailureAt: string | null;
};

export type DexSafetyEvidenceV2 = {
  shortTwapWindowSeconds: 1800;
  longTwapWindowSeconds: 14400;
  shortTwapValid: boolean;
  longTwapValid: boolean;
  timeWeightedLiquidityValid: boolean;
  spotToShortDeviationBps: number | null;
  shortToLongDeviationBps: number | null;
  observationCardinality: number;
  newestObservationAt: string | null;
};

export type AssetQualificationV3 = {
  schemaVersion: 3;
  evidenceHash: string;
  observedAt: string;
  validUntil: string;
  qualificationHours: number;
  regularMarketSessions: number;
  safeTwoSidedCapacityUsdWad: string;
  maximumExposureUsdWad: string;
  capacityProbeUsdWad: string[];
  buyImpactBps: number | null;
  sellImpactBps: number | null;
  identityValid: boolean;
  routeMature: boolean;
  liquidityValid: boolean;
  transferBehaviorValid: boolean;
  tokenStateClear: boolean;
  dexSafety: DexSafetyEvidenceV2;
  lastFailureAt: string | null;
  reasons: string[];
};

export type AssetRecordV1 = {
  id: string;
  chainId: number;
  address: Address;
  symbol: string;
  name: string;
  robinhoodUid: string | null;
  kind: AssetKind;
  riskClass: RiskClass;
  tags: string[];
  decimals: number;
  maximumWeightBps: number;
  valuationAdapter: Address | null;
  executionAdapter: Address | null;
  circulatingSupplyAdapter: Address | null;
  canonicalSource: string;
  qualification:
    | AssetQualificationV1
    | AssetQualificationWindowV2
    | AssetQualificationV3
    | null;
  active: boolean;
};

export type CompactAssetV1 = {
  id: string;
  symbol: string;
  kind: AssetKind;
  riskClass: RiskClass;
  tags: string[];
  weightBps: number;
  return24hBps: number | null;
  return7dBps: number | null;
  volatility30dBps: number | null;
  liquidityScoreBps: number | null;
  spreadBps: number | null;
  qualificationHours: number;
  maximumWeightBps: number;
  evidence?: {
    tier: "complete" | "partial" | "price_only";
    coverageScoreBps: number;
    sampleCount: number;
    spanMinutes: number;
    availableFields: string[];
    unavailableReasons: string[];
  };
};

export type DynamicAllocation = Record<string, number>;

export type DynamicOracleState = {
  fresh: boolean;
  chainTimestamp?: number;
  maximumPriceAge?: number;
  assets: Record<
    string,
    { priceUsdWad: string; updatedAt: number; valid: boolean }
  >;
};

export const ASSET_POLICY = {
  // Legacy V1/V2 replay values. New qualification uses only the V3 fields below.
  minimumMarketCapOrAumUsdWad: 100_000_000n * 10n ** 18n,
  minimumExecutableDepthUsdWad: 250_000n * 10n ** 18n,
  initialTvlCapUsdWad: 60_000n * 10n ** 18n,
  capacityProbeUsdWad: [
    1_000n,
    5_000n,
    10_000n,
    25_000n,
    100_000n,
    250_000n,
  ].map((value) => value * 10n ** 18n),
  maximumExposureCapacityBps: 5_000,
  maximumProbeImpactBps: 100,
  minimumQualificationHours: 48,
  minimumRegularMarketSessions: 2,
  maximumRiskPositions: 9,
  maximumAssetWeightBps: 2_000,
  maximumHighVolatilityBps: 3_000,
  minimumReserveWeightBps: 2_000,
  totalWeightBps: 10_000,
  maximumInputTokens: 96_000,
  maximumDetailedAssets: 64,
  maximumResearchAssets: 16,
  minimumLaunchRiskAssets: 4,
  minimumAggregateRiskCapacityBps: 8_000,
} as const;

export function assessDynamicFreshness(
  records: Pick<AssetRecordV1, "active" | "id" | "symbol">[],
  detailedAssets: {
    id?: string;
    symbol: string;
    identity: { permissions: { halted: boolean } };
  }[],
  oracle: DynamicOracleState,
  nowSeconds = oracle.chainTimestamp ?? Math.floor(Date.now() / 1_000),
) {
  const reasons: string[] = [];
  if (!oracle.fresh) reasons.push("required on-chain valuation is stale");
  for (const record of records.filter((candidate) => candidate.active)) {
    const observation = oracle.assets[record.symbol];
    if (!observation?.valid) {
      reasons.push(`${record.symbol} valuation is invalid`);
      continue;
    }
    if (
      observation.updatedAt <= 0 ||
      Math.max(0, nowSeconds - observation.updatedAt) >
        (oracle.maximumPriceAge ?? 120)
    ) {
      reasons.push(`${record.symbol} valuation is stale`);
    }
    const dossier = detailedAssets.find((asset) => asset.id === record.id);
    if (dossier?.identity.permissions.halted) {
      reasons.push(`${record.symbol} trading is halted`);
    }
  }
  return {
    requiredStateFresh: oracle.fresh,
    requiredQuotesFresh: reasons.length === 0,
    holdRequired: reasons.length > 0,
    reasons,
  };
}

export function canonicalAssetId(chainId: number, address: string) {
  if (!Number.isSafeInteger(chainId) || chainId <= 0 || !isAddress(address)) {
    throw new Error("invalid asset identity");
  }
  return `${chainId}:${address.toLowerCase()}`;
}

export function normalizeAssetId(value: string) {
  const separator = value.indexOf(":");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`invalid asset id: ${value}`);
  }
  const chainId = Number(value.slice(0, separator));
  return canonicalAssetId(chainId, value.slice(separator + 1));
}

export function qualificationStatus(
  asset: Pick<
    AssetRecordV1,
    | "kind"
    | "valuationAdapter"
    | "executionAdapter"
    | "circulatingSupplyAdapter"
  >,
  evidence:
    | AssetQualificationV1
    | AssetQualificationWindowV2
    | AssetQualificationV3
    | null,
  now = Date.now(),
) {
  const reasons: string[] = [];
  if (!evidence) return { eligible: false, reasons: ["missing evidence"] };
  if ("schemaVersion" in evidence && evidence.schemaVersion === 3) {
    if (Date.parse(evidence.validUntil) <= now)
      reasons.push("evidence expired");
    if (evidence.qualificationHours < ASSET_POLICY.minimumQualificationHours) {
      reasons.push("48 continuous qualification hours not complete");
    }
    if (
      (asset.kind === "stock" || asset.kind === "etf") &&
      evidence.regularMarketSessions < ASSET_POLICY.minimumRegularMarketSessions
    ) {
      reasons.push("two regular US market sessions not observed");
    }
    if (BigInt(evidence.safeTwoSidedCapacityUsdWad) <= 0n) {
      reasons.push("no passing two-sided DEX capacity");
    }
    if (
      evidence.buyImpactBps === null ||
      evidence.buyImpactBps > ASSET_POLICY.maximumProbeImpactBps ||
      evidence.sellImpactBps === null ||
      evidence.sellImpactBps > ASSET_POLICY.maximumProbeImpactBps
    ) {
      reasons.push("capacity probe exceeds 1% DEX impact");
    }
    if (!evidence.identityValid)
      reasons.push("canonical on-chain identity invalid");
    if (!evidence.routeMature || !asset.valuationAdapter)
      reasons.push("mature DEX valuation route unavailable");
    if (!evidence.liquidityValid || !asset.executionAdapter)
      reasons.push("DEX execution unavailable");
    if (!evidence.dexSafety.shortTwapValid)
      reasons.push("30-minute TWAP unavailable");
    if (!evidence.dexSafety.longTwapValid)
      reasons.push("four-hour TWAP unavailable");
    if (!evidence.dexSafety.timeWeightedLiquidityValid)
      reasons.push("time-weighted liquidity unavailable");
    if (!evidence.transferBehaviorValid)
      reasons.push("unsupported transfer behavior");
    if (!evidence.tokenStateClear)
      reasons.push("token pause or transition active");
    return { eligible: reasons.length === 0, reasons };
  }
  const marketCap = evidence.marketCapOrAumUsdWad
    ? BigInt(evidence.marketCapOrAumUsdWad)
    : 0n;
  const depth = evidence.executableDepthUsdWad
    ? BigInt(evidence.executableDepthUsdWad)
    : 0n;
  if (Date.parse(evidence.validUntil) <= now) reasons.push("evidence expired");
  if (
    !("qualificationHours" in evidence) ||
    evidence.qualificationHours < ASSET_POLICY.minimumQualificationHours
  ) {
    reasons.push("48 continuous qualification hours not complete");
  }
  if (
    (asset.kind === "stock" || asset.kind === "etf") &&
    (!("regularMarketSessions" in evidence) ||
      evidence.regularMarketSessions <
        ASSET_POLICY.minimumRegularMarketSessions)
  ) {
    reasons.push("two regular US market sessions not observed");
  }
  if (marketCap < ASSET_POLICY.minimumMarketCapOrAumUsdWad) {
    reasons.push("market cap or AUM below $100M");
  }
  if (depth < ASSET_POLICY.minimumExecutableDepthUsdWad) {
    reasons.push("two-sided executable depth below $250K");
  }
  if (
    evidence.buyImpactBps === null ||
    evidence.buyImpactBps > ASSET_POLICY.maximumProbeImpactBps ||
    evidence.sellImpactBps === null ||
    evidence.sellImpactBps > ASSET_POLICY.maximumProbeImpactBps
  ) {
    reasons.push("$25K probe exceeds 1% impact");
  }
  if (!evidence.identityValid) reasons.push("identity invalid");
  if (!evidence.oracleValid || !asset.valuationAdapter)
    reasons.push("valuation unavailable");
  if (!evidence.liquidityValid || !asset.executionAdapter)
    reasons.push("execution unavailable");
  if (!evidence.transferBehaviorValid) reasons.push("unsupported transfers");
  if (!evidence.corporateActionClear)
    reasons.push("corporate action or pause active");
  if (
    (asset.kind === "crypto" || asset.kind === "token") &&
    !asset.circulatingSupplyAdapter
  ) {
    reasons.push("verified circulating supply unavailable");
  }
  return { eligible: reasons.length === 0, reasons };
}

export function detailedAssetRanking<
  T extends {
    id: string;
    portfolio?: { weightBps?: number };
    execution?: { liquidityScoreBps?: number | null };
    coverageScoreBps?: number;
    diversificationScoreBps?: number;
    stabilityScoreBps?: number;
  },
>(assets: T[]) {
  return [...assets].sort((a, b) => {
    const heldA = (a.portfolio?.weightBps ?? 0) > 0 ? 1 : 0;
    const heldB = (b.portfolio?.weightBps ?? 0) > 0 ? 1 : 0;
    if (heldA !== heldB) return heldB - heldA;
    const score = (asset: T) =>
      (asset.execution?.liquidityScoreBps ?? 0) * 35 +
      (asset.coverageScoreBps ?? 0) * 25 +
      (asset.diversificationScoreBps ?? 0) * 20 +
      (asset.stabilityScoreBps ?? 0) * 20;
    return score(b) - score(a) || a.id.localeCompare(b.id);
  });
}

export function compileUniverseContext<T extends { id: string }>(
  compactDirectory: CompactAssetV1[],
  detailedAssets: T[],
) {
  const details = detailedAssetRanking(detailedAssets).slice(
    0,
    ASSET_POLICY.maximumDetailedAssets,
  );
  const payload = { compactDirectory, detailedAssets: details };
  const estimatedTokens = Math.ceil(stableDecisionJson(payload).length / 4);
  return {
    ...payload,
    estimatedTokens,
    holdRequired: estimatedTokens > ASSET_POLICY.maximumInputTokens,
    holdReason:
      estimatedTokens > ASSET_POLICY.maximumInputTokens
        ? "compact eligible-asset directory exceeds the 96K decision budget"
        : null,
  };
}

export function validateDynamicAllocation(
  value: unknown,
  assets: AssetRecordV1[],
  reserveId: string,
): DynamicAllocation {
  const { allocation, eligible, normalizedReserveId } =
    normalizeDynamicAllocation(value, assets, reserveId);
  let riskPositions = 0;
  let highVolatility = 0;
  for (const [id, weight] of Object.entries(allocation)) {
    if (id === normalizedReserveId) continue;
    if (weight > 0) riskPositions += 1;
    const asset = eligible.get(id)!;
    if (
      weight >
      Math.min(asset.maximumWeightBps, ASSET_POLICY.maximumAssetWeightBps)
    ) {
      throw new Error(`asset weight exceeds limit: ${id}`);
    }
    if (asset.riskClass === "high_volatility") highVolatility += weight;
  }
  if (
    allocation[normalizedReserveId] < ASSET_POLICY.minimumReserveWeightBps
  ) {
    throw new Error("reserve is below 20%");
  }
  if (riskPositions > ASSET_POLICY.maximumRiskPositions) {
    throw new Error("more than nine risk positions");
  }
  if (highVolatility > ASSET_POLICY.maximumHighVolatilityBps) {
    throw new Error("high-volatility allocation exceeds 30%");
  }
  return allocation;
}

function normalizeDynamicAllocation(
  value: unknown,
  assets: AssetRecordV1[],
  reserveId: string,
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("allocation is not an object");
  }
  const eligible = new Map(
    assets
      .filter((asset) => asset.active)
      .map((asset) => [normalizeAssetId(asset.id), asset] as const),
  );
  const normalizedReserveId = normalizeAssetId(reserveId);
  if (!eligible.has(normalizedReserveId))
    throw new Error("reserve is not active");
  const source = value as Record<string, unknown>;
  const normalizedSource = new Map<string, unknown>();
  for (const [key, weight] of Object.entries(source)) {
    let normalized: string;
    try {
      normalized = normalizeAssetId(key);
    } catch {
      throw new Error(`unknown or inactive asset: ${key}`);
    }
    if (normalizedSource.has(normalized)) {
      throw new Error(`duplicate asset: ${normalized}`);
    }
    if (!eligible.has(normalized)) {
      throw new Error(`unknown or inactive asset: ${key}`);
    }
    normalizedSource.set(normalized, weight);
  }
  const allocation = Object.fromEntries(
    [...eligible.keys()].map((id) => [
      id,
      Number(normalizedSource.get(id) ?? 0),
    ]),
  );
  let total = 0;
  for (const [id, weight] of Object.entries(allocation)) {
    if (!Number.isInteger(weight) || weight < 0) {
      throw new Error(`invalid integer weight: ${id}`);
    }
    total += weight;
  }
  if (total !== ASSET_POLICY.totalWeightBps)
    throw new Error("weights must total 10000");
  return { allocation, eligible, normalizedReserveId };
}

export function normalizeDynamicAllocationProposal(
  value: unknown,
  assets: AssetRecordV1[],
  reserveId: string,
): DynamicAllocation {
  return normalizeDynamicAllocation(value, assets, reserveId).allocation;
}

export function constrainDynamicAllocationProposal(
  value: unknown,
  assets: AssetRecordV1[],
  reserveId: string,
): DynamicAllocation {
  const { allocation, eligible, normalizedReserveId } =
    normalizeDynamicAllocation(value, assets, reserveId);
  const result = { ...allocation };
  const releaseToReserve = (id: string, amount: number) => {
    result[id] -= amount;
    result[normalizedReserveId] += amount;
  };
  const riskIds = [...eligible.keys()].filter(
    (id) => id !== normalizedReserveId,
  );

  for (const id of riskIds) {
    const maximum = Math.min(
      eligible.get(id)!.maximumWeightBps,
      ASSET_POLICY.maximumAssetWeightBps,
    );
    if (result[id] > maximum) releaseToReserve(id, result[id] - maximum);
  }

  const heldRiskIds = riskIds
    .filter((id) => result[id] > 0)
    .sort((a, b) => result[b] - result[a] || a.localeCompare(b));
  for (const id of heldRiskIds.slice(ASSET_POLICY.maximumRiskPositions)) {
    releaseToReserve(id, result[id]);
  }

  const highVolatilityIds = riskIds
    .filter(
      (id) =>
        eligible.get(id)!.riskClass === "high_volatility" && result[id] > 0,
    )
    .sort((a, b) => result[a] - result[b] || b.localeCompare(a));
  let highVolatility = highVolatilityIds.reduce(
    (sum, id) => sum + result[id],
    0,
  );
  for (const id of highVolatilityIds) {
    if (highVolatility <= ASSET_POLICY.maximumHighVolatilityBps) break;
    const reduction = Math.min(
      result[id],
      highVolatility - ASSET_POLICY.maximumHighVolatilityBps,
    );
    releaseToReserve(id, reduction);
    highVolatility -= reduction;
  }

  if (result[normalizedReserveId] < ASSET_POLICY.minimumReserveWeightBps) {
    let needed =
      ASSET_POLICY.minimumReserveWeightBps - result[normalizedReserveId];
    const reducible = riskIds
      .filter((id) => result[id] > 0)
      .sort((a, b) => result[b] - result[a] || a.localeCompare(b));
    for (const id of reducible) {
      const reduction = Math.min(result[id], needed);
      releaseToReserve(id, reduction);
      needed -= reduction;
      if (needed === 0) break;
    }
  }

  return validateDynamicAllocation(result, assets, normalizedReserveId);
}

export function validateAssetManifest(
  records: AssetRecordV1[],
  chainId: number,
) {
  const ids = new Set<string>();
  const addresses = new Set<string>();
  const uids = new Set<string>();
  for (const record of records) {
    if (record.chainId !== chainId) throw new Error("asset chain mismatch");
    if (record.id !== canonicalAssetId(chainId, record.address)) {
      throw new Error(`non-canonical asset id: ${record.symbol}`);
    }
    if (ids.has(record.id)) throw new Error("duplicate asset id");
    const address = record.address.toLowerCase();
    if (addresses.has(address)) throw new Error("duplicate asset address");
    if (record.robinhoodUid && uids.has(record.robinhoodUid)) {
      throw new Error("duplicate Robinhood UID");
    }
    ids.add(record.id);
    addresses.add(address);
    if (record.robinhoodUid) uids.add(record.robinhoodUid);
  }
  return records;
}
