import { randomUUID } from "node:crypto";
import {
  encodeFunctionData,
  keccak256,
  parseAbi,
  stringToHex,
  type Address,
  type Hex,
} from "viem";
import { admin, dashboard, deployment } from "./chain";
import { networkConfig } from "./network";

const mockVenueAbi = parseAbi([
  "function buy(address tokenOut,uint256 usdgIn,uint256 minimumTokenOut) returns (uint256)",
  "function sell(address tokenIn,uint256 tokenInAmount,uint256 minimumUsdgOut) returns (uint256)",
]);

const executionIntentTypes = {
  ExecutionIntent: [
    { name: "vault", type: "address" },
    { name: "tokenIn", type: "address" },
    { name: "tokenOut", type: "address" },
    { name: "amountIn", type: "uint256" },
    { name: "minimumAmountOut", type: "uint256" },
    { name: "recipient", type: "address" },
    { name: "target", type: "address" },
    { name: "allowanceTarget", type: "address" },
    { name: "callDataHash", type: "bytes32" },
    { name: "expiry", type: "uint256" },
    { name: "referenceBlock", type: "uint256" },
    { name: "nonce", type: "uint256" },
  ],
} as const;

type Intent = {
  vault: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  minimumAmountOut: bigint;
  recipient: Address;
  target: Address;
  allowanceTarget: Address;
  callDataHash: Hex;
  expiry: bigint;
  referenceBlock: bigint;
  nonce: bigint;
};

export type JsonSwapPlan = {
  intent: {
    [K in keyof Intent]: Intent[K] extends bigint ? string : Intent[K];
  };
  executionData: Hex;
  authorizerSignature: Hex;
};

function jsonPlan(
  intent: Intent,
  executionData: Hex,
  authorizerSignature: Hex,
): JsonSwapPlan {
  return {
    intent: Object.fromEntries(
      Object.entries(intent).map(([key, value]) => [
        key,
        typeof value === "bigint" ? value.toString() : value,
      ]),
    ) as JsonSwapPlan["intent"],
    executionData,
    authorizerSignature,
  };
}

async function signPlan(
  intent: Intent,
  executionData: Hex,
  executionAdapter: Address,
) {
  const authorizerSignature = await admin.signTypedData({
    domain: {
      name: "MillionDollarBrain Execution",
      version: "1",
      chainId: networkConfig.chainId,
      verifyingContract: executionAdapter,
    },
    types: executionIntentTypes,
    primaryType: "ExecutionIntent",
    message: intent,
  });
  return jsonPlan(intent, executionData, authorizerSignature);
}

function nonce(action: string, token: Address, amount: bigint, block: bigint) {
  return BigInt(
    keccak256(
      stringToHex(
        `${action}:${token.toLowerCase()}:${amount}:${block}:${Date.now()}:${randomUUID()}`,
      ),
    ),
  );
}

export async function buildTestnetSwapPlans(
  action: "deposit" | "redeem",
  amount: bigint,
) {
  const d = deployment();
  if (
    d.schemaVersion !== 3 ||
    !d.executionAdapter ||
    !d.assets?.length ||
    !d.quoteAuthorizer
  ) {
    throw new Error("V3 execution manifest is not active");
  }
  if (d.quoteAuthorizer.toLowerCase() !== admin.address.toLowerCase()) {
    throw new Error("configured quote authorizer is unavailable");
  }
  const state = await dashboard();
  const reserve = d.assets.find((asset) => asset.kind === "reserve");
  if (!reserve) throw new Error("reserve asset missing");
  const block = BigInt(state.blockNumber);
  const expiry = BigInt(Math.floor(Date.now() / 1_000) + 120);
  const plans: JsonSwapPlan[] = [];
  if (action === "deposit") {
    const net = (amount * 9_900n) / 10_000n;
    const beforeNav = BigInt(state.nav);
    const dust = net / 10_000n;
    for (const asset of d.assets.filter(
      (candidate) => candidate.kind !== "reserve",
    )) {
      const weight = BigInt(state.currentWeightsBps[asset.symbol] ?? 0);
      const buyValue = (net * weight) / 10_000n;
      if (buyValue === 0n || buyValue <= dust) continue;
      const price = BigInt(
        state.oracle.assets[asset.symbol]?.priceUsdWad ?? "0",
      );
      if (price === 0n) throw new Error(`${asset.symbol} has no valid price`);
      const minimumOut =
        (buyValue * 10n ** BigInt(asset.decimals) * 9_900n) / (price * 10_000n);
      const executionData = encodeFunctionData({
        abi: mockVenueAbi,
        functionName: "buy",
        args: [asset.address, buyValue, minimumOut],
      });
      const intent: Intent = {
        vault: d.basket,
        tokenIn: reserve.address,
        tokenOut: asset.address,
        amountIn: buyValue,
        minimumAmountOut: minimumOut,
        recipient: d.basket,
        target: d.router,
        allowanceTarget: d.router,
        callDataHash: keccak256(executionData),
        expiry,
        referenceBlock: block,
        nonce: nonce("deposit", asset.address, buyValue, block),
      };
      plans.push(await signPlan(intent, executionData, d.executionAdapter));
    }
    return {
      schemaVersion: 1,
      action,
      amount: amount.toString(),
      beforeNav: beforeNav.toString(),
      expiresAt: Number(expiry),
      plans,
    };
  }

  const supply = BigInt(state.supply);
  if (amount === 0n || amount > supply)
    throw new Error("invalid redeem amount");
  for (const asset of d.assets.filter(
    (candidate) => candidate.kind !== "reserve",
  )) {
    const balance = BigInt(state.holdings[asset.symbol] ?? "0");
    const tokenAmount = (balance * amount) / supply;
    if (tokenAmount === 0n) continue;
    const price = BigInt(state.oracle.assets[asset.symbol]?.priceUsdWad ?? "0");
    if (price === 0n) throw new Error(`${asset.symbol} has no valid price`);
    const expected = (tokenAmount * price) / 10n ** BigInt(asset.decimals);
    const minimumOut = (expected * 9_900n) / 10_000n;
    const executionData = encodeFunctionData({
      abi: mockVenueAbi,
      functionName: "sell",
      args: [asset.address, tokenAmount, minimumOut],
    });
    const intent: Intent = {
      vault: d.basket,
      tokenIn: asset.address,
      tokenOut: reserve.address,
      amountIn: tokenAmount,
      minimumAmountOut: minimumOut,
      recipient: d.basket,
      target: d.router,
      allowanceTarget: d.router,
      callDataHash: keccak256(executionData),
      expiry,
      referenceBlock: block,
      nonce: nonce("redeem", asset.address, tokenAmount, block),
    };
    plans.push(await signPlan(intent, executionData, d.executionAdapter));
  }
  return {
    schemaVersion: 1,
    action,
    amount: amount.toString(),
    expiresAt: Number(expiry),
    plans,
  };
}

export async function buildTestnetRebalancePlans(
  allocationById: Record<string, number>,
) {
  const d = deployment();
  if (
    d.schemaVersion !== 3 ||
    !d.executionAdapter ||
    !d.assets?.length ||
    !d.quoteAuthorizer
  ) {
    throw new Error("V3 execution manifest is not active");
  }
  if (d.quoteAuthorizer.toLowerCase() !== admin.address.toLowerCase()) {
    throw new Error("configured quote authorizer is unavailable");
  }
  const state = await dashboard();
  const reserve = d.assets.find((asset) => asset.kind === "reserve");
  if (!reserve) throw new Error("reserve asset missing");
  const risks = d.assets.filter((asset) => asset.kind !== "reserve");
  const targetAssets = d.assets.map((asset) => asset.address);
  const weights = d.assets.map((asset) => allocationById[asset.id] ?? 0);
  if (weights.reduce((sum, weight) => sum + weight, 0) !== 10_000) {
    throw new Error("rebalance allocation does not total 10000");
  }
  const totalNav = BigInt(state.nav);
  const dust = totalNav / 10_000n;
  const block = BigInt(state.blockNumber);
  const expiry = BigInt(Math.floor(Date.now() / 1_000) + 120);
  const plans: JsonSwapPlan[] = [];

  for (const asset of risks) {
    const currentValue = BigInt(state.holdingValues[asset.symbol] ?? "0");
    const targetValue =
      (totalNav * BigInt(allocationById[asset.id] ?? 0)) / 10_000n;
    if (currentValue <= targetValue || currentValue - targetValue <= dust)
      continue;
    const price = BigInt(state.oracle.assets[asset.symbol]?.priceUsdWad ?? "0");
    if (price === 0n) throw new Error(`${asset.symbol} has no valid price`);
    const tokenAmount =
      ((currentValue - targetValue) * 10n ** BigInt(asset.decimals)) / price;
    if (tokenAmount === 0n) continue;
    const expected = (tokenAmount * price) / 10n ** BigInt(asset.decimals);
    const minimumOut = (expected * 9_900n) / 10_000n;
    const executionData = encodeFunctionData({
      abi: mockVenueAbi,
      functionName: "sell",
      args: [asset.address, tokenAmount, minimumOut],
    });
    const intent: Intent = {
      vault: d.basket,
      tokenIn: asset.address,
      tokenOut: reserve.address,
      amountIn: tokenAmount,
      minimumAmountOut: minimumOut,
      recipient: d.basket,
      target: d.router,
      allowanceTarget: d.router,
      callDataHash: keccak256(executionData),
      expiry,
      referenceBlock: block,
      nonce: nonce("rebalance-sell", asset.address, tokenAmount, block),
    };
    plans.push(await signPlan(intent, executionData, d.executionAdapter));
  }

  for (const asset of risks) {
    const currentValue = BigInt(state.holdingValues[asset.symbol] ?? "0");
    const targetValue =
      (totalNav * BigInt(allocationById[asset.id] ?? 0)) / 10_000n;
    if (targetValue <= currentValue || targetValue - currentValue <= dust)
      continue;
    const buyValue = targetValue - currentValue;
    const price = BigInt(state.oracle.assets[asset.symbol]?.priceUsdWad ?? "0");
    if (price === 0n) throw new Error(`${asset.symbol} has no valid price`);
    const minimumOut =
      (buyValue * 10n ** BigInt(asset.decimals) * 9_900n) / (price * 10_000n);
    const executionData = encodeFunctionData({
      abi: mockVenueAbi,
      functionName: "buy",
      args: [asset.address, buyValue, minimumOut],
    });
    const intent: Intent = {
      vault: d.basket,
      tokenIn: reserve.address,
      tokenOut: asset.address,
      amountIn: buyValue,
      minimumAmountOut: minimumOut,
      recipient: d.basket,
      target: d.router,
      allowanceTarget: d.router,
      callDataHash: keccak256(executionData),
      expiry,
      referenceBlock: block,
      nonce: nonce("rebalance-buy", asset.address, buyValue, block),
    };
    plans.push(await signPlan(intent, executionData, d.executionAdapter));
  }

  return {
    schemaVersion: 1,
    action: "rebalance" as const,
    expiresAt: Number(expiry),
    targetAssets,
    weights,
    plans,
  };
}

export function reviveSwapPlans(plans: JsonSwapPlan[]) {
  return plans.map((plan) => ({
    intent: {
      ...plan.intent,
      amountIn: BigInt(plan.intent.amountIn),
      minimumAmountOut: BigInt(plan.intent.minimumAmountOut),
      expiry: BigInt(plan.intent.expiry),
      referenceBlock: BigInt(plan.intent.referenceBlock),
      nonce: BigInt(plan.intent.nonce),
    },
    executionData: plan.executionData,
    authorizerSignature: plan.authorizerSignature,
  }));
}
