import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const sourcePath =
  process.env.MDB_DEPLOYMENT_FLAT ??
  "packages/contracts/deployments/testnet-v3-flat.json";
const outputPath =
  process.env.MDB_DEPLOYMENT_OUTPUT ??
  "packages/contracts/deployments/testnet-v3.json";
const raw = JSON.parse(readFileSync(sourcePath, "utf8"));
if (
  raw.schemaVersion !== 3 ||
  raw.chainId !== 46630 ||
  raw.productionParityReplicas !== true ||
  raw.canonicalAssets !== false
) {
  throw new Error("not a chain-46630 V3 replica manifest");
}
const specs = [
  ["USDG", "Test Replica USDG", "usdg", "reserve", "reserve", 10_000],
  ["AAPL", "Test Replica Apple", "aapl", "stock", "standard", 2_000],
  ["NVDA", "Test Replica NVIDIA", "nvda", "stock", "standard", 2_000],
  ["MSFT", "Test Replica Microsoft", "msft", "stock", "standard", 2_000],
  ["AMZN", "Test Replica Amazon", "amzn", "stock", "standard", 2_000],
  ["GOOGL", "Test Replica Alphabet", "googl", "stock", "standard", 2_000],
  ["META", "Test Replica Meta", "meta", "stock", "standard", 2_000],
  ["TSLA", "Test Replica Tesla", "tsla", "stock", "high_volatility", 2_000],
  ["SPY", "Test Replica SPY ETF", "spy", "etf", "standard", 2_000],
  ["QQQ", "Test Replica QQQ ETF", "qqq", "etf", "standard", 2_000],
  ["SOXX", "Test Replica SOXX ETF", "soxx", "etf", "standard", 2_000],
  ["WETH", "Test Replica Wrapped Ether", "weth", "crypto", "high_volatility", 2_000],
];
const assets = specs.map(
  ([symbol, name, field, kind, riskClass, maximumWeightBps]) => {
    const address = raw[field];
    if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
      throw new Error(`missing address for ${symbol}`);
    }
    return {
      id: `${raw.chainId}:${address.toLowerCase()}`,
      symbol,
      name,
      address,
      kind,
      riskClass,
      decimals: 18,
      maximumWeightBps,
      robinhoodUid:
        kind === "reserve"
          ? null
          : `TEST-REPLICA-${symbol}`,
      canonicalSource:
        "https://api.robinhood.com/rhj/assets",
      replica: true,
    };
  },
);
const manifest = {
  schemaVersion: 3,
  environment: raw.environment,
  chainId: raw.chainId,
  productionParityReplicas: true,
  canonicalAssets: false,
  automaticFreshness: false,
  deployer: raw.deployer,
  quoteAuthorizer: raw.quoteAuthorizer,
  assets,
  contracts: {
    router: raw.router,
    oracle: raw.oracle,
    valuation: raw.oracle,
    assetRegistry: raw.assetRegistry,
    executionAdapter: raw.executionAdapter,
    rewards: raw.rewards,
    creatorVault: raw.creatorVault,
    brain: raw.brain,
    basket: raw.basket,
  },
  evidence: {
    sourceChainId: 4663,
    testnetChainId: 46630,
    qualification: "test-rehearsal-only",
    canonicalMainnetValidationRequired: true,
  },
};
manifest.manifestHash = createHash("sha256")
  .update(JSON.stringify(manifest))
  .digest("hex");
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(outputPath);
