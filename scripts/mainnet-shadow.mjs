import { createHash } from "node:crypto";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createPublicClient, http, isAddress, parseAbi } from "viem";

const CHAIN_ID = 4663;
const PUBLIC_RPC = "https://rpc.mainnet.chain.robinhood.com";
const ROBINHOOD_ASSETS = "https://api.robinhood.com/rhj/assets";
const ROBINHOOD_PRICE = "https://api.robinhood.com/rhj/prices";
const ZERO_EX_QUOTE = "https://api.0x.org/swap/allowance-holder/quote";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const repoRoot = resolve(import.meta.dirname, "..");
const statePath =
  process.env.MDB_MAINNET_SHADOW_STATE ??
  resolve(repoRoot, "var/mainnet-shadow/state.json");
const evidencePath =
  process.env.MDB_MAINNET_SHADOW_EVIDENCE ??
  resolve(repoRoot, "var/mainnet-shadow/daily-evidence.jsonl");
const rpcUrl = process.env.MDB_MAINNET_SHADOW_RPC_URL ?? PUBLIC_RPC;
const apiKey = process.env.ZEROX_API_KEY ?? "";
const taker = process.env.MDB_MAINNET_SHADOW_TAKER ?? "";

if (process.env.MDB_MAINNET_BROADCAST === "true") {
  throw new Error("mainnet shadow refuses broadcast mode");
}
if (process.env.MDB_OPERATOR_PRIVATE_KEY || process.env.PRIVATE_KEY) {
  throw new Error("mainnet shadow refuses transaction signing keys");
}

const client = createPublicClient({ transport: http(rpcUrl) });
const tokenAbi = parseAbi([
  "function decimals() view returns (uint8)",
  "function uid() view returns (bytes32)",
  "function oraclePaused() view returns (bool)",
]);

const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

async function json(url, init) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `${new URL(url).hostname} returned ${response.status}: ${text.slice(0, 240)}`,
    );
  }
  return JSON.parse(text);
}

async function inspectToken(asset) {
  const code = await client.getCode({ address: asset.address });
  const result = {
    ...asset,
    codePresent: Boolean(code && code !== "0x"),
    decimals: null,
    onchainUid: null,
    oraclePaused: null,
    errors: [],
  };
  if (!result.codePresent) {
    result.errors.push("no runtime code");
    return result;
  }
  try {
    result.decimals = Number(
      await client.readContract({
        address: asset.address,
        abi: tokenAbi,
        functionName: "decimals",
      }),
    );
  } catch {
    result.errors.push("decimals unavailable");
  }
  if (asset.uid) {
    try {
      result.onchainUid = await client.readContract({
        address: asset.address,
        abi: tokenAbi,
        functionName: "uid",
      });
      if (result.onchainUid.toLowerCase() !== asset.uid.toLowerCase()) {
        result.errors.push("uid mismatch");
      }
    } catch {
      result.errors.push("uid unavailable");
    }
    try {
      result.oraclePaused = await client.readContract({
        address: asset.address,
        abi: tokenAbi,
        functionName: "oraclePaused",
      });
      if (result.oraclePaused) result.errors.push("oracle paused");
    } catch {
      result.errors.push("oraclePaused unavailable");
    }
  }
  return result;
}

async function quotePair(asset, direction, priceUsd) {
  if (!apiKey) return { valid: false, reason: "ZEROX_API_KEY not configured" };
  if (!isAddress(taker)) {
    return { valid: false, reason: "MDB_MAINNET_SHADOW_TAKER not configured" };
  }
  const sellToken = direction === "buy" ? USDG : asset.address;
  const buyToken = direction === "buy" ? asset.address : USDG;
  const sellAmount =
    direction === "buy"
      ? 25_000n * 10n ** 18n
      : ((25_000n * 10n ** BigInt(asset.decimals ?? 18)) /
          BigInt(Math.max(1, Math.round(priceUsd * 1e6)))) *
        1_000_000n;
  const parameters = new URLSearchParams({
    chainId: String(CHAIN_ID),
    sellToken,
    buyToken,
    sellAmount: sellAmount.toString(),
    taker,
    slippageBps: "100",
  });
  try {
    const quote = await json(`${ZERO_EX_QUOTE}?${parameters}`, {
      headers: { "0x-api-key": apiKey, "0x-version": "v2" },
    });
    const target = quote.transaction?.to;
    const allowanceTarget =
      quote.issues?.allowance?.spender ?? quote.allowanceTarget ?? null;
    const valid =
      isAddress(target) &&
      isAddress(allowanceTarget) &&
      BigInt(quote.sellAmount ?? 0) === sellAmount &&
      BigInt(quote.buyAmount ?? 0) > 0n &&
      typeof quote.transaction?.data === "string" &&
      quote.transaction.data.startsWith("0x");
    return {
      valid,
      direction,
      sellAmount: quote.sellAmount ?? null,
      buyAmount: quote.buyAmount ?? null,
      blockNumber: quote.blockNumber ?? null,
      target: target ?? null,
      allowanceTarget,
      selector: quote.transaction?.data?.slice(0, 10) ?? null,
      simulationIncomplete: quote.issues?.simulationIncomplete ?? false,
      sourceHash: hash(quote),
      reason: valid ? null : "0x response failed structural validation",
    };
  } catch (error) {
    return {
      valid: false,
      direction,
      reason: error instanceof Error ? error.message : "0x quote failed",
    };
  }
}

async function parallelMap(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, async () => {
      while (cursor < items.length) {
        const index = cursor++;
        results[index] = await worker(items[index], index);
      }
    }),
  );
  return results;
}

const startedAt = new Date().toISOString();
const chainId = await client.getChainId();
if (chainId !== CHAIN_ID)
  throw new Error(`shadow RPC chain is ${chainId}, expected 4663`);
const registry = await json(ROBINHOOD_ASSETS);
const stockAssets = (registry.assets ?? [])
  .filter((asset) => asset.status === "ASSET_STATUS_ACTIVE")
  .map((asset) => {
    const deployment = asset.deployments?.find(
      (row) => row.chainId === CHAIN_ID,
    );
    if (!deployment || !isAddress(deployment.contractAddress)) return null;
    return {
      symbol: asset.tokenSymbol,
      name: asset.tokenName,
      address: deployment.contractAddress,
      uid: asset.id,
      currentMultiplier: asset.currentMultiplier,
      pendingMultiplier: asset.pendingMultiplier || null,
      pendingMultiplierEffectiveTime:
        asset.pendingMultiplierEffectiveTime ?? null,
      tradingCapabilities: asset.tradingCapabilities ?? null,
      source: ROBINHOOD_ASSETS,
    };
  })
  .filter(Boolean);

const canonicalAssets = [
  {
    symbol: "USDG",
    name: "Global Dollar",
    address: USDG,
    uid: null,
    currentMultiplier: "1",
    source: "https://docs.robinhood.com/chain/contracts/",
  },
  {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: WETH,
    uid: null,
    currentMultiplier: "1",
    source: "https://docs.robinhood.com/chain/contracts/",
  },
  ...stockAssets,
];
const inspected = await parallelMap(canonicalAssets, 6, inspectToken);
const nominated = new Set(
  (process.env.MDB_MAINNET_SHADOW_SYMBOLS ?? "AAPL,NVDA,MSFT,SPY,QQQ,SOXX,WETH")
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean),
);
const quoteEvidence = [];
for (const asset of inspected.filter(
  (candidate) => nominated.has(candidate.symbol) && candidate.symbol !== "USDG",
)) {
  let priceUsd = null;
  if (asset.symbol === "WETH") {
    priceUsd = Number(process.env.MDB_SHADOW_WETH_REFERENCE_PRICE ?? "0");
  } else {
    try {
      const price = await json(`${ROBINHOOD_PRICE}/${asset.symbol}`);
      const row = price.quotes?.[0];
      const midpoint = (Number(row?.bid) + Number(row?.ask)) / 2;
      priceUsd = midpoint * Number(asset.currentMultiplier);
    } catch {
      priceUsd = null;
    }
  }
  if (!priceUsd || priceUsd <= 0) {
    quoteEvidence.push({
      symbol: asset.symbol,
      buy: { valid: false, reason: "official token price unavailable" },
      sell: { valid: false, reason: "official token price unavailable" },
    });
    continue;
  }
  quoteEvidence.push({
    symbol: asset.symbol,
    buy: await quotePair(asset, "buy", priceUsd),
    sell: await quotePair(asset, "sell", priceUsd),
  });
}

const result = {
  schemaVersion: 1,
  mode: "robinhood-mainnet-shadow",
  startedAt,
  completedAt: new Date().toISOString(),
  chainId,
  rpc: rpcUrl === PUBLIC_RPC ? "public-rate-limited" : "configured-provider",
  broadcastPermitted: false,
  officialRegistry: ROBINHOOD_ASSETS,
  canonicalAssetCount: inspected.length,
  assets: inspected,
  quoteEvidence,
  gates: {
    noSigningKey: true,
    canonicalIdentityChecked: inspected.every(
      (asset) =>
        asset.codePresent &&
        (!asset.uid ||
          asset.onchainUid?.toLowerCase() === asset.uid.toLowerCase()),
    ),
    zeroExConfigured: Boolean(apiKey),
    twoSidedQuotesValid:
      quoteEvidence.length > 0 &&
      quoteEvidence.every((row) => row.buy.valid && row.sell.valid),
    chainlinkMappingsConfigured: false,
    thirtyDailyPasses: false,
  },
};
result.sourceHash = hash(result);
mkdirSync(dirname(statePath), { recursive: true });
writeFileSync(statePath, `${JSON.stringify(result, null, 2)}\n`, {
  mode: 0o640,
});
appendFileSync(
  evidencePath,
  `${JSON.stringify({
    at: result.completedAt,
    sourceHash: result.sourceHash,
    gates: result.gates,
    canonicalAssetCount: result.canonicalAssetCount,
  })}\n`,
  { mode: 0o640 },
);
console.log(
  JSON.stringify({
    statePath,
    sourceHash: result.sourceHash,
    gates: result.gates,
  }),
);
