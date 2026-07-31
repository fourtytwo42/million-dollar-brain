export type DepositCapacityAsset = {
  symbol: string;
  active: boolean;
  maximumWeightBps: number;
  maximumExposureUsdWad: bigint;
  currentExposureUsdWad: bigint;
  currentWeightBps: number;
};

export type RiskWitnessAsset = {
  address: `0x${string}`;
  id: string;
  active: boolean;
  qualified: boolean;
  creatorApproved: boolean;
  riskClass: string;
  maximumWeightBps: number;
  maximumExposureUsdWad: bigint;
};

const BPS = 10_000n;
const MAX_ASSET_WEIGHT_BPS = 2_000;
const ENTRY_NET_BPS = 9_900n;
const WALLET_LIMIT_USD_WAD = 25_000n * 10n ** 18n;

export function maximumSupportedDeposit({
  navUsdWad,
  tvlCapUsdWad,
  walletValueUsdWad,
  assets,
}: {
  navUsdWad: bigint;
  tvlCapUsdWad: bigint;
  walletValueUsdWad: bigint | null;
  assets: DepositCapacityAsset[];
}) {
  const globalNetHeadroom =
    navUsdWad >= tvlCapUsdWad ? 0n : tvlCapUsdWad - navUsdWad;
  let maximumDepositUsdWad = (globalNetHeadroom * BPS) / ENTRY_NET_BPS;
  let limitingConstraint = "global basket limit";
  for (const asset of assets.filter((item) => item.active)) {
    const weightBps = BigInt(asset.currentWeightBps);
    if (weightBps === 0n) continue;
    const weightCap =
      (tvlCapUsdWad *
        BigInt(Math.min(asset.maximumWeightBps, MAX_ASSET_WEIGHT_BPS))) /
      BPS;
    const effectiveCap =
      asset.maximumExposureUsdWad < weightCap
        ? asset.maximumExposureUsdWad
        : weightCap;
    const headroom =
      asset.currentExposureUsdWad >= effectiveCap
        ? 0n
        : effectiveCap - asset.currentExposureUsdWad;
    const supportedNet = (headroom * BPS) / weightBps;
    const supportedGross = (supportedNet * BPS) / ENTRY_NET_BPS;
    if (supportedGross < maximumDepositUsdWad) {
      maximumDepositUsdWad = supportedGross;
      limitingConstraint = `${asset.symbol} effective exposure limit`;
    }
  }
  if (walletValueUsdWad != null) {
    const walletRemaining =
      walletValueUsdWad >= WALLET_LIMIT_USD_WAD
        ? 0n
        : WALLET_LIMIT_USD_WAD - walletValueUsdWad;
    const walletGross = (walletRemaining * BPS) / ENTRY_NET_BPS;
    if (walletGross < maximumDepositUsdWad) {
      maximumDepositUsdWad = walletGross;
      limitingConstraint = "per-wallet basket limit";
    }
  }
  return { maximumDepositUsdWad, limitingConstraint };
}

export function buildRiskCapacityWitness(
  assets: RiskWitnessAsset[],
  proposedTvlCapUsdWad: bigint,
) {
  const contribution = (asset: RiskWitnessAsset) => {
    const configuredWeight = BigInt(
      Math.min(MAX_ASSET_WEIGHT_BPS, asset.maximumWeightBps),
    );
    const weightCap = (proposedTvlCapUsdWad * configuredWeight) / BPS;
    return asset.maximumExposureUsdWad < weightCap
      ? asset.maximumExposureUsdWad
      : weightCap;
  };
  const ranked = assets
    .filter((asset) => asset.active && asset.qualified && asset.creatorApproved)
    .sort((left, right) => {
      const capacity = contribution(right) - contribution(left);
      return capacity === 0n
        ? left.id.localeCompare(right.id)
        : capacity > 0n
          ? 1
          : -1;
    });
  const standards = ranked.filter(
    (asset) => asset.riskClass !== "high_volatility",
  );
  const highVolatility = ranked.filter(
    (asset) => asset.riskClass === "high_volatility",
  );
  let best: RiskWitnessAsset[] = [];
  let bestCapacity = -1n;
  for (
    let highCount = 0;
    highCount <= Math.min(9, highVolatility.length);
    highCount += 1
  ) {
    const candidate = [
      ...highVolatility.slice(0, highCount),
      ...standards.slice(0, 9 - highCount),
    ];
    const standardCapacity = candidate
      .filter((asset) => asset.riskClass !== "high_volatility")
      .reduce((sum, asset) => sum + contribution(asset), 0n);
    let highCapacity = candidate
      .filter((asset) => asset.riskClass === "high_volatility")
      .reduce((sum, asset) => sum + contribution(asset), 0n);
    const highLimit = (proposedTvlCapUsdWad * 3_000n) / BPS;
    if (highCapacity > highLimit) highCapacity = highLimit;
    if (standardCapacity + highCapacity > bestCapacity) {
      best = candidate;
      bestCapacity = standardCapacity + highCapacity;
    }
  }
  const required = (proposedTvlCapUsdWad * 8_000n) / BPS;
  return {
    witness: best.map((asset) => asset.address),
    supportedRiskCapacityUsdWad: bestCapacity < 0n ? 0n : bestCapacity,
    valid: best.length >= 4 && bestCapacity >= required,
  };
}
