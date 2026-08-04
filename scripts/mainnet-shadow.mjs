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
  CAPACITY_PROBES_USD,
  deploymentLiquidityCompatible,
  fullCanonicalUniverseInspected,
  MAINNET_PRIORITY_SYMBOLS,
  poolObservationFresh,
  summarizePausedDeploymentReadiness,
  summarizeMainnetReadiness,
} from "./lib/mainnet-readiness.mjs";

const CHAIN_ID = 4663;
const PUBLIC_RPC = "https://rpc.mainnet.chain.robinhood.com";
const ROBINHOOD_ASSETS = "https://api.robinhood.com/rhj/assets";
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
const MAXIMUM_IMPACT_BPS = 100;
const QUALIFICATION_HOURS = 48;
const FUND_SYMBOLS = new Set(["SPY", "QQQ", "SOXX"]);
const SHORT_TWAP_SECONDS = 1_800;
const LONG_TWAP_SECONDS = 14_400;
const MAXIMUM_SPOT_TO_SHORT_BPS = 300;
const MAXIMUM_SHORT_TO_LONG_BPS = 500;
const MAXIMUM_OBSERVATION_AGE_SECONDS = 3_600;
const MAXIMUM_PRELIMINARY_OBSERVATION_AGE_SECONDS = 1_800;
const QUALIFICATION_RULE_VERSION = 4;
const cryptoCatalogPath = resolve(
  repoRoot,
  "config/mainnet-crypto-candidates.json",
);
const cryptoCandidateCatalog = JSON.parse(
  process.env.MDB_MAINNET_CRYPTO_CANDIDATES_JSON ??
    (existsSync(cryptoCatalogPath)
      ? readFileSync(cryptoCatalogPath, "utf8")
      : "[]"),
);

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
const factoryAbi = parseAbi([
  "function getPool(address tokenA,address tokenB,uint24 fee) view returns (address pool)",
]);
const poolAbi = parseAbi([
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function liquidity() view returns (uint128)",
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)",
  "function observations(uint256 index) view returns (uint32 blockTimestamp,int56 tickCumulative,uint160 secondsPerLiquidityCumulativeX128,bool initialized)",
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

async function dexPool(tokenA, tokenB, fee, blockNumber, blockTimestamp) {
  const address = await client.readContract({
    address: UNISWAP_FACTORY,
    abi: factoryAbi,
    functionName: "getPool",
    args: [tokenA, tokenB, fee],
    blockNumber,
  });
  if (/^0x0{40}$/i.test(address)) return null;
  const [token0, token1, liquidity, slot0] = await Promise.all([
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
  ]);
  const [observation, latestObservation] = await Promise.all([
    client
      .readContract({
        address,
        abi: poolAbi,
        functionName: "observe",
        args: [[LONG_TWAP_SECONDS, SHORT_TWAP_SECONDS, 0]],
        blockNumber,
      })
      .catch(() => null),
    client
      .readContract({
        address,
        abi: poolAbi,
        functionName: "observations",
        args: [BigInt(slot0[2])],
        blockNumber,
      })
      .catch(() => null),
  ]);
  if (slot0[3] < 2 || !observation || !latestObservation?.[3]) return null;
  const observationFresh = poolObservationFresh({
    blockTimestamp,
    observationTimestamp: latestObservation[0],
    maximumAgeSeconds: MAXIMUM_OBSERVATION_AGE_SECONDS,
  });
  const latestObservationTimestamp = BigInt(latestObservation[0]);
  const observationAgeSeconds =
    latestObservationTimestamp <= BigInt(blockTimestamp)
      ? Number(BigInt(blockTimestamp) - latestObservationTimestamp)
      : null;
  const meanTick = (delta, window) => {
    let tick = delta / BigInt(window);
    if (delta < 0n && delta % BigInt(window) !== 0n) tick -= 1n;
    return Number(tick);
  };
  const shortMeanTick = meanTick(
    observation[0][2] - observation[0][1],
    SHORT_TWAP_SECONDS,
  );
  const longMeanTick = meanTick(
    observation[0][2] - observation[0][0],
    LONG_TWAP_SECONDS,
  );
  const liquidityDelta = observation[1][2] - observation[1][0];
  const harmonicMeanLiquidity =
    liquidityDelta > 0n
      ? (BigInt(LONG_TWAP_SECONDS) << 128n) / liquidityDelta
      : 0n;
  const tickImpactBps = (left, right) =>
    Math.round(Math.abs(1.0001 ** (left - right) - 1) * 10_000);
  const spotToShortDeviationBps = tickImpactBps(
    Number(slot0[1]),
    shortMeanTick,
  );
  const shortToLongDeviationBps = tickImpactBps(shortMeanTick, longMeanTick);
  return {
    address,
    token0,
    token1,
    fee,
    liquidity,
    observationCardinality: slot0[3],
    latestObservationTimestamp: Number(latestObservation[0]),
    observationAgeSeconds,
    observationFresh,
    meanTick: shortMeanTick,
    longMeanTick,
    harmonicMeanLiquidity,
    spotToShortDeviationBps,
    shortToLongDeviationBps,
    safetyValid:
      observationFresh &&
      harmonicMeanLiquidity > 0n &&
      spotToShortDeviationBps <= MAXIMUM_SPOT_TO_SHORT_BPS &&
      shortToLongDeviationBps <= MAXIMUM_SHORT_TO_LONG_BPS,
  };
}

async function dexRoutes(tokenIn, tokenOut, blockNumber, blockTimestamp) {
  const direct = (
    await Promise.all(
      APPROVED_FEES.map((fee) =>
        dexPool(tokenIn, tokenOut, fee, blockNumber, blockTimestamp),
      ),
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
      APPROVED_FEES.map((fee) =>
        dexPool(tokenIn, WETH, fee, blockNumber, blockTimestamp),
      ),
    ),
    Promise.all(
      APPROVED_FEES.map((fee) =>
        dexPool(WETH, tokenOut, fee, blockNumber, blockTimestamp),
      ),
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

async function bestDexQuote(
  tokenIn,
  tokenOut,
  amountIn,
  blockNumber,
  blockTimestamp,
) {
  const routes = await dexRoutes(
    tokenIn,
    tokenOut,
    blockNumber,
    blockTimestamp,
  );
  const settled = await Promise.allSettled(
    routes.map((route) => quoteRoute(route, amountIn, blockNumber)),
  );
  const valid = settled
    .filter(
      (row) =>
        row.status === "fulfilled" &&
        row.value.twapAmountOut > 0n &&
        row.value.route.pools.every((pool) => pool.safetyValid),
    )
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

async function quotePair(
  asset,
  direction,
  notionalUsd,
  reserveDecimals,
  pinnedBlock,
  pinnedTimestamp,
) {
  const blockNumber = pinnedBlock ?? (await client.getBlockNumber());
  const blockTimestamp =
    pinnedTimestamp ?? (await client.getBlock({ blockNumber })).timestamp;
  try {
    const unit = 10n ** BigInt(asset.decimals ?? 18);
    const unitMark = await bestDexQuote(
      asset.address,
      USDG,
      unit,
      blockNumber,
      blockTimestamp,
    );
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
      blockTimestamp,
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
        latestObservationTimestamp: pool.latestObservationTimestamp,
        observationAgeSeconds: pool.observationAgeSeconds,
        observationFresh: pool.observationFresh,
        harmonicMeanLiquidity: pool.harmonicMeanLiquidity.toString(),
        spotToShortDeviationBps: pool.spotToShortDeviationBps,
        shortToLongDeviationBps: pool.shortToLongDeviationBps,
        shortTwapSeconds: SHORT_TWAP_SECONDS,
        longTwapSeconds: LONG_TWAP_SECONDS,
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
const officialMainnetDeployments = (registry.assets ?? [])
  .filter((asset) => asset.status === "ASSET_STATUS_ACTIVE")
  .filter((asset) =>
    asset.deployments?.some(
      (row) => row.chainId === CHAIN_ID && isAddress(row.contractAddress),
    ),
  );
const stockAssets = officialMainnetDeployments
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
      kind: FUND_SYMBOLS.has(asset.tokenSymbol) ? "etf" : "stock",
    };
  })
  .filter(Boolean);
const configuredCrypto = cryptoCandidateCatalog
  .filter(
    (asset) =>
      asset?.enabled === true &&
      isAddress(asset.address) &&
      asset.symbol !== "WETH",
  )
  .map((asset) => ({
    ...asset,
    uid: null,
    currentMultiplier: "1",
    kind: "crypto",
    source: "committed-crypto-candidate-catalog",
  }));
const canonicalAssets = [
  {
    symbol: "USDG",
    name: "Global Dollar",
    address: USDG,
    uid: null,
    currentMultiplier: "1",
    source: "canonical-contract-manifest",
    kind: "reserve",
  },
  {
    symbol: "WETH",
    name: "Wrapped Ether",
    address: WETH,
    uid: null,
    currentMultiplier: "1",
    source: "canonical-contract-manifest",
    kind: "crypto",
  },
  ...stockAssets,
  ...configuredCrypto,
];
const inspected = await inspectTokens(canonicalAssets);
const symbolFilter = (process.env.MDB_MAINNET_SHADOW_SYMBOLS ?? "").trim();
const diagnosticMode =
  process.env.MDB_MAINNET_SHADOW_DIAGNOSTIC_MODE === "true";
if (symbolFilter && !diagnosticMode) {
  throw new Error(
    "MDB_MAINNET_SHADOW_SYMBOLS is diagnostic-only and must be empty in readiness mode",
  );
}
const requestedSymbols = new Set(
  symbolFilter
    .split(",")
    .map((symbol) => symbol.trim())
    .filter(Boolean),
);
const candidates = inspected.filter(
  (asset) =>
    asset.symbol !== "USDG" &&
    (requestedSymbols.size === 0 || requestedSymbols.has(asset.symbol)),
);
const priorEvidence = priorQualificationEvidence();
const reserveDecimals =
  inspected.find((asset) => asset.symbol === "USDG")?.decimals ?? 6;

async function inspectCapacity(asset) {
  const blockNumber = await client.getBlockNumber();
  const block = await client.getBlock({ blockNumber });
  const probes = [];
  let safeTwoSidedCapacityUsd = 0;
  for (const notionalUsd of CAPACITY_PROBES_USD) {
    const [buy, sell] = await Promise.all([
      quotePair(
        asset,
        "buy",
        notionalUsd,
        reserveDecimals,
        blockNumber,
        block.timestamp,
      ),
      quotePair(
        asset,
        "sell",
        notionalUsd,
        reserveDecimals,
        blockNumber,
        block.timestamp,
      ),
    ]);
    const passed =
      buy.valid === true &&
      sell.valid === true &&
      buy.impactBps <= MAXIMUM_IMPACT_BPS &&
      sell.impactBps <= MAXIMUM_IMPACT_BPS;
    probes.push({ notionalUsd, buy, sell, passed });
    if (!passed) break;
    safeTwoSidedCapacityUsd = notionalUsd;
  }
  return {
    assetId: `${CHAIN_ID}:${asset.address.toLowerCase()}`,
    symbol: asset.symbol,
    blockNumber: blockNumber.toString(),
    probes,
    safeTwoSidedCapacityUsd,
    safeTwoSidedCapacityUsdWad: (
      BigInt(safeTwoSidedCapacityUsd) *
      10n ** 18n
    ).toString(),
    maximumExposureUsdWad: (
      (BigInt(safeTwoSidedCapacityUsd) * 10n ** 18n) /
      2n
    ).toString(),
  };
}

const capacityEvidence = await parallelMap(candidates, 3, inspectCapacity);
const highVolatility = new Set(["WETH", "VIRTUAL", "GME", "SPCX"]);
const qualification = candidates.map((asset) => {
  const capacity = capacityEvidence.find(
    (row) => row.assetId === `${CHAIN_ID}:${asset.address.toLowerCase()}`,
  );
  const tradingAvailable =
    asset.kind === "crypto" ||
    Object.values(asset.tradingCapabilities ?? {}).some(
      (session) =>
        session?.whole === "TRADING_STATUS_TRADABLE" ||
        session?.fractional === "TRADING_STATUS_TRADABLE",
    );
  const identityValid =
    asset.codePresent === true &&
    (!asset.uid || asset.onchainUid?.toLowerCase() === asset.uid.toLowerCase());
  const tokenStateClear =
    asset.oraclePaused !== true &&
    (!asset.pendingMultiplier ||
      Number(asset.pendingMultiplier) === Number(asset.currentMultiplier));
  const routeMature =
    capacity?.probes?.[0]?.buy?.valid === true &&
    capacity?.probes?.[0]?.sell?.valid === true;
  const dexSafety = capacity?.probes
    ?.flatMap((probe) => [
      ...(probe.buy?.pools ?? []),
      ...(probe.sell?.pools ?? []),
    ])
    .every(
      (pool) =>
        pool.harmonicMeanLiquidity !== "0" &&
        pool.spotToShortDeviationBps <= MAXIMUM_SPOT_TO_SHORT_BPS &&
        pool.shortToLongDeviationBps <= MAXIMUM_SHORT_TO_LONG_BPS,
    );
  const capacityValid = Number(capacity?.safeTwoSidedCapacityUsd ?? 0) > 0;
  const deploymentProbe = [...(capacity?.probes ?? [])]
    .reverse()
    .find((probe) => probe.passed === true);
  const deploymentObservationAges = [
    ...(deploymentProbe?.buy?.pools ?? []),
    ...(deploymentProbe?.sell?.pools ?? []),
  ].map((pool) => pool.observationAgeSeconds);
  const maximumDeploymentObservationAgeSeconds =
    deploymentObservationAges.length > 0 &&
    deploymentObservationAges.every(Number.isFinite)
      ? Math.max(...deploymentObservationAges)
      : null;
  const deploymentRouteFresh =
    maximumDeploymentObservationAgeSeconds !== null &&
    maximumDeploymentObservationAgeSeconds <=
      MAXIMUM_PRELIMINARY_OBSERVATION_AGE_SECONDS;
  const deploymentRouteCompatible = deploymentLiquidityCompatible(
    deploymentProbe?.buy?.pools,
  );
  const passed =
    identityValid &&
    tradingAvailable &&
    tokenStateClear &&
    routeMature &&
    dexSafety === true &&
    capacityValid;
  const assetId = `${CHAIN_ID}:${asset.address.toLowerCase()}`;
  const priorAssetRows = priorEvidence
    .flatMap((row) =>
      (row.assets ?? []).map((candidate) => ({
        ...candidate,
        at: candidate.at ?? row.at,
      })),
    )
    .filter(
      (row) =>
        row.assetId === assetId &&
        row.qualificationRuleVersion === QUALIFICATION_RULE_VERSION,
    );
  const window = continuousPassingWindow([
    ...priorAssetRows,
    { at: new Date().toISOString(), passed },
  ]);
  const windowPassed = qualificationWindowPassed({
    ...window,
    requiredHours: QUALIFICATION_HOURS,
    requiresMarketSessions: asset.kind === "stock" || asset.kind === "etf",
  });
  const riskClass = highVolatility.has(asset.symbol)
    ? "high_volatility"
    : "standard";
  const evidence = {
    qualificationRuleVersion: QUALIFICATION_RULE_VERSION,
    assetId,
    symbol: asset.symbol,
    kind: asset.kind,
    riskClass,
    maximumWeightBps: 2_000,
    identityValid,
    tradingAvailable,
    tokenStateClear,
    routeMature,
    routeMaturityScoreBps: routeMature && dexSafety === true ? 10_000 : 0,
    liquidityStabilityScoreBps: Math.min(
      10_000,
      Math.floor((window.qualificationHours * 10_000) / QUALIFICATION_HOURS),
    ),
    dexSafetyValid: dexSafety === true,
    deploymentRouteFresh,
    deploymentRouteCompatible,
    maximumDeploymentObservationAgeSeconds,
    safeTwoSidedCapacityUsdWad: capacity.safeTwoSidedCapacityUsdWad,
    maximumExposureUsdWad: capacity.maximumExposureUsdWad,
    capacity,
  };
  return {
    ...evidence,
    passed,
    priority: MAINNET_PRIORITY_SYMBOLS.includes(asset.symbol),
    qualificationHours: window.qualificationHours,
    regularMarketSessions: window.regularMarketSessions,
    qualificationWindowPassed: windowPassed,
    qualificationStartedAt: window.qualificationStartedAt,
    latestSuccessfulCheckAt: window.latestSuccessfulCheckAt,
    resetReason: passed
      ? null
      : Object.entries({
          identity: identityValid,
          trading: tradingAvailable,
          tokenState: tokenStateClear,
          routeMaturity: routeMature,
          dexSafety: dexSafety === true,
          capacity: capacityValid,
        })
          .filter(([, valid]) => !valid)
          .map(([name]) => name)
          .join(", "),
    evidenceHash: hash(evidence),
  };
});
const deploymentReadiness = summarizePausedDeploymentReadiness(qualification);
const readiness = summarizeMainnetReadiness(qualification);
const qualificationHours =
  qualification.length > 0
    ? Math.min(...qualification.map((row) => row.qualificationHours))
    : 0;
const result = {
  schemaVersion: 5,
  qualificationRuleVersion: QUALIFICATION_RULE_VERSION,
  mode: "robinhood-mainnet-dex-shadow",
  startedAt,
  completedAt: new Date().toISOString(),
  chainId,
  rpc: rpcUrl === PUBLIC_RPC ? "public-rate-limited" : "configured-provider",
  broadcastPermitted: false,
  accountingAsset: "USDG",
  nativeEthEntryEnabled: false,
  officialRegistry: ROBINHOOD_ASSETS,
  canonicalAssetCount: inspected.length,
  assets: inspected,
  capacityEvidence,
  qualification,
  qualificationHours,
  qualificationRequiredHours: QUALIFICATION_HOURS,
  qualificationWindowPassed: readiness.coreQualificationPassed,
  deploymentReadiness,
  readiness,
  deploymentGates: {
    noSigningKey: true,
    fullCanonicalStockUniverseInspected: fullCanonicalUniverseInspected({
      officialMainnetDeploymentCount: officialMainnetDeployments.length,
      inspectedStockAssetCount: inspected.filter(
        (asset) => asset.kind === "stock" || asset.kind === "etf",
      ).length,
      diagnosticFilterEnabled: requestedSymbols.size > 0,
    }),
    diagnosticFilterDisabled: requestedSymbols.size === 0,
    dexVenueVerified:
      isAddress(UNISWAP_FACTORY) &&
      isAddress(UNISWAP_ROUTER) &&
      isAddress(UNISWAP_QUOTER),
    selfHostedRouting: true,
    noOffchainCapitalizationGate: true,
    preliminaryUniverseReady: deploymentReadiness.pausedShadowReady,
  },
  activationGates: {
    qualificationWindowPassed: readiness.coreQualificationPassed,
  },
};
result.gates = {
  ...result.deploymentGates,
  ...result.activationGates,
};
result.readyToBuildCandidate = Object.values(result.deploymentGates).every(
  Boolean,
);
result.readyToBuildActivationCandidate =
  result.readyToBuildCandidate &&
  Object.values(result.activationGates).every(Boolean);
result.sourceHash = hash(result);
mkdirSync(dirname(statePath), { recursive: true });
writeFileSync(statePath, `${JSON.stringify(result, null, 2)}\n`, {
  mode: 0o640,
});
appendFileSync(
  evidencePath,
  `${JSON.stringify({
    at: result.completedAt,
    schemaVersion: 3,
    qualificationRuleVersion: QUALIFICATION_RULE_VERSION,
    sourceHash: result.sourceHash,
    deploymentGates: result.deploymentGates,
    activationGates: result.activationGates,
    gates: result.gates,
    passed: result.readyToBuildActivationCandidate,
    pausedDeploymentPassed: result.readyToBuildCandidate,
    qualificationHours,
    qualificationRequiredHours: QUALIFICATION_HOURS,
    qualificationWindowPassed: result.qualificationWindowPassed,
    deploymentReadiness,
    readiness,
    canonicalAssetCount: result.canonicalAssetCount,
    assets: qualification.map((row) => ({
      assetId: row.assetId,
      symbol: row.symbol,
      qualificationRuleVersion: row.qualificationRuleVersion,
      passed: row.passed,
      qualificationHours: row.qualificationHours,
      regularMarketSessions: row.regularMarketSessions,
      qualificationWindowPassed: row.qualificationWindowPassed,
      qualificationStartedAt: row.qualificationStartedAt,
      latestSuccessfulCheckAt: row.latestSuccessfulCheckAt,
      resetReason: row.resetReason,
      safeTwoSidedCapacityUsdWad: row.safeTwoSidedCapacityUsdWad,
      maximumExposureUsdWad: row.maximumExposureUsdWad,
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
    readiness,
  }),
);
