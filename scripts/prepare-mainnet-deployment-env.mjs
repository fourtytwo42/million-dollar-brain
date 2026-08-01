import { readFileSync } from "node:fs";

const candidate = JSON.parse(readFileSync(process.argv[2], "utf8"));
if (candidate.manifestSchemaVersion !== 5 || candidate.chainId !== 4663) {
  throw new Error("mainnet candidate schema V5 is required");
}
if (
  candidate.broadcastPermitted !== false ||
  JSON.stringify(candidate.activatedSymbols) !== JSON.stringify(["USDG"])
) {
  throw new Error("candidate is not a paused deployment candidate");
}
const assets = candidate.preliminarySymbols.map((symbol) => {
  const asset = candidate.assets.find((row) => row.symbol === symbol);
  const policy = candidate.assetPolicy[symbol];
  const venue = candidate.venueMappings[symbol];
  const progress = candidate.qualificationProgress[symbol];
  if (!asset || !policy || !venue || !progress || !venue.directPool) {
    throw new Error(`incomplete preliminary asset ${symbol}`);
  }
  return { symbol, asset, policy, venue, progress };
});
if (assets.length < 4 || assets.length > 9) {
  throw new Error("paused deployment requires four to nine preliminary assets");
}
const enumValue = (value, kind) => {
  const values =
    kind === "asset"
      ? { STOCK: 1, ETF: 2, CRYPTO: 3, TOKEN: 4 }
      : { STANDARD: 1, HIGH_VOLATILITY: 2 };
  if (!values[value]) throw new Error(`unsupported ${kind} enum ${value}`);
  return values[value];
};
const csv = (values) => values.join(",");
const shell = (name, value) =>
  `export ${name}=${JSON.stringify(String(value))}`;
const lines = [
  shell("MDB_MAINNET_RISK_ASSETS", csv(assets.map((row) => row.asset.address))),
  shell(
    "MDB_MAINNET_ASSET_IDS",
    csv(assets.map((row) => row.asset.registryAssetId)),
  ),
  shell(
    "MDB_MAINNET_ASSET_KINDS",
    csv(assets.map((row) => enumValue(row.policy.kind, "asset"))),
  ),
  shell(
    "MDB_MAINNET_RISK_CLASSES",
    csv(assets.map((row) => enumValue(row.policy.riskClass, "risk"))),
  ),
  shell(
    "MDB_MAINNET_MAX_WEIGHTS_BPS",
    csv(assets.map((row) => row.policy.maximumWeightBps)),
  ),
  shell(
    "MDB_MAINNET_SAFE_CAPACITY_USD_WAD",
    csv(assets.map((row) => row.policy.safeTwoSidedCapacityUsdWad)),
  ),
  shell(
    "MDB_MAINNET_QUALIFICATION_HOURS",
    csv(assets.map((row) => row.progress.qualificationHours)),
  ),
  shell(
    "MDB_MAINNET_MARKET_SESSIONS",
    csv(assets.map((row) => row.progress.regularMarketSessions)),
  ),
  shell(
    "MDB_MAINNET_QUALIFICATION_HASHES",
    csv(assets.map((row) => `0x${row.progress.evidenceHash}`)),
  ),
  shell(
    "MDB_MAINNET_DIRECT_POOLS",
    csv(assets.map((row) => row.venue.directPool)),
  ),
  shell(
    "MDB_MAINNET_BRIDGE_POOLS",
    csv(
      assets.map(
        (row) =>
          row.venue.bridgePool ?? "0x0000000000000000000000000000000000000000",
      ),
    ),
  ),
  shell(
    "MDB_MAINNET_MIN_DIRECT_LIQUIDITY",
    csv(assets.map((row) => row.venue.minimumDirectLiquidity)),
  ),
  shell(
    "MDB_MAINNET_MIN_BRIDGE_LIQUIDITY",
    csv(assets.map((row) => row.venue.minimumBridgeLiquidity)),
  ),
  shell("MDB_UNISWAP_FACTORY", assets[0].venue.factory),
  shell("MDB_UNISWAP_ROUTER", assets[0].venue.router),
];
process.stdout.write(`${lines.join("\n")}\n`);
