import {
  encodePacked,
  formatUnits,
  keccak256,
  parseAbi,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { dashboard, deployment, publicClient } from "./chain";
import { stableDecisionJson } from "./decision-math";
import {
  persistDexPoolObservation,
  persistDexQuoteBundle,
} from "./persistence";

const factoryAbi = parseAbi([
  "function getPool(address tokenA,address tokenB,uint24 fee) view returns (address pool)",
]);
const quoterAbi = parseAbi([
  "function quoteExactInputSingle((address tokenIn,address tokenOut,uint256 amountIn,uint24 fee,uint160 sqrtPriceLimitX96) params) returns (uint256 amountOut,uint160 sqrtPriceX96After,uint32 initializedTicksCrossed,uint256 gasEstimate)",
  "function quoteExactInput(bytes path,uint256 amountIn) returns (uint256 amountOut,uint160[] sqrtPriceX96AfterList,uint32[] initializedTicksCrossedList,uint256 gasEstimate)",
]);
const dexMarkAbi = parseAbi([
  "function quoteAmount(address tokenIn,address tokenOut,uint256 amountIn) view returns (uint256 amountOut,bool valid)",
]);
const basketAssetsAbi = parseAbi([
  "function supportedAssets() view returns (address[] assets)",
]);
const poolStateAbi = parseAbi([
  "function liquidity() view returns (uint128)",
  "function slot0() view returns (uint160 sqrtPriceX96,int24 tick,uint16 observationIndex,uint16 observationCardinality,uint16 observationCardinalityNext,uint8 feeProtocol,bool unlocked)",
]);

type VenuePool = {
  address: Address;
  token0: Address;
  token1: Address;
  fee: number;
  approved: boolean;
};

type Venue = {
  factory: Address;
  router: Address;
  quoter: Address;
  weth: Address;
  pools: VenuePool[];
};

type Route = {
  tokenIn: Address;
  tokenOut: Address;
  intermediate: Address;
  firstFee: number;
  secondFee: number;
};

export type JsonDexSwapPlan = {
  plan: {
    route: Route;
    amountIn: string;
    quotedAmountOut: string;
    minimumAmountOut: string;
    recipient: Address;
    issuedAt: string;
    deadline: string;
    referenceBlock: string;
  };
  evidence: {
    firstPool: Address;
    secondPool: Address | null;
    quoteBlock: string;
    expiresAt: number;
    gasEstimate: string;
    estimatedGasCostUsdG: string;
    twapAmountOut: string;
    priceImpactBps: number;
    capacity: {
      maximumExposureUsdWad: string | null;
      projectedExposureUsdWad: string | null;
      utilizationBps: number | null;
    };
    path: string;
    rejectedRoutes: {
      path: string;
      firstPool: Address;
      secondPool: Address | null;
      reason: string;
    }[];
  };
};

type Candidate = {
  route: Route;
  firstPool: Address;
  secondPool: Address | null;
  path: Hex;
  amountOut: bigint;
  gasEstimate: bigint;
  gasCostUsdG: bigint;
  score: bigint;
};

type RejectedRoute = {
  path: Hex;
  firstPool: Address;
  secondPool: Address | null;
  reason: string;
};

function venue() {
  const d = deployment();
  const configured = d.dexVenue as Venue | undefined;
  if (
    (d.schemaVersion ?? 0) < 4 ||
    !d.dexExecutionAdapter ||
    !d.dexValuationAdapter ||
    !configured?.factory ||
    !configured.router ||
    !configured.quoter ||
    !configured.weth ||
    !configured.pools?.length
  ) {
    throw new Error("DEX venue manifest V4 or newer is not active");
  }
  return { d, venue: configured };
}

async function orderedRiskAssets(
  d: ReturnType<typeof deployment>,
  blockNumber: bigint,
) {
  const addresses = await publicClient.readContract({
    address: d.basket,
    abi: basketAssetsAbi,
    functionName: "supportedAssets",
    blockNumber,
  });
  const byAddress = new Map(
    d.assets?.map((asset) => [asset.address.toLowerCase(), asset]),
  );
  return addresses.map((address) => {
    const asset = byAddress.get(address.toLowerCase());
    if (!asset || asset.kind === "reserve") {
      throw new Error(
        `vault asset ${address} is missing from the DEX manifest`,
      );
    }
    return asset;
  });
}

function hasPair(pool: VenuePool, tokenA: Address, tokenB: Address) {
  const a = tokenA.toLowerCase();
  const b = tokenB.toLowerCase();
  return (
    pool.approved &&
    ((pool.token0.toLowerCase() === a && pool.token1.toLowerCase() === b) ||
      (pool.token0.toLowerCase() === b && pool.token1.toLowerCase() === a))
  );
}

async function assertCanonicalPool(
  factory: Address,
  pool: VenuePool,
  blockNumber: bigint,
) {
  const canonical = await publicClient.readContract({
    address: factory,
    abi: factoryAbi,
    functionName: "getPool",
    args: [pool.token0, pool.token1, pool.fee],
    blockNumber,
  });
  if (canonical.toLowerCase() !== pool.address.toLowerCase()) {
    throw new Error(
      `manifest pool ${pool.address} is not canonical at block ${blockNumber}`,
    );
  }
}

async function dexGasCostUsdG(
  dexValuation: Address,
  weth: Address,
  reserve: Address,
  gasWei: bigint,
  blockNumber: bigint,
) {
  const [amount, valid] = await publicClient.readContract({
    address: dexValuation,
    abi: dexMarkAbi,
    functionName: "quoteAmount",
    args: [weth, reserve, gasWei],
    blockNumber,
  });
  return valid ? amount : 0n;
}

async function quoteCandidate(
  candidate: Omit<
    Candidate,
    "amountOut" | "gasEstimate" | "gasCostUsdG" | "score"
  >,
  amountIn: bigint,
  quoter: Address,
  dexValuation: Address,
  weth: Address,
  reserve: Address,
  gasPrice: bigint,
  blockNumber: bigint,
) {
  const simulation =
    candidate.secondPool === null
      ? await publicClient.simulateContract({
          address: quoter,
          abi: quoterAbi,
          functionName: "quoteExactInputSingle",
          args: [
            {
              tokenIn: candidate.route.tokenIn,
              tokenOut: candidate.route.tokenOut,
              amountIn,
              fee: candidate.route.firstFee,
              sqrtPriceLimitX96: 0n,
            },
          ],
          blockNumber,
        })
      : await publicClient.simulateContract({
          address: quoter,
          abi: quoterAbi,
          functionName: "quoteExactInput",
          args: [candidate.path, amountIn],
          blockNumber,
        });
  const result = simulation.result as
    | readonly [bigint, bigint, number, bigint]
    | readonly [bigint, readonly bigint[], readonly number[], bigint];
  const amountOut = result[0];
  const gasEstimate = result[3];
  const gasCostUsdG = await dexGasCostUsdG(
    dexValuation,
    weth,
    reserve,
    gasPrice * gasEstimate,
    blockNumber,
  );
  const gasCostInOutput =
    candidate.route.tokenOut.toLowerCase() === reserve.toLowerCase()
      ? gasCostUsdG
      : (amountOut * gasCostUsdG) / amountIn;
  return {
    ...candidate,
    amountOut,
    gasEstimate,
    gasCostUsdG,
    score: amountOut > gasCostInOutput ? amountOut - gasCostInOutput : 0n,
  } satisfies Candidate;
}

async function bestRoute(
  tokenIn: Address,
  tokenOut: Address,
  amountIn: bigint,
  blockNumber: bigint,
  maximumTwapDeviationBps = 300,
) {
  const { d, venue: v } = venue();
  const reserve = d.assets?.find((asset) => asset.kind === "reserve");
  if (!reserve) throw new Error("reserve asset missing");
  const direct = v.pools.filter((pool) => hasPair(pool, tokenIn, tokenOut));
  const first = v.pools.filter((pool) => hasPair(pool, tokenIn, v.weth));
  const second = v.pools.filter((pool) => hasPair(pool, v.weth, tokenOut));
  const definitions: Omit<
    Candidate,
    "amountOut" | "gasEstimate" | "gasCostUsdG" | "score"
  >[] = direct.map((pool) => ({
    route: {
      tokenIn,
      tokenOut,
      intermediate: "0x0000000000000000000000000000000000000000",
      firstFee: pool.fee,
      secondFee: 0,
    },
    firstPool: pool.address,
    secondPool: null,
    path: encodePacked(
      ["address", "uint24", "address"],
      [tokenIn, pool.fee, tokenOut],
    ),
  }));
  for (const a of first) {
    for (const b of second) {
      definitions.push({
        route: {
          tokenIn,
          tokenOut,
          intermediate: v.weth,
          firstFee: a.fee,
          secondFee: b.fee,
        },
        firstPool: a.address,
        secondPool: b.address,
        path: encodePacked(
          ["address", "uint24", "address", "uint24", "address"],
          [tokenIn, a.fee, v.weth, b.fee, tokenOut],
        ),
      });
    }
  }
  if (!definitions.length) throw new Error("no approved DEX route");
  const pools = new Map(
    v.pools.map((pool) => [pool.address.toLowerCase(), pool]),
  );
  for (const definition of definitions) {
    await assertCanonicalPool(
      v.factory,
      pools.get(definition.firstPool.toLowerCase())!,
      blockNumber,
    );
    if (definition.secondPool) {
      await assertCanonicalPool(
        v.factory,
        pools.get(definition.secondPool.toLowerCase())!,
        blockNumber,
      );
    }
  }
  const gasPrice = await publicClient.getGasPrice();
  const settled = await Promise.allSettled(
    definitions.map((candidate) =>
      quoteCandidate(
        candidate,
        amountIn,
        v.quoter,
        d.dexValuationAdapter!,
        v.weth,
        reserve.address,
        gasPrice,
        blockNumber,
      ),
    ),
  );
  const candidates = settled
    .filter(
      (entry): entry is PromiseFulfilledResult<Candidate> =>
        entry.status === "fulfilled",
    )
    .map((entry) => entry.value)
    .sort(
      (a, b) =>
        Number(b.score > a.score) - Number(b.score < a.score) ||
        a.path.localeCompare(b.path),
    );
  if (!candidates.length) throw new Error("all approved DEX routes failed");
  const rejectedRoutes = settled.flatMap((entry, index) =>
    entry.status === "rejected"
      ? [
          {
            path: definitions[index].path,
            firstPool: definitions[index].firstPool,
            secondPool: definitions[index].secondPool,
            reason:
              entry.reason instanceof Error
                ? entry.reason.message
                : String(entry.reason),
          } satisfies RejectedRoute,
        ]
      : [],
  );
  const selected = candidates[0];
  const [twapAmountOut, twapValid] = await publicClient.readContract({
    address: d.dexValuationAdapter!,
    abi: dexMarkAbi,
    functionName: "quoteAmount",
    args: [tokenIn, tokenOut, amountIn],
    blockNumber,
  });
  if (!twapValid || twapAmountOut === 0n)
    throw new Error("DEX TWAP mark unavailable");
  const difference =
    selected.amountOut > twapAmountOut
      ? selected.amountOut - twapAmountOut
      : twapAmountOut - selected.amountOut;
  const priceImpactBps = Number((difference * 10_000n) / twapAmountOut);
  if (priceImpactBps > maximumTwapDeviationBps)
    throw new Error(
      `exact quote exceeds the ${maximumTwapDeviationBps / 100}% DEX TWAP limit`,
    );
  return { selected, twapAmountOut, priceImpactBps, rejectedRoutes };
}

function jsonPlan(
  selected: Candidate,
  amountIn: bigint,
  twapAmountOut: bigint,
  priceImpactBps: number,
  rejectedRoutes: RejectedRoute[],
  vault: Address,
  blockNumber: bigint,
  issuedAt: number,
  capacity: JsonDexSwapPlan["evidence"]["capacity"] = {
    maximumExposureUsdWad: null,
    projectedExposureUsdWad: null,
    utilizationBps: null,
  },
): JsonDexSwapPlan {
  const expiresAt = issuedAt + 30;
  return {
    plan: {
      route: selected.route,
      amountIn: amountIn.toString(),
      quotedAmountOut: selected.amountOut.toString(),
      minimumAmountOut: ((selected.amountOut * 9_900n) / 10_000n).toString(),
      recipient: vault,
      issuedAt: issuedAt.toString(),
      deadline: expiresAt.toString(),
      referenceBlock: blockNumber.toString(),
    },
    evidence: {
      firstPool: selected.firstPool,
      secondPool: selected.secondPool,
      quoteBlock: blockNumber.toString(),
      expiresAt,
      gasEstimate: selected.gasEstimate.toString(),
      estimatedGasCostUsdG: selected.gasCostUsdG.toString(),
      twapAmountOut: twapAmountOut.toString(),
      priceImpactBps,
      capacity,
      path: selected.path,
      rejectedRoutes: rejectedRoutes.map((route) => ({
        ...route,
        path: route.path,
      })),
    },
  };
}

export async function buildDexSwapPlans(
  action: "deposit" | "redeem",
  amount: bigint,
) {
  const { d } = venue();
  const state = await dashboard();
  const reserve = d.assets?.find((asset) => asset.kind === "reserve");
  if (!reserve) throw new Error("reserve asset missing");
  const quoteBlock = await publicClient.getBlock();
  const blockNumber = quoteBlock.number;
  const issuedAt = Number(quoteBlock.timestamp);
  const riskAssets = await orderedRiskAssets(d, blockNumber);
  const plans: JsonDexSwapPlan[] = [];
  if (action === "deposit") {
    const net = (amount * 9_900n) / 10_000n;
    const dust = net / 10_000n;
    for (const asset of riskAssets) {
      const weight = BigInt(state.currentWeightsBps[asset.symbol] ?? 0);
      const buyValue = (net * weight) / 10_000n;
      if (buyValue === 0n || buyValue <= dust) continue;
      const currentExposure = BigInt(state.holdingValues[asset.symbol] ?? "0");
      const maximumExposure = BigInt(asset.maximumExposureUsdWad ?? "0");
      const projectedExposure = currentExposure + buyValue;
      if (maximumExposure > 0n && projectedExposure > maximumExposure) {
        throw new Error(`${asset.symbol} DEX capacity would be exceeded`);
      }
      const quote = await bestRoute(
        reserve.address,
        asset.address,
        buyValue,
        blockNumber,
      );
      plans.push(
        jsonPlan(
          quote.selected,
          buyValue,
          quote.twapAmountOut,
          quote.priceImpactBps,
          quote.rejectedRoutes,
          d.basket,
          blockNumber,
          issuedAt,
          {
            maximumExposureUsdWad:
              maximumExposure > 0n ? maximumExposure.toString() : null,
            projectedExposureUsdWad: projectedExposure.toString(),
            utilizationBps:
              maximumExposure > 0n
                ? Number((projectedExposure * 10_000n) / maximumExposure)
                : null,
          },
        ),
      );
    }
  } else {
    const supply = BigInt(state.supply);
    if (amount === 0n || amount > supply)
      throw new Error("invalid redeem amount");
    for (const asset of riskAssets) {
      const balance = BigInt(state.holdings[asset.symbol] ?? "0");
      const tokenAmount = (balance * amount) / supply;
      if (tokenAmount === 0n) continue;
      const quote = await bestRoute(
        asset.address,
        reserve.address,
        tokenAmount,
        blockNumber,
      );
      plans.push(
        jsonPlan(
          quote.selected,
          tokenAmount,
          quote.twapAmountOut,
          quote.priceImpactBps,
          quote.rejectedRoutes,
          d.basket,
          blockNumber,
          issuedAt,
        ),
      );
    }
  }
  const bundle = {
    schemaVersion: 1,
    action,
    amount: amount.toString(),
    quoteBlock: blockNumber.toString(),
    expiresAt: issuedAt + 30,
    plans,
  };
  await persistQuoteBundle(bundle, amount);
  return bundle;
}

export async function buildDexRebalancePlans(
  allocationById: Record<string, number>,
) {
  const { d } = venue();
  const state = await dashboard();
  const reserve = d.assets?.find((asset) => asset.kind === "reserve");
  if (!reserve) throw new Error("reserve asset missing");
  const targetAssets = d.assets!.map((asset) => asset.address);
  const weights = d.assets!.map((asset) => allocationById[asset.id] ?? 0);
  if (weights.reduce((sum, weight) => sum + weight, 0) !== 10_000) {
    throw new Error("rebalance allocation does not total 10000");
  }
  const totalNav = BigInt(state.nav);
  const dust = totalNav / 10_000n;
  const quoteBlock = await publicClient.getBlock();
  const blockNumber = quoteBlock.number;
  const issuedAt = Number(quoteBlock.timestamp);
  const riskAssets = await orderedRiskAssets(d, blockNumber);
  const plans: JsonDexSwapPlan[] = [];
  for (const asset of riskAssets) {
    const currentValue = BigInt(state.holdingValues[asset.symbol] ?? "0");
    const targetValue =
      (totalNav * BigInt(allocationById[asset.id] ?? 0)) / 10_000n;
    if (currentValue <= targetValue || currentValue - targetValue <= dust)
      continue;
    const balance = BigInt(state.holdings[asset.symbol] ?? "0");
    const tokenAmount =
      currentValue === 0n
        ? 0n
        : (balance * (currentValue - targetValue)) / currentValue;
    if (tokenAmount === 0n) continue;
    const quote = await bestRoute(
      asset.address,
      reserve.address,
      tokenAmount,
      blockNumber,
    );
    plans.push(
      jsonPlan(
        quote.selected,
        tokenAmount,
        quote.twapAmountOut,
        quote.priceImpactBps,
        quote.rejectedRoutes,
        d.basket,
        blockNumber,
        issuedAt,
      ),
    );
  }
  for (const asset of riskAssets) {
    const currentValue = BigInt(state.holdingValues[asset.symbol] ?? "0");
    const targetValue =
      (totalNav * BigInt(allocationById[asset.id] ?? 0)) / 10_000n;
    const maximumExposure = BigInt(asset.maximumExposureUsdWad ?? "0");
    if (maximumExposure > 0n && targetValue > maximumExposure) {
      throw new Error(`${asset.symbol} target exceeds proven DEX capacity`);
    }
    if (targetValue <= currentValue || targetValue - currentValue <= dust)
      continue;
    const reserveIn =
      ((targetValue - currentValue) * 10n ** BigInt(reserve.decimals)) /
      10n ** 18n;
    if (reserveIn === 0n) continue;
    const quote = await bestRoute(
      reserve.address,
      asset.address,
      reserveIn,
      blockNumber,
    );
    plans.push(
      jsonPlan(
        quote.selected,
        reserveIn,
        quote.twapAmountOut,
        quote.priceImpactBps,
        quote.rejectedRoutes,
        d.basket,
        blockNumber,
        issuedAt,
        {
          maximumExposureUsdWad:
            maximumExposure > 0n ? maximumExposure.toString() : null,
          projectedExposureUsdWad: targetValue.toString(),
          utilizationBps:
            maximumExposure > 0n
              ? Number((targetValue * 10_000n) / maximumExposure)
              : null,
        },
      ),
    );
  }
  const bundle = {
    schemaVersion: 1,
    action: "rebalance" as const,
    targetAssets,
    weights,
    quoteBlock: blockNumber.toString(),
    expiresAt: issuedAt + 30,
    plans,
  };
  await persistQuoteBundle(bundle, totalNav);
  return bundle;
}

async function persistQuoteBundle(
  bundle: {
    action: "deposit" | "redeem" | "rebalance";
    quoteBlock: string;
    expiresAt: number;
    plans: JsonDexSwapPlan[];
  },
  amount: bigint,
) {
  const quoteHash = keccak256(stringToHex(stableDecisionJson(bundle)));
  await persistDexQuoteBundle({
    quoteHash,
    createdAt: new Date(
      Number(bundle.plans[0]?.plan.issuedAt ?? bundle.expiresAt - 30) * 1_000,
    ).toISOString(),
    action: bundle.action,
    amount: amount.toString(),
    quoteBlock: bundle.quoteBlock,
    expiresAt: new Date(bundle.expiresAt * 1_000).toISOString(),
    selectedRoutes: bundle.plans.map((entry) => entry.evidence),
    rejectedRoutes: bundle.plans.flatMap(
      (entry) => entry.evidence.rejectedRoutes,
    ),
    bundle,
  });
}

export async function collectDexMarketObservations() {
  const { d } = venue();
  const reserve = d.assets?.find((asset) => asset.kind === "reserve");
  if (!reserve) throw new Error("reserve asset missing");
  const block = await publicClient.getBlock();
  const observedAt = new Date(Number(block.timestamp) * 1_000).toISOString();
  const assets = await orderedRiskAssets(d, block.number);
  const observations = [];
  for (const asset of assets) {
    const unit = 10n ** BigInt(asset.decimals);
    const sellUnit = await bestRoute(
      asset.address,
      reserve.address,
      unit,
      block.number,
      10_000,
    );
    const qualificationUsdG = 25_000n * 10n ** BigInt(reserve.decimals);
    const buy = await bestRoute(
      reserve.address,
      asset.address,
      qualificationUsdG,
      block.number,
      10_000,
    );
    const sellAmount = (qualificationUsdG * unit) / sellUnit.twapAmountOut;
    const sell = await bestRoute(
      asset.address,
      reserve.address,
      sellAmount,
      block.number,
      10_000,
    );
    const [liquidity, slot0] = await Promise.all([
      publicClient.readContract({
        address: sellUnit.selected.firstPool,
        abi: poolStateAbi,
        functionName: "liquidity",
        blockNumber: block.number,
      }),
      publicClient.readContract({
        address: sellUnit.selected.firstPool,
        abi: poolStateAbi,
        functionName: "slot0",
        blockNumber: block.number,
      }),
    ]);
    const twapPrice = formatUnits(sellUnit.twapAmountOut, reserve.decimals);
    const spotPrice = formatUnits(
      sellUnit.selected.amountOut,
      reserve.decimals,
    );
    const serializeCandidate = (candidate: Candidate) => ({
      route: candidate.route,
      firstPool: candidate.firstPool,
      secondPool: candidate.secondPool,
      path: candidate.path,
      amountOut: candidate.amountOut.toString(),
      gasEstimate: candidate.gasEstimate.toString(),
      gasCostUsdG: candidate.gasCostUsdG.toString(),
      score: candidate.score.toString(),
    });
    const route = {
      selected: serializeCandidate(sellUnit.selected),
      rejected: sellUnit.rejectedRoutes,
      qualificationBuy: serializeCandidate(buy.selected),
      qualificationSell: serializeCandidate(sell.selected),
    };
    const sourceHash = keccak256(
      stringToHex(
        stableDecisionJson({
          symbol: asset.symbol,
          block: block.number.toString(),
          twapPrice,
          spotPrice,
          liquidity: liquidity.toString(),
          observationCardinality: slot0[3],
          buyImpactBps: buy.priceImpactBps,
          sellImpactBps: sell.priceImpactBps,
          route,
        }),
      ),
    );
    await persistDexPoolObservation({
      symbol: asset.symbol,
      poolAddress: sellUnit.selected.firstPool,
      observedAt,
      blockNumber: block.number.toString(),
      twapPriceUsdG: twapPrice,
      spotPriceUsdG: spotPrice,
      liquidityRaw: liquidity.toString(),
      observationCardinality: slot0[3],
      buyImpactBps: buy.priceImpactBps,
      sellImpactBps: sell.priceImpactBps,
      route,
      valid:
        slot0[3] >= 2 &&
        buy.priceImpactBps <= 100 &&
        sell.priceImpactBps <= 100,
      sourceHash,
    });
    observations.push({
      symbol: asset.symbol,
      twapPrice,
      spotPrice,
      buyImpactBps: buy.priceImpactBps,
      sellImpactBps: sell.priceImpactBps,
      liquidity: liquidity.toString(),
      observationCardinality: slot0[3],
      valid:
        slot0[3] >= 2 &&
        buy.priceImpactBps <= 100 &&
        sell.priceImpactBps <= 100,
      sourceHash,
    });
  }
  return { observedAt, blockNumber: block.number.toString(), observations };
}

export function reviveDexSwapPlans(plans: JsonDexSwapPlan[]) {
  return plans.map((entry) => ({
    plan: {
      ...entry.plan,
      amountIn: BigInt(entry.plan.amountIn),
      quotedAmountOut: BigInt(entry.plan.quotedAmountOut),
      minimumAmountOut: BigInt(entry.plan.minimumAmountOut),
      issuedAt: BigInt(entry.plan.issuedAt),
      deadline: BigInt(entry.plan.deadline),
      referenceBlock: BigInt(entry.plan.referenceBlock),
    },
  }));
}
