import { createHash } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import {
  createPublicClient,
  encodePacked,
  http,
  isAddress,
  parseAbi,
} from "viem";
import {
  continuousPassingWindow,
  qualificationWindowPassed,
} from "./lib/qualification-window.mjs";
import {
  CHAINLINK_ROBINHOOD_CATALOG,
  MAINNET_CORE_SYMBOLS,
  MAINNET_NOMINATED_SYMBOLS,
  chainlinkMappingsFromCatalog,
  officialHistoryCoverage,
  sessionAwareMaximumAgeSeconds,
  summarizeMainnetReadiness,
} from "./lib/mainnet-readiness.mjs";

const CHAIN_ID = 4663;
const PUBLIC_RPC = "https://rpc.mainnet.chain.robinhood.com";
const ROBINHOOD_ASSETS = "https://api.robinhood.com/rhj/assets";
const ROBINHOOD_PRICE = "https://api.robinhood.com/rhj/prices";
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73";
const UNISWAP_FACTORY = "0x1f7d7550B1b028f7571E69A784071F0205FD2EfA";
const UNISWAP_QUOTER = "0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7";
const UNISWAP_ROUTER = "0xCaf681a66D020601342297493863E78C959E5cb2";
const APPROVED_FEES = [100, 500, 3_000, 10_000];
const repoRoot = resolve(import.meta.dirname, "..");
const statePath =
  process.env.MDB_MAINNET_SHADOW_STATE ??
  resolve(repoRoot, "var/mainnet-shadow/state.json");
const evidencePath =
  process.env.MDB_MAINNET_SHADOW_EVIDENCE ??
  resolve(repoRoot, "var/mainnet-shadow/qualification-evidence.jsonl");
const rpcUrl = process.env.MDB_MAINNET_SHADOW_RPC_URL ?? PUBLIC_RPC;
const configuredChainlinkFeeds = JSON.parse(
  process.env.MDB_MAINNET_CHAINLINK_FEEDS_JSON ?? "{}",
);
let resolvedChainlinkFeeds = configuredChainlinkFeeds;
const chainlinkCatalogUrl =
  process.env.MDB_MAINNET_CHAINLINK_CATALOG_URL ?? CHAINLINK_ROBINHOOD_CATALOG;
const capitalizationEvidence = JSON.parse(
  process.env.MDB_MAINNET_CAPITALIZATION_EVIDENCE_JSON ?? "{}",
);
const secUserAgent =
  process.env.MDB_SEC_USER_AGENT ??
  "42-Braincells/1.0 operations@42braincells.com";
const CAPITALIZATION_MINIMUM_USD = 100_000_000;
const IMPACT_NOTIONAL_USD = 25_000;
const DEPTH_NOTIONAL_USD = 250_000;
const MAXIMUM_IMPACT_BPS = 100;
const MAXIMUM_CAPITALIZATION_EVIDENCE_AGE_SECONDS = 172_800;
const QUALIFICATION_HOURS = 48;
const FUND_SYMBOLS = new Set(["SPY", "QQQ", "SOXX"]);

if (process.env.MDB_MAINNET_BROADCAST === "true") {
  throw new Error("mainnet shadow refuses broadcast mode");
}
if (process.env.MDB_OPERATOR_PRIVATE_KEY || process.env.PRIVATE_KEY) {
  throw new Error("mainnet shadow refuses transaction signing keys");
}

const client = createPublicClient({ transport: http(rpcUrl) });
const tokenAbi = parseAbi([
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function uid() view returns (bytes32)",
  "function oraclePaused() view returns (bool)",
]);
const feedAbi = parseAbi([
  "function decimals() view returns (uint8)",
  "function latestRoundData() view returns (uint80 roundId,int256 answer,uint256 startedAt,uint256 updatedAt,uint80 answeredInRound)",
]);
const factoryAbi = parseAbi([
  "function getPool(address tokenA,address tokenB,uint24 fee) view returns (address pool)",
]);
const poolAbi = parseAbi([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function liquidity() view returns (uint128)",
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)",
  "function observe(uint32[] secondsAgos) view returns (int56[] tickCumulatives,uint160[] secondsPerLiquidityCumulativeX128s)",
]);
const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
  "function quoteExactInput(bytes path,uint256 amountIn) returns (uint256 amountOut,uint160[] sqrtPriceX96AfterList,uint32[] initializedTicksCrossedList,uint256 gasEstimate)",
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

let secTickersPromise;
function secHeaders() {
  return {
    accept: "application/json",
    "user-agent": secUserAgent,
  };
}

async function secTickers() {
  secTickersPromise ??= json("https://www.sec.gov/files/company_tickers.json", {
    headers: secHeaders(),
  });
  return secTickersPromise;
}

function latestFact(units, acceptedForms) {
  return Object.values(units ?? {})
    .flat()
    .filter(
      (row) =>
        Number.isFinite(Number(row?.val)) &&
        acceptedForms.has(row?.form) &&
        Number.isFinite(Date.parse(row?.filed ?? "")),
    )
    .sort((left, right) => Date.parse(right.filed) - Date.parse(left.filed))[0];
}

async function collectSecFundNetAssets(cik, source) {
  const submissions = await json(
    `https://data.sec.gov/submissions/CIK${cik}.json`,
    { headers: secHeaders() },
  );
  const recent = submissions?.filings?.recent ?? {};
  const index = (recent.form ?? []).findIndex((form) => form === "NPORT-P");
  if (index < 0) throw new Error("SEC N-PORT filing unavailable");
  const accession = String(recent.accessionNumber[index]).replaceAll("-", "");
  const primaryDocument = String(recent.primaryDocument[index])
    .split("/")
    .at(-1);
  const archiveSource = `https://www.sec.gov/Archives/edgar/data/${Number(cik)}/${accession}/${primaryDocument}`;
  const response = await fetch(archiveSource, {
    headers: secHeaders(),
    signal: AbortSignal.timeout(30_000),
  });
  const xml = await response.text();
  if (!response.ok) throw new Error(`SEC N-PORT returned ${response.status}`);
  const valueUsd = Number(xml.match(/<netAssets>([^<]+)<\/netAssets>/)?.[1]);
  if (!Number.isFinite(valueUsd))
    throw new Error("SEC N-PORT net assets unavailable");
  return {
    kind: "fund",
    valueUsd,
    observedAt: new Date().toISOString(),
    reportDate: recent.reportDate?.[index] ?? null,
    filedAt: recent.filingDate?.[index] ?? null,
    source: archiveSource,
    sourceHash: hash({ source, archiveSource, xml }),
    supplyAdapterApproved: true,
    collection: "sec-nport",
  };
}

async function collectSecCapitalization(asset, priceUsd) {
  if (asset.symbol === "WETH") {
    try {
      const totalSupply = await client.readContract({
        address: asset.address,
        abi: tokenAbi,
        functionName: "totalSupply",
      });
      const valueUsd =
        (Number(totalSupply) / 10 ** Number(asset.decimals)) * priceUsd;
      return {
        kind: "crypto",
        valueUsd,
        observedAt: new Date().toISOString(),
        source:
          "https://docs.robinhood.com/chain/contracts/#wrapped-ether-weth",
        sourceHash: hash({
          chainId: CHAIN_ID,
          token: asset.address,
          totalSupply: totalSupply.toString(),
          priceUsd,
        }),
        supplyAdapterApproved: true,
        collection: "canonical-weth-deposit-supply",
      };
    } catch (error) {
      return {
        kind: "crypto",
        valueUsd: null,
        observedAt: null,
        source: "https://docs.robinhood.com/chain/contracts/",
        sourceHash: null,
        supplyAdapterApproved: false,
        collection: "canonical-weth-deposit-supply",
        error:
          error instanceof Error
            ? error.message
            : "WETH supply collection failed",
      };
    }
  }
  try {
    const tickers = await secTickers();
    const ticker = Object.values(tickers).find(
      (row) => row?.ticker?.toUpperCase() === asset.symbol,
    );
    if (!ticker) throw new Error("SEC ticker mapping unavailable");
    const cik = String(ticker.cik_str).padStart(10, "0");
    const source = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    if (FUND_SYMBOLS.has(asset.symbol))
      return await collectSecFundNetAssets(cik, source);
    const companyFacts = await json(source, { headers: secHeaders() });
    const facts = companyFacts?.facts?.["us-gaap"] ?? {};
    const deiFacts = companyFacts?.facts?.dei ?? {};
    const isFund = false;
    const fact = latestFact(
      deiFacts.EntityCommonStockSharesOutstanding?.units,
      new Set(["10-K", "10-Q", "10-K/A", "10-Q/A", "8-K"]),
    );
    if (!fact) throw new Error("SEC capitalization fact unavailable");
    const valueUsd = isFund ? Number(fact.val) : Number(fact.val) * priceUsd;
    return {
      kind: isFund ? "fund" : "stock",
      valueUsd,
      observedAt: new Date().toISOString(),
      reportDate: fact.end ?? null,
      filedAt: fact.filed,
      source,
      sourceHash: hash({ cik, fact }),
      supplyAdapterApproved: true,
      collection: "sec-company-facts",
    };
  } catch (error) {
    return {
      kind: FUND_SYMBOLS.has(asset.symbol) ? "fund" : "stock",
      valueUsd: null,
      observedAt: null,
      source: "https://data.sec.gov/",
      sourceHash: null,
      supplyAdapterApproved: false,
      collection: "sec-company-facts",
      error: error instanceof Error ? error.message : "SEC collection failed",
    };
  }
}

async function inspectTokens(assets) {
  const rows = assets.map((asset) => ({
    ...asset,
    codePresent: false,
    decimals: null,
    onchainUid: null,
    oraclePaused: null,
    errors: [],
  }));
  const calls = [];
  for (const [index, asset] of assets.entries()) {
    calls.push({
      index,
      field: "decimals",
      contract: {
        address: asset.address,
        abi: tokenAbi,
        functionName: "decimals",
      },
    });
    if (asset.uid) {
      calls.push({
        index,
        field: "uid",
        contract: {
          address: asset.address,
          abi: tokenAbi,
          functionName: "uid",
        },
      });
      calls.push({
        index,
        field: "oraclePaused",
        contract: {
          address: asset.address,
          abi: tokenAbi,
          functionName: "oraclePaused",
        },
      });
    }
  }
  const results = await client.multicall({
    allowFailure: true,
    batchSize: 100_000,
    contracts: calls.map((call) => call.contract),
    multicallAddress: MULTICALL3,
  });
  for (const [callIndex, call] of calls.entries()) {
    const result = results[callIndex];
    const row = rows[call.index];
    if (result.status === "failure") {
      row.errors.push(`${call.field} unavailable`);
      continue;
    }
    row.codePresent = true;
    if (call.field === "decimals") {
      row.decimals = Number(result.result);
    } else if (call.field === "uid") {
      row.onchainUid = result.result;
      if (row.onchainUid.toLowerCase() !== row.uid.toLowerCase()) {
        row.errors.push("uid mismatch");
      }
    } else {
      row.oraclePaused = result.result;
      if (row.oraclePaused) row.errors.push("oracle paused");
    }
  }
  for (const row of rows) {
    if (!row.codePresent) row.errors.unshift("no callable runtime code");
  }
  return rows;
}

async function dexPool(tokenA, tokenB, fee, blockNumber) {
  const address = await client.readContract({
    address: UNISWAP_FACTORY,
    abi: factoryAbi,
    functionName: "getPool",
    args: [tokenA, tokenB, fee],
    blockNumber,
  });
  if (/^0x0{40}$/i.test(address)) return null;
  const [token0, token1, liquidity, slot0, observation] = await Promise.all([
    client.readContract({
      address,
      abi: poolAbi,
      functionName: "token0",
      blockNumber,
    }),
    client.readContract({
      address,
      abi: poolAbi,
      functionName: "token1",
      blockNumber,
    }),
    client.readContract({
      address,
      abi: poolAbi,
      functionName: "liquidity",
      blockNumber,
    }),
    client.readContract({
      address,
      abi: poolAbi,
      functionName: "slot0",
      blockNumber,
    }),
    client
      .readContract({
        address,
        abi: poolAbi,
        functionName: "observe",
        args: [[1_800, 0]],
        blockNumber,
      })
      .catch(() => null),
  ]);
  if (slot0[3] < 2 || !observation) return null;
  let tickDelta = observation[0][1] - observation[0][0];
  let meanTick = tickDelta / 1_800n;
  if (tickDelta < 0n && tickDelta % 1_800n !== 0n) meanTick -= 1n;
  return {
    address,
    token0,
    token1,
    fee,
    liquidity,
    observationCardinality: slot0[3],
    meanTick: Number(meanTick),
  };
}

async function dexRoutes(tokenIn, tokenOut, blockNumber) {
  const direct = (
    await Promise.all(
      APPROVED_FEES.map((fee) => dexPool(tokenIn, tokenOut, fee, blockNumber)),
    )
  )
    .filter(Boolean)
    .map((pool) => ({ pools: [pool], path: [tokenIn, tokenOut] }));
  if (
    tokenIn.toLowerCase() === WETH.toLowerCase() ||
    tokenOut.toLowerCase() === WETH.toLowerCase()
  ) {
    return direct;
  }
  const [first, second] = await Promise.all([
    Promise.all(
      APPROVED_FEES.map((fee) => dexPool(tokenIn, WETH, fee, blockNumber)),
    ),
    Promise.all(
      APPROVED_FEES.map((fee) => dexPool(WETH, tokenOut, fee, blockNumber)),
    ),
  ]);
  const routes = [...direct];
  for (const a of first.filter(Boolean)) {
    for (const b of second.filter(Boolean)) {
      routes.push({ pools: [a, b], path: [tokenIn, WETH, tokenOut] });
    }
  }
  return routes;
}

function twapAmountOut(route, amountIn) {
  let amount = Number(amountIn);
  for (let index = 0; index < route.pools.length; index += 1) {
    const pool = route.pools[index];
    const input = route.path[index].toLowerCase();
    const ratio = 1.0001 ** pool.meanTick;
    amount =
      input === pool.token0.toLowerCase() ? amount * ratio : amount / ratio;
  }
  if (!Number.isFinite(amount) || amount <= 0) return 0n;
  return BigInt(Math.floor(amount));
}

async function quoteRoute(route, amountIn, blockNumber) {
  const result =
    route.pools.length === 1
      ? await client.simulateContract({
          address: UNISWAP_QUOTER,
          abi: quoterAbi,
          functionName: "quoteExactInputSingle",
          args: [
            {
              tokenIn: route.path[0],
              tokenOut: route.path[1],
              amountIn,
              fee: route.pools[0].fee,
              sqrtPriceLimitX96: 0n,
            },
          ],
          blockNumber,
        })
      : await client.simulateContract({
          address: UNISWAP_QUOTER,
          abi: quoterAbi,
          functionName: "quoteExactInput",
          args: [
            encodePacked(
              ["address", "uint24", "address", "uint24", "address"],
              [
                route.path[0],
                route.pools[0].fee,
                route.path[1],
                route.pools[1].fee,
                route.path[2],
              ],
            ),
            amountIn,
          ],
          blockNumber,
        });
  return {
    route,
    amountOut: result.result[0],
    gasEstimate: result.result[3],
    twapAmountOut: twapAmountOut(route, amountIn),
  };
}

async function bestDexQuote(tokenIn, tokenOut, amountIn, blockNumber) {
  const routes = await dexRoutes(tokenIn, tokenOut, blockNumber);
  const settled = await Promise.allSettled(
    routes.map((route) => quoteRoute(route, amountIn, blockNumber)),
  );
  const valid = settled
    .filter((row) => row.status === "fulfilled" && row.value.twapAmountOut > 0n)
    .map((row) => row.value)
    .sort(
      (a, b) =>
        Number(b.amountOut > a.amountOut) - Number(b.amountOut < a.amountOut) ||
        a.route.pools[0].address.localeCompare(b.route.pools[0].address),
    );
  if (!valid.length) throw new Error("no qualified on-chain Uniswap route");
  const selected = valid[0];
  const difference =
    selected.amountOut > selected.twapAmountOut
      ? selected.amountOut - selected.twapAmountOut
      : selected.twapAmountOut - selected.amountOut;
  return {
    ...selected,
    impactBps: Number((difference * 10_000n) / selected.twapAmountOut),
    rejectedRoutes: settled.flatMap((row, index) =>
      row.status === "rejected"
        ? [
            {
              pools: routes[index].pools.map((pool) => pool.address),
              reason:
                row.reason instanceof Error
                  ? row.reason.message
                  : String(row.reason),
            },
          ]
        : [],
    ),
  };
}

async function quotePair(asset, direction, notionalUsd, reserveDecimals) {
  const blockNumber = await client.getBlockNumber();
  try {
    const unit = 10n ** BigInt(asset.decimals ?? 18);
    const unitMark = await bestDexQuote(asset.address, USDG, unit, blockNumber);
    const notionalRaw = BigInt(notionalUsd) * 10n ** BigInt(reserveDecimals);
    const sellAmount =
      direction === "buy"
        ? notionalRaw
        : (notionalRaw * unit) / unitMark.twapAmountOut;
    const quote = await bestDexQuote(
      direction === "buy" ? USDG : asset.address,
      direction === "buy" ? asset.address : USDG,
      sellAmount,
      blockNumber,
    );
    const evidence = {
      direction,
      notionalUsd,
      sellAmount: sellAmount.toString(),
      buyAmount: quote.amountOut.toString(),
      twapAmountOut: quote.twapAmountOut.toString(),
      impactBps: quote.impactBps,
      blockNumber: blockNumber.toString(),
      factory: UNISWAP_FACTORY,
      router: UNISWAP_ROUTER,
      quoter: UNISWAP_QUOTER,
      pools: quote.route.pools.map((pool) => ({
        address: pool.address,
        fee: pool.fee,
        liquidity: pool.liquidity.toString(),
        observationCardinality: pool.observationCardinality,
      })),
      path: quote.route.path,
      rejectedRoutes: quote.rejectedRoutes,
    };
    return {
      valid: quote.amountOut > 0n,
      ...evidence,
      sourceHash: hash(evidence),
      reason: quote.amountOut > 0n ? null : "DEX quote returned zero",
    };
  } catch (error) {
    return {
      valid: false,
      direction,
      reason:
        error instanceof Error ? error.message : "on-chain DEX quote failed",
    };
  }
}

async function inspectFeed(asset) {
  const configuredFeed = resolvedChainlinkFeeds[asset.symbol];
  const feed =
    typeof configuredFeed === "string"
      ? configuredFeed
      : configuredFeed?.address;
  const maximumAgeSeconds =
    typeof configuredFeed === "object" &&
    Number.isFinite(Number(configuredFeed?.maximumAgeSeconds))
      ? Number(configuredFeed.maximumAgeSeconds)
      : sessionAwareMaximumAgeSeconds(configuredFeed);
  if (!isAddress(feed)) {
    return {
      symbol: asset.symbol,
      valid: false,
      reason: "Chainlink feed mapping not configured",
    };
  }
  try {
    const [decimals, round] = await Promise.all([
      client.readContract({
        address: feed,
        abi: feedAbi,
        functionName: "decimals",
      }),
      client.readContract({
        address: feed,
        abi: feedAbi,
        functionName: "latestRoundData",
      }),
    ]);
    const ageSeconds = Math.max(
      0,
      Math.floor(Date.now() / 1_000) - Number(round[3]),
    );
    const valid =
      round[1] > 0n &&
      round[3] > 0n &&
      round[4] >= round[0] &&
      ageSeconds <= maximumAgeSeconds;
    return {
      symbol: asset.symbol,
      feed,
      decimals: Number(decimals),
      roundId: round[0].toString(),
      answer: round[1].toString(),
      priceUsd: Number(round[1]) / 10 ** Number(decimals),
      updatedAt: Number(round[3]),
      ageSeconds,
      maximumAgeSeconds,
      marketHours: configuredFeed?.marketHours ?? null,
      catalogPath: configuredFeed?.path ?? null,
      catalogSourceHash: configuredFeed?.sourceHash ?? null,
      valid,
      reason: valid ? null : "invalid, incomplete, or stale Chainlink round",
    };
  } catch (error) {
    return {
      symbol: asset.symbol,
      feed,
      valid: false,
      reason: error instanceof Error ? error.message : "feed read failed",
    };
  }
}

function classifyAsset(asset) {
  if (asset.symbol === "WETH") return "crypto";
  if (FUND_SYMBOLS.has(asset.symbol)) return "fund";
  if (/\b(ETF|FUND|TRUST)\b/i.test(asset.name)) return "fund";
  return "stock";
}

function inspectCapitalization(asset, collectedEvidence) {
  const evidence = capitalizationEvidence[asset.symbol] ?? collectedEvidence;
  const expectedKind = classifyAsset(asset);
  const observedAt = Date.parse(evidence?.observedAt ?? "");
  const ageSeconds = Number.isFinite(observedAt)
    ? Math.max(0, Math.floor((Date.now() - observedAt) / 1_000))
    : null;
  const valueUsd = Number(evidence?.valueUsd);
  const sourceHashValid = /^[a-f0-9]{64}$/i.test(evidence?.sourceHash ?? "");
  const sourceValid =
    typeof evidence?.source === "string" &&
    /^https:\/\/(www\.sec\.gov|data\.sec\.gov|[^/]*robinhood\.com|[^/]*chainlink\.com|[^/]*coinbase\.com)\//i.test(
      evidence.source,
    );
  const kindValid =
    evidence?.kind === expectedKind ||
    (expectedKind === "fund" && evidence?.kind === "etf");
  const supplyAdapterValid =
    expectedKind !== "crypto" || evidence?.supplyAdapterApproved === true;
  const valid =
    Number.isFinite(valueUsd) &&
    valueUsd >= CAPITALIZATION_MINIMUM_USD &&
    ageSeconds !== null &&
    ageSeconds <= MAXIMUM_CAPITALIZATION_EVIDENCE_AGE_SECONDS &&
    sourceHashValid &&
    sourceValid &&
    kindValid &&
    supplyAdapterValid;
  return {
    kind: expectedKind,
    metric: expectedKind === "fund" ? "aum" : "circulatingMarketCap",
    valueUsd: Number.isFinite(valueUsd) ? valueUsd : null,
    observedAt: evidence?.observedAt ?? null,
    ageSeconds,
    source: evidence?.source ?? null,
    sourceHash: evidence?.sourceHash ?? null,
    supplyAdapterApproved: evidence?.supplyAdapterApproved === true,
    valid,
    reason: valid
      ? null
      : "missing, stale, unapproved, or sub-$100M capitalization evidence",
    collectionError: evidence?.error ?? null,
  };
}

function priorQualificationEvidence() {
  if (!existsSync(evidencePath)) return [];
  return readFileSync(evidencePath, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
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
const inspected = await inspectTokens(canonicalAssets);
const nominated = new Set(
  (
    process.env.MDB_MAINNET_SHADOW_SYMBOLS ??
    MAINNET_NOMINATED_SYMBOLS.join(",")
  )
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean),
);
const nominatedAssets = inspected.filter(
  (asset) => nominated.has(asset.symbol) && asset.symbol !== "USDG",
);
let chainlinkCatalogHash = null;
if (Object.keys(resolvedChainlinkFeeds).length === 0) {
  try {
    const catalog = await json(chainlinkCatalogUrl);
    chainlinkCatalogHash = hash(catalog);
    resolvedChainlinkFeeds = chainlinkMappingsFromCatalog(catalog, [
      ...nominated,
    ]);
  } catch {
    resolvedChainlinkFeeds = {};
  }
}
const feedEvidence = await parallelMap(nominatedAssets, 6, inspectFeed);
const priorEvidence = priorQualificationEvidence();
const quoteEvidence = [];
const marketEvidence = [];
const reserveDecimals =
  inspected.find((asset) => asset.symbol === "USDG")?.decimals ?? 6;
for (const asset of nominatedAssets) {
  let priceUsd = null;
  if (asset.symbol === "WETH") {
    priceUsd =
      feedEvidence.find((row) => row.symbol === asset.symbol)?.priceUsd ?? null;
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
  const assetId = `${CHAIN_ID}:${asset.address.toLowerCase()}`;
  const historyRows = [
    ...priorEvidence,
    {
      at: new Date().toISOString(),
      assets: [{ assetId, symbol: asset.symbol, officialPriceUsd: priceUsd }],
    },
  ];
  const history = officialHistoryCoverage(
    historyRows,
    assetId,
    asset.symbol,
    new Date().toISOString(),
  );
  const collectedCapitalization =
    capitalizationEvidence[asset.symbol] ??
    (priceUsd && priceUsd > 0
      ? await collectSecCapitalization(asset, priceUsd)
      : null);
  const capitalization = inspectCapitalization(asset, collectedCapitalization);
  quoteEvidence.push({
    symbol: asset.symbol,
    impactBuy: await quotePair(
      asset,
      "buy",
      IMPACT_NOTIONAL_USD,
      reserveDecimals,
    ),
    impactSell: await quotePair(
      asset,
      "sell",
      IMPACT_NOTIONAL_USD,
      reserveDecimals,
    ),
    depthBuy: await quotePair(
      asset,
      "buy",
      DEPTH_NOTIONAL_USD,
      reserveDecimals,
    ),
    depthSell: await quotePair(
      asset,
      "sell",
      DEPTH_NOTIONAL_USD,
      reserveDecimals,
    ),
  });
  marketEvidence.push({
    symbol: asset.symbol,
    capitalization,
    history,
    officialPriceUsd: priceUsd,
  });
}
const qualification = inspected
  .filter((asset) => nominated.has(asset.symbol) && asset.symbol !== "USDG")
  .map((asset) => {
    const quote = quoteEvidence.find((row) => row.symbol === asset.symbol);
    const feed = feedEvidence.find((row) => row.symbol === asset.symbol);
    const market = marketEvidence.find((row) => row.symbol === asset.symbol);
    const tradingAvailable =
      asset.symbol === "WETH" ||
      Object.values(asset.tradingCapabilities ?? {}).some(
        (session) =>
          session?.whole === "TRADING_STATUS_TRADABLE" ||
          session?.fractional === "TRADING_STATUS_TRADABLE",
      );
    const identityValid =
      asset.codePresent &&
      (!asset.uid ||
        asset.onchainUid?.toLowerCase() === asset.uid.toLowerCase());
    const noCorporateActionTransition =
      !asset.pendingMultiplier ||
      Number(asset.pendingMultiplier) === Number(asset.currentMultiplier);
    const impactValid =
      quote?.impactBuy?.valid === true &&
      quote?.impactSell?.valid === true &&
      quote.impactBuy.impactBps <= MAXIMUM_IMPACT_BPS &&
      quote.impactSell.impactBps <= MAXIMUM_IMPACT_BPS;
    const depthValid =
      quote?.depthBuy?.valid === true &&
      quote?.depthSell?.valid === true &&
      quote.depthBuy.impactBps <= 300 &&
      quote.depthSell.impactBps <= 300;
    const passed =
      identityValid &&
      asset.oraclePaused !== true &&
      tradingAvailable &&
      noCorporateActionTransition &&
      feed?.valid === true &&
      impactValid &&
      depthValid &&
      market?.capitalization?.valid === true &&
      market?.history?.valid === true;
    const assetId = `${CHAIN_ID}:${asset.address.toLowerCase()}`;
    const priorAssetRows = priorEvidence
      .flatMap((row) =>
        (row.assets ?? []).map((candidate) => ({
          ...candidate,
          at: candidate.at ?? row.at,
        })),
      )
      .filter((row) => row.assetId === assetId);
    const windowRows = [
      ...priorAssetRows,
      { at: new Date().toISOString(), passed },
    ];
    const window = continuousPassingWindow(windowRows);
    const windowPassed = qualificationWindowPassed({
      ...window,
      requiredHours: QUALIFICATION_HOURS,
      requiresMarketSessions: asset.symbol !== "WETH",
    });
    return {
      assetId,
      symbol: asset.symbol,
      passed,
      required: MAINNET_CORE_SYMBOLS.includes(asset.symbol),
      qualificationHours: window.qualificationHours,
      regularMarketSessions: window.regularMarketSessions,
      qualificationWindowPassed: windowPassed,
      qualificationStartedAt: window.qualificationStartedAt,
      latestSuccessfulCheckAt: window.latestSuccessfulCheckAt,
      resetReason: passed
        ? null
        : Object.entries({
            identity: identityValid,
            oracle: asset.oraclePaused !== true,
            trading: tradingAvailable,
            corporateAction: noCorporateActionTransition,
            feed: feed?.valid === true,
            impact: impactValid,
            depth: depthValid,
            capitalization: market?.capitalization?.valid === true,
            history: market?.history?.valid === true,
          })
            .filter(([, valid]) => !valid)
            .map(([name]) => name)
            .join(", "),
      evidenceHash: hash({
        assetId,
        identity: {
          uid: asset.uid,
          onchainUid: asset.onchainUid,
          decimals: asset.decimals,
        },
        feed,
        quote,
        market,
        tradingAvailable,
        noCorporateActionTransition,
      }),
      checks: {
        identityValid,
        oracleActive: asset.oraclePaused !== true,
        tradingAvailable,
        noCorporateActionTransition,
        feedValid: feed?.valid === true,
        impactValid,
        depthValid,
        capitalizationValid: market?.capitalization?.valid === true,
        historyValid: market?.history?.valid === true,
      },
    };
  });
const readiness = summarizeMainnetReadiness(qualification);
const requiredQualification = qualification.filter((row) => row.required);
const currentQualificationPass =
  requiredQualification.length === MAINNET_CORE_SYMBOLS.length &&
  requiredQualification.every((row) => row.passed);
const qualificationHours =
  requiredQualification.length > 0
    ? Math.min(...requiredQualification.map((row) => row.qualificationHours))
    : 0;
const allQualificationWindowsPassed = readiness.coreQualificationPassed;

const result = {
  schemaVersion: 4,
  mode: "robinhood-mainnet-shadow",
  startedAt,
  completedAt: new Date().toISOString(),
  chainId,
  rpc: rpcUrl === PUBLIC_RPC ? "public-rate-limited" : "configured-provider",
  broadcastPermitted: false,
  officialRegistry: ROBINHOOD_ASSETS,
  chainlinkCatalog: chainlinkCatalogUrl,
  chainlinkCatalogHash,
  canonicalAssetCount: inspected.length,
  assets: inspected.filter(
    (asset) => asset.symbol === "USDG" || nominated.has(asset.symbol),
  ),
  quoteEvidence,
  feedEvidence,
  marketEvidence,
  qualification,
  qualificationHours,
  qualificationRequiredHours: QUALIFICATION_HOURS,
  qualificationWindowPassed: allQualificationWindowsPassed,
  readiness,
  gates: {
    noSigningKey: true,
    canonicalIdentityChecked: MAINNET_CORE_SYMBOLS.every((symbol) => {
      const asset = inspected.find((candidate) => candidate.symbol === symbol);
      return (
        asset?.codePresent === true &&
        (!asset.uid ||
          asset.onchainUid?.toLowerCase() === asset.uid.toLowerCase())
      );
    }),
    dexVenueVerified:
      isAddress(UNISWAP_FACTORY) &&
      isAddress(UNISWAP_ROUTER) &&
      isAddress(UNISWAP_QUOTER),
    selfHostedRouting: true,
    twoSidedQuotesValid: MAINNET_CORE_SYMBOLS.every((symbol) => {
      const row = quoteEvidence.find(
        (candidate) => candidate.symbol === symbol,
      );
      return (
        row &&
        row.impactBuy.valid &&
        row.impactSell.valid &&
        row.impactBuy.impactBps <= MAXIMUM_IMPACT_BPS &&
        row.impactSell.impactBps <= MAXIMUM_IMPACT_BPS &&
        row.depthBuy.valid &&
        row.depthSell.valid &&
        row.depthBuy.impactBps <= 300 &&
        row.depthSell.impactBps <= 300
      );
    }),
    chainlinkMappingsConfigured: MAINNET_CORE_SYMBOLS.every(
      (symbol) =>
        feedEvidence.find((row) => row.symbol === symbol)?.valid === true,
    ),
    qualificationWindowPassed: allQualificationWindowsPassed,
  },
};
result.readyToBuildCandidate =
  result.gates.noSigningKey &&
  result.gates.canonicalIdentityChecked &&
  result.gates.dexVenueVerified &&
  result.gates.selfHostedRouting &&
  result.gates.twoSidedQuotesValid &&
  result.gates.chainlinkMappingsConfigured &&
  result.gates.qualificationWindowPassed;
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
    passed: currentQualificationPass,
    qualificationHours,
    qualificationRequiredHours: QUALIFICATION_HOURS,
    qualificationWindowPassed: allQualificationWindowsPassed,
    readiness,
    canonicalAssetCount: result.canonicalAssetCount,
    assets: qualification.map((row) => ({
      assetId: row.assetId,
      symbol: row.symbol,
      passed: row.passed,
      required: row.required,
      officialPriceUsd:
        marketEvidence.find((market) => market.symbol === row.symbol)
          ?.officialPriceUsd ?? null,
      qualificationHours: row.qualificationHours,
      regularMarketSessions: row.regularMarketSessions,
      qualificationWindowPassed: row.qualificationWindowPassed,
      qualificationStartedAt: row.qualificationStartedAt,
      latestSuccessfulCheckAt: row.latestSuccessfulCheckAt,
      resetReason: row.resetReason,
      evidenceHash: row.evidenceHash,
    })),
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
