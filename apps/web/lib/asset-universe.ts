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
  qualification: AssetQualificationV1 | AssetQualificationWindowV2 | null;
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
};

export type DynamicAllocation = Record<string, number>;

export type DynamicOracleState = {
  fresh: boolean;
  chainTimestamp?: number;
  assets: Record<
    string,
    { priceUsdWad: string; updatedAt: number; valid: boolean }
  >;
};

export const ASSET_POLICY = {
  minimumMarketCapOrAumUsdWad: 100_000_000n * 10n ** 18n,
  minimumExecutableDepthUsdWad: 250_000n * 10n ** 18n,
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
      Math.max(0, nowSeconds - observation.updatedAt) > 120
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
  evidence: AssetQualificationV1 | AssetQualificationWindowV2 | null,
  now = Date.now(),
) {
  const reasons: string[] = [];
  if (!evidence) return { eligible: false, reasons: ["missing evidence"] };
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
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("allocation is not an object");
  }
  const eligible = new Map(
    assets
      .filter((asset) => asset.active)
      .map((asset) => [asset.id, asset] as const),
  );
  if (!eligible.has(reserveId)) throw new Error("reserve is not active");
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
  let riskPositions = 0;
  let highVolatility = 0;
  for (const [id, weight] of Object.entries(allocation)) {
    if (!Number.isInteger(weight) || weight < 0) {
      throw new Error(`invalid integer weight: ${id}`);
    }
    total += weight;
    if (id === reserveId) continue;
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
  if (total !== ASSET_POLICY.totalWeightBps)
    throw new Error("weights must total 10000");
  if (allocation[reserveId] < ASSET_POLICY.minimumReserveWeightBps) {
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
