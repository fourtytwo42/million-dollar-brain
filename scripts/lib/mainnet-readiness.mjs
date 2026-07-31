export const MAINNET_PRIORITY_SYMBOLS = Object.freeze([
  "WETH",
  "NVDA",
  "GME",
  "SPY",
  "SPCX",
  "VIRTUAL",
]);
export const MAINNET_WATCHLIST_SYMBOLS = Object.freeze(["WBTC", "USDE"]);
// Compatibility aliases for archived V4 evidence readers. They no longer define readiness.
export const MAINNET_CORE_SYMBOLS = MAINNET_PRIORITY_SYMBOLS;
export const MAINNET_OPTIONAL_SYMBOLS = MAINNET_WATCHLIST_SYMBOLS;
export const MAINNET_NOMINATED_SYMBOLS = Object.freeze([
  ...MAINNET_PRIORITY_SYMBOLS,
  ...MAINNET_WATCHLIST_SYMBOLS,
]);
export const MAINNET_TVL_CAP_USD_WAD = 60_000n * 10n ** 18n;
export const CAPACITY_PROBES_USD = Object.freeze([
  1_000, 5_000, 10_000, 25_000, 100_000, 250_000,
]);

export function summarizeMainnetReadiness(qualification) {
  const ranked = qualification
    .filter((asset) => asset.qualificationWindowPassed === true)
    .sort((left, right) => {
      const capacity =
        Number(right.safeTwoSidedCapacityUsdWad ?? 0) -
        Number(left.safeTwoSidedCapacityUsdWad ?? 0);
      return (
        capacity ||
        Number(right.routeMaturityScoreBps ?? 0) -
          Number(left.routeMaturityScoreBps ?? 0) ||
        String(left.assetId ?? left.symbol).localeCompare(
          String(right.assetId ?? right.symbol),
        )
      );
    });
  const capacityWeight = (asset) => {
    const capacity = BigInt(asset.safeTwoSidedCapacityUsdWad ?? 0);
    const exposure = capacity / 2n;
    const capacityBps = Number((exposure * 10_000n) / MAINNET_TVL_CAP_USD_WAD);
    return Math.min(
      2_000,
      Number(asset.maximumWeightBps ?? 2_000),
      capacityBps,
    );
  };
  const standards = ranked.filter(
    (asset) => asset.riskClass !== "high_volatility",
  );
  const highVolatility = ranked.filter(
    (asset) => asset.riskClass === "high_volatility",
  );
  let qualified = [];
  let bestCapacityBps = -1;
  for (
    let highCount = 0;
    highCount <= Math.min(9, highVolatility.length);
    highCount += 1
  ) {
    const candidate = [
      ...highVolatility.slice(0, highCount),
      ...standards.slice(0, 9 - highCount),
    ];
    const standardBps = candidate
      .filter((asset) => asset.riskClass !== "high_volatility")
      .reduce((sum, asset) => sum + capacityWeight(asset), 0);
    const highBps = Math.min(
      3_000,
      candidate
        .filter((asset) => asset.riskClass === "high_volatility")
        .reduce((sum, asset) => sum + capacityWeight(asset), 0),
    );
    const usableBps = standardBps + highBps;
    if (usableBps > bestCapacityBps) {
      bestCapacityBps = usableBps;
      qualified = candidate;
    }
  }
  const rank = new Map(ranked.map((asset, index) => [asset.assetId, index]));
  qualified.sort(
    (left, right) =>
      (rank.get(left.assetId) ?? Number.MAX_SAFE_INTEGER) -
      (rank.get(right.assetId) ?? Number.MAX_SAFE_INTEGER),
  );
  const standardCapacityBps = qualified
    .filter((asset) => asset.riskClass !== "high_volatility")
    .reduce((sum, asset) => sum + capacityWeight(asset), 0);
  const highVolatilityCapacityBps = Math.min(
    3_000,
    qualified
      .filter((asset) => asset.riskClass === "high_volatility")
      .reduce((sum, asset) => sum + capacityWeight(asset), 0),
  );
  const aggregateRiskCapacityBps = Math.min(
    8_000,
    standardCapacityBps + highVolatilityCapacityBps,
  );
  const wethIdentityPassed = qualification.some(
    (asset) => asset.symbol === "WETH" && asset.identityValid !== false,
  );
  const missingRequirements = [];
  if (!wethIdentityPassed) missingRequirements.push("canonical WETH identity");
  if (ranked.length < 4)
    missingRequirements.push("at least four qualified risk assets");
  if (aggregateRiskCapacityBps < 8_000)
    missingRequirements.push("80% aggregate risk capacity");
  return {
    schemaVersion: 2,
    prioritySymbols: [...MAINNET_PRIORITY_SYMBOLS],
    watchlistSymbols: [...MAINNET_WATCHLIST_SYMBOLS],
    includedSymbols: qualified.map((asset) => asset.symbol),
    includedAssetIds: qualified.map((asset) => asset.assetId),
    qualifiedRiskAssetCount: ranked.length,
    standardCapacityBps,
    highVolatilityCapacityBps,
    aggregateRiskCapacityBps,
    initialTvlCapUsdWad: MAINNET_TVL_CAP_USD_WAD.toString(),
    missingRequirements,
    coreQualificationPassed: missingRequirements.length === 0,
  };
}
