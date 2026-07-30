import { readFileSync, writeFileSync } from "node:fs";

const [basePath, dexPath, outputPath, chainIdRaw, environment] =
  process.argv.slice(2);

if (!basePath || !dexPath || !outputPath || !chainIdRaw || !environment) {
  throw new Error(
    "usage: node merge-dex-manifest.mjs <base> <dex> <output> <chainId> <environment>",
  );
}

const base = JSON.parse(readFileSync(basePath, "utf8"));
const dex = JSON.parse(readFileSync(dexPath, "utf8"));
const chainId = Number(chainIdRaw);

const id = (address) => `${chainId}:${address.toLowerCase()}`;
const localAssets = [
  {
    id: id(base.usdg),
    symbol: "USDG",
    name: "Global Dollar",
    address: base.usdg,
    kind: "reserve",
    riskClass: "reserve",
    decimals: 18,
    maximumWeightBps: 10_000,
    robinhoodUid: null,
    controlId: 1,
    tags: ["reserve"],
  },
  {
    id: id(base.aapl),
    symbol: "AAPL",
    name: "Apple",
    address: base.aapl,
    kind: "stock",
    riskClass: "standard",
    decimals: 18,
    maximumWeightBps: 5_000,
    robinhoodUid: null,
    controlId: 2,
    tags: ["technology"],
  },
  {
    id: id(base.nvda),
    symbol: "NVDA",
    name: "NVIDIA",
    address: base.nvda,
    kind: "stock",
    riskClass: "standard",
    decimals: 18,
    maximumWeightBps: 5_000,
    robinhoodUid: null,
    controlId: 3,
    tags: ["technology", "ai_semiconductor"],
  },
  {
    id: id(base.ethx),
    symbol: "ETHX",
    name: "Ether",
    address: base.ethx,
    kind: "crypto",
    riskClass: "high_volatility",
    decimals: 18,
    maximumWeightBps: 5_000,
    robinhoodUid: null,
    controlId: 12,
    tags: ["crypto_major"],
  },
];

const assets = base.assets?.length ? base.assets : localAssets;
const reserve = assets.find((asset) => asset.kind === "reserve");
const riskAssets = assets.filter((asset) => asset.kind !== "reserve");
if (!reserve || riskAssets.length !== dex.pools.length) {
  throw new Error(
    `DEX pool count ${dex.pools.length} does not match risk asset count ${riskAssets.length}`,
  );
}

const poolAssets =
  dex.poolAssets?.map((address) => address.toLowerCase()) ??
  riskAssets.map((asset) => asset.address.toLowerCase());
if (new Set(poolAssets).size !== riskAssets.length) {
  throw new Error("DEX pool assets must be present exactly once");
}

const pools = dex.pools.map((poolAddress, index) => {
  const asset = riskAssets.find(
    (candidate) => candidate.address.toLowerCase() === poolAssets[index],
  );
  if (!asset) {
    throw new Error(
      `DEX pool asset ${poolAssets[index]} is not in the manifest`,
    );
  }
  const addresses = [reserve.address, asset.address].sort((left, right) =>
    left.toLowerCase().localeCompare(right.toLowerCase()),
  );
  return {
    address: poolAddress,
    token0: addresses[0],
    token1: addresses[1],
    fee: 3_000,
    approved: true,
  };
});

const contracts = {
  ...(base.contracts ?? {}),
  router: base.contracts?.router ?? base.router,
  oracle: base.contracts?.oracle ?? base.oracle,
  valuation: dex.valuation,
  dexExecutionAdapter: dex.execution,
  dexExecutionImplementation: dex.executionImplementation,
  dexValuationAdapter: dex.valuation,
  dexValuationImplementation: dex.valuationImplementation,
  assetRegistry: base.contracts?.assetRegistry ?? base.assetRegistry,
  brainControlRegistry:
    base.contracts?.brainControlRegistry ?? base.brainControlRegistry,
  rewards: base.contracts?.rewards ?? base.rewards,
  creatorVault: base.contracts?.creatorVault ?? base.creatorVault,
  brain: base.contracts?.brain ?? base.brain,
  basket: base.contracts?.basket ?? base.basket,
  basketImplementation: dex.basketImplementation,
};
delete contracts.quoteAuthorizer;
delete contracts.zeroExExecutionAdapter;

const merged = {
  ...base,
  schemaVersion: 4,
  environment,
  chainId,
  assets,
  contracts,
  dexExecutionAdapter: dex.execution,
  dexValuationAdapter: dex.valuation,
  executionMode: "uniswap-v3-structured",
  legacyPlanExecutionDisabled: true,
  dexVenue: {
    venue: "uniswap-v3",
    factory: dex.factory,
    router: dex.router,
    quoter: dex.quoter,
    weth: dex.weth,
    feeTiers: [3_000],
    twapWindowSeconds: 1_800,
    quoteLifetimeSeconds: 30,
    maximumReferenceBlockAge: 3,
    circuitBreaker: contracts.oracle,
    pools,
  },
};
delete merged.quoteAuthorizer;
delete merged.zeroExExecutionAdapter;

writeFileSync(outputPath, `${JSON.stringify(merged, null, 2)}\n`);
