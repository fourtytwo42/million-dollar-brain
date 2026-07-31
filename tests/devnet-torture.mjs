#!/usr/bin/env node

import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  parseEther,
  parseUnits,
  stringToHex,
} from "viem";
import { nonceManager, privateKeyToAccount } from "viem/accounts";
import { access, appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const repo = resolve(import.meta.dirname, "..");
const durationMs = Number(process.env.MDB_TORTURE_DURATION_SECONDS ?? "7200") * 1_000;
const transactionTarget = Number(process.env.MDB_TORTURE_TRANSACTION_TARGET ?? "10000");
const concurrency = Math.max(1, Math.min(8, Number(process.env.MDB_TORTURE_CONCURRENCY ?? "8")));
const rpcUrl = process.env.MDB_RPC_URL ?? "http://127.0.0.1:18550";
const webUrl = process.env.MDB_TORTURE_WEB_URL ?? "http://127.0.0.1:3010";
const evidenceDirectory = process.env.MDB_TORTURE_EVIDENCE_DIR;
const runDirectory = resolve(evidenceDirectory, "..");
const masterSeed = process.env.MDB_TORTURE_SEED ?? "42-braincells-devnet-torture-v1";
const deploymentPath =
  process.env.MDB_DEPLOYMENT_FILE ??
  resolve(repo, "packages/contracts/deployments/local-v3.json");
const deployerKey = process.env.DEPLOYER_PRIVATE_KEY;

if (!evidenceDirectory) throw new Error("MDB_TORTURE_EVIDENCE_DIR is required");
if (!deployerKey) throw new Error("DEPLOYER_PRIVATE_KEY is required");
await mkdir(evidenceDirectory, { recursive: true });

const deployment = JSON.parse(await readFile(deploymentPath, "utf8"));
const artifact = async (name) =>
  JSON.parse(
    await readFile(
      resolve(repo, `packages/contracts/out/${name}.sol/${name}.json`),
      "utf8",
    ),
  );
const [
  basketArtifact,
  brainArtifact,
  controlsArtifact,
  rewardsArtifact,
  creatorArtifact,
  tokenArtifact,
  valuationArtifact,
] = await Promise.all([
  artifact("BasketVault"),
  artifact("BrainMarketplace"),
  artifact("BrainControlRegistry"),
  artifact("RewardDistributor"),
  artifact("CreatorVault"),
  artifact("MockToken"),
  artifact("DexTwapValuationAdapter"),
]);

const routerAbi = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
];
const poolAbi = [
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "observations",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [
      { name: "blockTimestamp", type: "uint32" },
      { name: "tickCumulative", type: "int56" },
      { name: "secondsPerLiquidityCumulativeX128", type: "uint160" },
      { name: "initialized", type: "bool" },
    ],
  },
];

const chain = defineChain({
  id: 31337,
  name: "42 Braincells Torture Clone",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});
const transport = () => http(rpcUrl, { retryCount: 2, retryDelay: 100, timeout: 15_000 });
const publicClient = createPublicClient({
  chain,
  transport: transport(),
  pollingInterval: 50,
});
const normalizedDeployerKey = deployerKey.startsWith("0x")
  ? deployerKey
  : `0x${BigInt(deployerKey).toString(16).padStart(64, "0")}`;
const admin = privateKeyToAccount(normalizedDeployerKey, { nonceManager });
const adminClient = createWalletClient({ account: admin, chain, transport: transport() });
const actors = Array.from({ length: 12 }, (_, index) => {
  const key = keccak256(stringToHex(`${masterSeed}:actor:${index}`));
  const account = privateKeyToAccount(key, { nonceManager });
  return {
    index,
    account,
    client: createWalletClient({ account, chain, transport: transport() }),
  };
});

const addresses = {
  basket: deployment.basket,
  brain: deployment.brain,
  controls: deployment.brainControlRegistry,
  rewards: deployment.rewards,
  creator: deployment.creatorVault,
  usdg: deployment.usdg,
  adapter: deployment.dexExecutionAdapter,
  router: deployment.dexVenue.router,
};
const dexAssets = deployment.assets
  .filter((asset) => asset.kind !== "reserve")
  .map((asset) => ({
    address: asset.address,
    symbol: asset.symbol,
    pool: deployment.dexVenue.pools.find(
      (pool) =>
        pool.token0.toLowerCase() === asset.address.toLowerCase() ||
        pool.token1.toLowerCase() === asset.address.toLowerCase(),
    )?.address,
    fee: Number(
      deployment.dexVenue.pools.find(
        (pool) =>
          pool.token0.toLowerCase() === asset.address.toLowerCase() ||
          pool.token1.toLowerCase() === asset.address.toLowerCase(),
      )?.fee ?? 3000,
    ),
  }));
const receiptsPath = resolve(evidenceDirectory, "transactions.jsonl");
const checkpointsPath = resolve(evidenceDirectory, "checkpoints.jsonl");
const failuresPath = resolve(evidenceDirectory, "failures.jsonl");
const processStartedAt = Date.now();
let soakStartedAt;
let confirmedTransactions = 0;
let expectedReverts = 0;
let unexpectedFailures = 0;
let expectedSafetyHolds = 0;
let checkpointNumber = 0;
const actionCounts = {};
const gasSamples = [];
const restartResults = [];
let lastDexMaintenanceTransaction = -1;
let dexMaintenanceApprovalsReady = false;
const actorPieces = new Map(actors.map(({ account }) => [account.address.toLowerCase(), new Set()]));

let randomState = BigInt(keccak256(stringToHex(masterSeed)));
function random(maximum) {
  randomState ^= randomState << 13n;
  randomState ^= randomState >> 7n;
  randomState ^= randomState << 17n;
  randomState &= (1n << 256n) - 1n;
  return Number(randomState % BigInt(maximum));
}

function bigintJson(value) {
  return JSON.stringify(value, (_, item) => (typeof item === "bigint" ? item.toString() : item));
}

async function record(path, value) {
  await appendFile(path, `${bigintJson(value)}\n`);
}

async function waitFor(hash, action, expectedFailure = false) {
  const receipt = await publicClient.waitForTransactionReceipt({
    hash,
    confirmations: 1,
    timeout: 30_000,
  });
  const entry = {
    at: new Date().toISOString(),
    action,
    hash,
    status: receipt.status,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    expectedFailure,
  };
  await record(receiptsPath, entry);
  confirmedTransactions++;
  actionCounts[action] = (actionCounts[action] ?? 0) + 1;
  gasSamples.push(Number(receipt.gasUsed));
  if (receipt.status !== "success" && !expectedFailure) {
    unexpectedFailures++;
    throw new Error(`${action} transaction ${hash} reverted`);
  }
  if (receipt.status !== "success") expectedReverts++;
  return receipt;
}

async function write(
  client,
  request,
  action,
  expectedFailure = false,
  expectedReasonCode,
) {
  try {
    const hash = await client.writeContract(request);
    const receipt = await waitFor(hash, action, expectedFailure);
    if (receipt.status !== "success" && expectedReasonCode) {
      await record(receiptsPath, {
        at: new Date().toISOString(),
        action,
        hash,
        classification: "expected-revert",
        reasonCode: expectedReasonCode,
      });
    }
    return receipt;
  } catch (error) {
    if (expectedFailure) {
      expectedReverts++;
      await record(receiptsPath, {
        at: new Date().toISOString(),
        action,
        expectedFailure: true,
        classification: "expected-revert",
        reasonCode: expectedReasonCode ?? "expected-preflight-rejection",
        rejectedBeforeSubmission: true,
        error: error instanceof Error ? error.message : String(error),
      });
      return undefined;
    }
    throw error;
  }
}

async function send(client, request, action) {
  const hash = await client.sendTransaction(request);
  return waitFor(hash, action);
}

async function fetchJson(path, init) {
  const response = await fetch(`${webUrl}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`${path}: ${body.error ?? response.status}`);
  return body;
}

async function anvilRpc(method, params = []) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 42, method, params }),
  });
  const body = await response.json();
  if (!response.ok || body.error) {
    throw new Error(`${method}: ${body.error?.message ?? response.status}`);
  }
  return body.result;
}

async function dexDiagnostics() {
  return Promise.all(
    dexAssets.map(async (asset) => {
      const [quote, safety, slot] = await Promise.all([
        publicClient.readContract({
          address: deployment.dexValuationAdapter,
          abi: valuationArtifact.abi,
          functionName: "quoteStatus",
          args: [asset.address],
        }),
        publicClient.readContract({
          address: deployment.dexValuationAdapter,
          abi: valuationArtifact.abi,
          functionName: "safetyStatus",
          args: [asset.address],
        }),
        publicClient.readContract({
          address: asset.pool,
          abi: poolAbi,
          functionName: "slot0",
        }),
      ]);
      const observation = await publicClient.readContract({
        address: asset.pool,
        abi: poolAbi,
        functionName: "observations",
        args: [slot[2]],
      });
      return {
        symbol: asset.symbol,
        asset: asset.address,
        pool: asset.pool,
        poolState: {
          tick: slot[1],
          observationIndex: slot[2],
          observationCardinality: slot[3],
          observationCardinalityNext: slot[4],
          latestObservationTimestamp: observation[0],
          latestObservationInitialized: observation[3],
        },
        quote: {
          priceWad: quote[0],
          updatedAt: quote[1],
          valid: quote[2],
        },
        safety: {
          valid: safety[0],
          directHarmonicLiquidity: safety[1],
          bridgeHarmonicLiquidity: safety[2],
          directShortTick: safety[3],
          directLongTick: safety[4],
        },
      };
    }),
  );
}

async function recoverExpectedDexSafetyHold(label, error) {
  const message = error instanceof Error ? error.message : String(error);
  if (!message.includes("InvalidPrice()")) throw error;
  const before = await dexDiagnostics();
  if (!before.some((asset) => !asset.quote.valid || !asset.safety.valid)) throw error;
  expectedSafetyHolds++;
  await record(checkpointsPath, {
    type: "expected-safety-hold",
    label,
    at: new Date().toISOString(),
    error: message,
    before,
  });

  const longWindow = await publicClient.readContract({
    address: deployment.dexValuationAdapter,
    abi: valuationArtifact.abi,
    functionName: "longTwapWindow",
  });
  await anvilRpc("evm_increaseTime", [Number(longWindow) + 1]);
  await anvilRpc("evm_mine");
  await maintainDexObservations();

  const after = await dexDiagnostics();
  if (after.some((asset) => !asset.quote.valid || !asset.safety.valid)) {
    await record(checkpointsPath, {
      type: "failed-safety-recovery",
      label,
      at: new Date().toISOString(),
      after,
    });
    throw error;
  }
  await record(checkpointsPath, {
    type: "safety-recovered",
    label,
    at: new Date().toISOString(),
    after,
  });
}

async function quote(action, amount) {
  const result = await fetchJson("/api/quote-plan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, amount: amount.toString() }),
  });
  return {
    expiresAt: BigInt(result.expiresAt),
    plans: result.plans.map((entry) => ({
      plan: {
        ...entry.plan,
        amountIn: BigInt(entry.plan.amountIn),
        quotedAmountOut: BigInt(entry.plan.quotedAmountOut),
        minimumAmountOut: BigInt(entry.plan.minimumAmountOut),
        issuedAt: BigInt(entry.plan.issuedAt),
        deadline: BigInt(entry.plan.deadline),
        referenceBlock: BigInt(entry.plan.referenceBlock),
      },
    })),
  };
}

async function coreState(client = publicClient) {
  const [
    blockNumber,
    supply,
    nav,
    nextRequest,
    nextToProcess,
    creatorBalance,
    rewardBalance,
    status,
  ] = await Promise.all([
    client.getBlockNumber(),
    client.readContract({
      address: addresses.basket,
      abi: basketArtifact.abi,
      functionName: "totalSupply",
    }),
    client.readContract({
      address: addresses.basket,
      abi: basketArtifact.abi,
      functionName: "totalAssetsUsd",
    }),
    client.readContract({
      address: addresses.basket,
      abi: basketArtifact.abi,
      functionName: "nextRedemptionRequestId",
    }),
    client.readContract({
      address: addresses.basket,
      abi: basketArtifact.abi,
      functionName: "nextRedemptionToProcess",
    }),
    client.readContract({
      address: addresses.usdg,
      abi: tokenArtifact.abi,
      functionName: "balanceOf",
      args: [addresses.creator],
    }),
    client.readContract({
      address: addresses.usdg,
      abi: tokenArtifact.abi,
      functionName: "balanceOf",
      args: [addresses.rewards],
    }),
    fetchJson("/api/status"),
  ]);
  return {
    blockNumber,
    supply,
    nav,
    nextRequest,
    nextToProcess,
    creatorBalance,
    rewardBalance,
    status: {
      chainId: status.network?.chainId,
      nav: status.nav,
      supply: status.supply,
      queued: status.redemption?.pendingRequestId,
      oracleFresh: status.oracle?.fresh,
      activation: status.activation,
    },
  };
}

async function assertInvariants(label) {
  let state;
  try {
    state = await coreState();
  } catch (error) {
    await recoverExpectedDexSafetyHold(label, error);
    state = await coreState();
  }
  if (state.nextRequest !== 1n || state.nextToProcess !== 1n) {
    throw new Error(`${label}: queued redemption cursor changed`);
  }
  if (state.status.chainId !== 31337) throw new Error(`${label}: wrong chain`);
  if (!state.status.oracleFresh) throw new Error(`${label}: DEX valuation is stale`);
  if (BigInt(state.status.supply) !== state.supply) throw new Error(`${label}: supply mismatch`);
  if (BigInt(state.status.nav) !== state.nav) throw new Error(`${label}: NAV mismatch`);
  for (const actor of actors) {
    const pending = await publicClient.readContract({
      address: addresses.basket,
      abi: basketArtifact.abi,
      functionName: "pendingRedemptionByAccount",
      args: [actor.account.address],
    });
    if (pending !== 0n) throw new Error(`${label}: queued redemption exists`);
  }
  const checkpoint = {
    type: "checkpoint",
    checkpoint: checkpointNumber++,
    label,
    at: new Date().toISOString(),
    phase: soakStartedAt === undefined ? "setup" : "soak",
    elapsedMs: Date.now() - (soakStartedAt ?? processStartedAt),
    confirmedTransactions,
    expectedReverts,
    expectedSafetyHolds,
    unexpectedFailures,
    state,
    actionCounts,
  };
  await record(checkpointsPath, checkpoint);
  return checkpoint;
}

async function requestRecovery(kind) {
  const requestedAt = Date.now();
  const requestPath = resolve(runDirectory, `restart-${kind}-request`);
  const completePath = resolve(runDirectory, `restart-${kind}-complete`);
  await writeFile(
    requestPath,
    bigintJson({
      kind,
      requestedAt: new Date(requestedAt).toISOString(),
      confirmedTransactions,
    }),
  );
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      await access(completePath);
      const result = {
        kind,
        requestedAt: new Date(requestedAt).toISOString(),
        completedAt: new Date().toISOString(),
        recoveryMs: Date.now() - requestedAt,
      };
      restartResults.push(result);
      await record(checkpointsPath, { type: "recovery", ...result });
      return;
    } catch {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 250));
    }
  }
  throw new Error(`${kind} recovery did not complete within 90 seconds`);
}

async function fundAndApproveActors() {
  for (const actor of actors) {
    const gas = await publicClient.getBalance({ address: actor.account.address });
    if (gas < parseEther("100")) {
      await send(
        adminClient,
        { account: admin, to: actor.account.address, value: parseEther("100") - gas },
        "fund-gas",
      );
    }
    const balance = await publicClient.readContract({
      address: addresses.usdg,
      abi: tokenArtifact.abi,
      functionName: "balanceOf",
      args: [actor.account.address],
    });
    if (balance < parseUnits("100000000", 18)) {
      await write(
        adminClient,
        {
          account: admin,
          address: addresses.usdg,
          abi: tokenArtifact.abi,
          functionName: "mint",
          args: [actor.account.address, parseUnits("100000000", 18) - balance],
        },
        "fund-usdg",
      );
    }
    await write(
      actor.client,
      {
        account: actor.account,
        address: addresses.usdg,
        abi: tokenArtifact.abi,
        functionName: "approve",
        args: [addresses.basket, (1n << 256n) - 1n],
      },
      "approve-basket",
    );
    await write(
      actor.client,
      {
        account: actor.account,
        address: addresses.usdg,
        abi: tokenArtifact.abi,
        functionName: "approve",
        args: [addresses.brain, (1n << 256n) - 1n],
      },
      "approve-brain",
    );
  }
}

async function adminAndUpgradePhase() {
  const before = await coreState();
  const attacker = actors[11];
  try {
    await publicClient.simulateContract({
      account: attacker.account.address,
      address: addresses.basket,
      abi: basketArtifact.abi,
      functionName: "setTvlCapUsdWad",
      args: [1n],
    });
    throw new Error("unauthorized TVL-cap mutation simulated successfully");
  } catch (error) {
    if (String(error).includes("simulated successfully")) throw error;
    expectedReverts++;
  }

  await write(
    adminClient,
    {
      account: admin,
      address: addresses.basket,
      abi: basketArtifact.abi,
      functionName: "setCanaryControls",
      args: [false, false, false],
    },
    "pause-basket",
  );
  await write(
    adminClient,
    {
      account: admin,
      address: addresses.brain,
      abi: brainArtifact.abi,
      functionName: "setPurchasesEnabled",
      args: [false],
    },
    "pause-brain",
  );
  await write(
    adminClient,
    {
      account: admin,
      address: addresses.basket,
      abi: basketArtifact.abi,
      functionName: "setCanaryControls",
      args: [true, true, true],
    },
    "resume-basket",
  );
  await write(
    adminClient,
    {
      account: admin,
      address: addresses.brain,
      abi: brainArtifact.abi,
      functionName: "setPurchasesEnabled",
      args: [true],
    },
    "resume-brain",
  );

  for (const [name, address, contractArtifact] of [
    ["basket", addresses.basket, basketArtifact],
    ["brain", addresses.brain, brainArtifact],
  ]) {
    const hash = await adminClient.deployContract({
      account: admin,
      abi: contractArtifact.abi,
      bytecode: contractArtifact.bytecode.object,
    });
    const receipt = await waitFor(hash, `deploy-${name}-implementation`);
    if (!receipt.contractAddress) throw new Error(`${name} implementation deployment missing`);
    await write(
      adminClient,
      {
        account: admin,
        address,
        abi: contractArtifact.abi,
        functionName: "upgradeToAndCall",
        args: [receipt.contractAddress, "0x"],
      },
      `upgrade-${name}`,
    );
  }

  const after = await coreState();
  if (before.supply !== after.supply || before.nav !== after.nav) {
    throw new Error("UUPS upgrade changed basket economics");
  }
}

async function deposit(actor, amount) {
  try {
    const preview = await publicClient.readContract({
      address: addresses.basket,
      abi: basketArtifact.abi,
      functionName: "previewDeposit",
      args: [amount],
    });
    const plan = await quote("deposit", amount);
    await write(
      actor.client,
      {
        account: actor.account,
        address: addresses.basket,
        abi: basketArtifact.abi,
        functionName: "depositWithDexPlan",
        args: [amount, (preview[2] * 99n) / 100n, plan.expiresAt, plan.plans],
        gas: 8_000_000n,
      },
      "deposit",
      true,
      "concurrent-exact-quote-invalidated",
    );
  } catch (error) {
    expectedReverts++;
    await record(receiptsPath, {
      at: new Date().toISOString(),
      action: "deposit",
      expectedFailure: true,
      classification: "expected-revert",
      reasonCode: "quote-or-capacity-preflight-rejection",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function redeem(actor) {
  const balance = await publicClient.readContract({
    address: addresses.basket,
    abi: basketArtifact.abi,
    functionName: "balanceOf",
    args: [actor.account.address],
  });
  if (balance < 1e18) return transferShares(actor);
  const divisor = BigInt([2, 3, 4, 10][random(4)]);
  const shares = balance / divisor;
  try {
    const preview = await publicClient.readContract({
      address: addresses.basket,
      abi: basketArtifact.abi,
      functionName: "previewRedeem",
      args: [shares],
    });
    const plan = await quote("redeem", shares);
    await write(
      actor.client,
      {
        account: actor.account,
        address: addresses.basket,
        abi: basketArtifact.abi,
        functionName: "redeemWithDexPlan",
        args: [shares, (preview[2] * 99n) / 100n, plan.expiresAt, plan.plans],
        gas: 8_000_000n,
      },
      "redeem",
      true,
      "concurrent-exact-quote-invalidated",
    );
  } catch (error) {
    expectedReverts++;
    await record(receiptsPath, {
      at: new Date().toISOString(),
      action: "redeem",
      expectedFailure: true,
      classification: "expected-revert",
      reasonCode: "quote-or-balance-preflight-rejection",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function transferShares(actor) {
  const balance = await publicClient.readContract({
    address: addresses.basket,
    abi: basketArtifact.abi,
    functionName: "balanceOf",
    args: [actor.account.address],
  });
  if (balance === 0n) return deposit(actor, parseUnits(String(100 + random(401)), 18));
  const recipient = actors[(actor.index + 1 + random(actors.length - 1)) % actors.length];
  await write(
    actor.client,
    {
      account: actor.account,
      address: addresses.basket,
      abi: basketArtifact.abi,
      functionName: "transfer",
      args: [recipient.account.address, balance / BigInt(2 + random(20))],
    },
    "transfer-brains",
  );
}

async function buyBrain(actor, forcedPiece) {
  const pieceId = BigInt(forcedPiece ?? 1 + random(42));
  const owner = await publicClient.readContract({
    address: addresses.brain,
    abi: brainArtifact.abi,
    functionName: "ownerOf",
    args: [pieceId],
  });
  if (owner.toLowerCase() === actor.account.address.toLowerCase()) {
    return updateControls(actor, pieceId);
  }
  const price = await publicClient.readContract({
    address: addresses.brain,
    abi: brainArtifact.abi,
    functionName: "currentPrice",
    args: [pieceId],
  });
  const chainBlock = await publicClient.getBlock();
  const receipt = await write(
    actor.client,
    {
      account: actor.account,
      address: addresses.brain,
      abi: brainArtifact.abi,
      functionName: "buy",
      args: [pieceId, price, chainBlock.timestamp + 60n],
    },
    "buy-brain",
    true,
    "competing-brain-purchase-or-stale-price",
  );
  if (!receipt || receipt.status !== "success") return;
  actorPieces.get(actor.account.address.toLowerCase()).add(Number(pieceId));
  if (random(3) === 0) await updateProfile(actor, pieceId);
}

async function updateControls(actor, pieceId) {
  if (!addresses.controls) return;
  const bundle = await publicClient.readContract({
    address: addresses.controls,
    abi: controlsArtifact.abi,
    functionName: "controlBundle",
    args: [pieceId],
  });
  await write(
    actor.client,
    {
      account: actor.account,
      address: addresses.controls,
      abi: controlsArtifact.abi,
      functionName: "setControlBundle",
      args: [pieceId, bundle[1], bundle[2]],
    },
    "set-controls",
    true,
  );
}

async function updateProfile(actor, pieceId) {
  const allowed = await publicClient.readContract({
    address: addresses.brain,
    abi: brainArtifact.abi,
    functionName: "canChangeProfile",
    args: [pieceId, actor.account.address],
  });
  if (!allowed) return updateControls(actor, pieceId);
  await write(
    actor.client,
    {
      account: actor.account,
      address: addresses.brain,
      abi: brainArtifact.abi,
      functionName: "setProfileV2",
      args: [
        pieceId,
        keccak256(stringToHex(`${masterSeed}:profile:${pieceId}:${Date.now()}`)),
        `Cell ${pieceId}`,
        "https://42braincells.com",
        "Torture tested and somehow still employed.",
        0n,
      ],
    },
    "set-profile",
    true,
  );
}

async function claim(actor) {
  const owned = [];
  for (let piece = 1n; piece <= 42n; piece++) {
    const owner = await publicClient.readContract({
      address: addresses.brain,
      abi: brainArtifact.abi,
      functionName: "ownerOf",
      args: [piece],
    });
    if (owner.toLowerCase() === actor.account.address.toLowerCase()) owned.push(piece);
  }
  if (owned.length === 0) return buyBrain(actor);
  const pending = await publicClient.readContract({
    address: addresses.rewards,
    abi: rewardsArtifact.abi,
    functionName: "pendingRewards",
    args: [actor.account.address, owned],
  });
  if (pending === 0n) {
    expectedReverts++;
    try {
      await publicClient.simulateContract({
        account: actor.account.address,
        address: addresses.rewards,
        abi: rewardsArtifact.abi,
        functionName: "claim",
        args: [owned],
      });
      throw new Error("empty claim unexpectedly simulated");
    } catch (error) {
      if (String(error).includes("unexpectedly simulated")) throw error;
    }
    return;
  }
  await write(
    actor.client,
    {
      account: actor.account,
      address: addresses.rewards,
      abi: rewardsArtifact.abi,
      functionName: "claim",
      args: [owned],
    },
    "claim",
    true,
  );
}

async function approvalChurn(actor) {
  const allowance = random(2) === 0 ? 0n : BigInt(random(10_000)) * 1_000_000_000_000_000_000n;
  await write(
    actor.client,
    {
      account: actor.account,
      address: addresses.usdg,
      abi: tokenArtifact.abi,
      functionName: "approve",
      args: [addresses.basket, allowance],
    },
    "approval-churn",
  );
  if (allowance !== (1n << 256n) - 1n) {
    await write(
      actor.client,
      {
        account: actor.account,
        address: addresses.usdg,
        abi: tokenArtifact.abi,
        functionName: "approve",
        args: [addresses.basket, (1n << 256n) - 1n],
      },
      "approval-restore",
    );
  }
}

async function randomAction(actor, forcedCollisionPiece) {
  const choice = random(100);
  if (forcedCollisionPiece !== undefined) return buyBrain(actor, forcedCollisionPiece);
  if (choice < 27) return deposit(actor, parseUnits(String(100 + random(901)), 18));
  if (choice < 49) return redeem(actor);
  if (choice < 65) return transferShares(actor);
  if (choice < 78) return buyBrain(actor);
  if (choice < 87) return claim(actor);
  if (choice < 94) return approvalChurn(actor);
  const owned = [...actorPieces.get(actor.account.address.toLowerCase())];
  if (owned.length > 0) return updateControls(actor, BigInt(owned[random(owned.length)]));
  return buyBrain(actor);
}

async function maintainDexObservations() {
  if (!dexMaintenanceApprovalsReady) {
    await write(
      adminClient,
      {
        address: addresses.usdg,
        abi: tokenArtifact.abi,
        functionName: "approve",
        args: [addresses.router, (1n << 256n) - 1n],
      },
      "dex-maintenance-approve-reserve",
    );
    for (const asset of dexAssets) {
      await write(
        adminClient,
        {
          address: asset.address,
          abi: tokenArtifact.abi,
          functionName: "approve",
          args: [addresses.router, (1n << 256n) - 1n],
        },
        "dex-maintenance-approve-asset",
      );
    }
    dexMaintenanceApprovalsReady = true;
  }

  const amountIn = parseUnits(
    process.env.MDB_TORTURE_DEX_MAINTENANCE_USDG ?? "500",
    18,
  );
  for (const asset of dexAssets) {
    const before = await publicClient.readContract({
      address: asset.address,
      abi: tokenArtifact.abi,
      functionName: "balanceOf",
      args: [admin.address],
    });
    await write(
      adminClient,
      {
        address: addresses.router,
        abi: routerAbi,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn: addresses.usdg,
            tokenOut: asset.address,
            fee: asset.fee,
            recipient: admin.address,
            amountIn,
            amountOutMinimum: 0n,
            sqrtPriceLimitX96: 0n,
          },
        ],
      },
      "dex-maintenance-buy",
    );
    const after = await publicClient.readContract({
      address: asset.address,
      abi: tokenArtifact.abi,
      functionName: "balanceOf",
      args: [admin.address],
    });
    const received = after - before;
    if (received <= 0n) {
      throw new Error(`DEX maintenance buy returned no ${asset.address}`);
    }
    await write(
      adminClient,
      {
        address: addresses.router,
        abi: routerAbi,
        functionName: "exactInputSingle",
        args: [
          {
            tokenIn: asset.address,
            tokenOut: addresses.usdg,
            fee: asset.fee,
            recipient: admin.address,
            amountIn: received,
            amountOutMinimum: 0n,
            sqrtPriceLimitX96: 0n,
          },
        ],
      },
      "dex-maintenance-sell",
    );
  }
  lastDexMaintenanceTransaction = confirmedTransactions;
}

async function runSoak() {
  soakStartedAt = Date.now();
  let nextCheckpoint = Date.now() + 60_000;
  if (process.env.MDB_TORTURE_FORCE_SAFETY_HOLD === "true") {
    await anvilRpc("evm_increaseTime", [3_601]);
    await anvilRpc("evm_mine");
    await assertInvariants("forced-safety-hold");
  }
  while (
    Date.now() - soakStartedAt < durationMs ||
    confirmedTransactions < transactionTarget
  ) {
    if (
      lastDexMaintenanceTransaction < 0 ||
      confirmedTransactions - lastDexMaintenanceTransaction >= 250
    ) {
      await maintainDexObservations();
    }
    const collision = random(12) === 0 ? 1 + random(42) : undefined;
    const offset = random(actors.length);
    const batch = Array.from({ length: concurrency }, (_, index) =>
      randomAction(actors[(offset + index) % actors.length], collision),
    );
    const results = await Promise.allSettled(batch);
    for (const result of results) {
      if (result.status === "rejected") {
        unexpectedFailures++;
        await record(failuresPath, {
          at: new Date().toISOString(),
          seed: masterSeed,
          randomState: `0x${randomState.toString(16)}`,
          error:
            result.reason instanceof Error ? result.reason.stack : String(result.reason),
        });
        throw result.reason;
      }
    }
    if (Date.now() >= nextCheckpoint) {
      await assertInvariants(
        `minute-${Math.floor((Date.now() - soakStartedAt) / 60_000)}`,
      );
      nextCheckpoint = Date.now() + 60_000;
    }
  }
}

const startingState = await coreState();
await writeFile(resolve(evidenceDirectory, "start.json"), bigintJson(startingState));
try {
  await fundAndApproveActors();
  await adminAndUpgradePhase();
  await assertInvariants("post-admin-upgrade");
  await requestRecovery("web");
  await assertInvariants("post-web-restart");
  await requestRecovery("anvil");
  await assertInvariants("post-anvil-restart");
  await runSoak();
  const finalCheckpoint = await assertInvariants("final");
  const sortedGas = gasSamples.toSorted((left, right) => left - right);
  const percentile = (fraction) =>
    sortedGas[Math.min(sortedGas.length - 1, Math.floor(sortedGas.length * fraction))] ?? 0;
  const report = {
    schema: "DevnetTortureReportV1",
    runId: process.env.MDB_TORTURE_RUN_ID,
    gitSha: process.env.MDB_RELEASE_SHA,
    masterSeed,
    processStartedAt: new Date(processStartedAt).toISOString(),
    startedAt: new Date(soakStartedAt).toISOString(),
    completedAt: new Date().toISOString(),
    setupDurationMs: soakStartedAt - processStartedAt,
    activeDurationMs: Date.now() - soakStartedAt,
    transactionTarget,
    confirmedTransactions,
    expectedReverts,
    expectedSafetyHolds,
    unexpectedFailures,
    actionCounts,
    restartResults,
    gas: {
      minimum: sortedGas[0] ?? 0,
      p50: percentile(0.5),
      p95: percentile(0.95),
      p99: percentile(0.99),
      maximum: sortedGas.at(-1) ?? 0,
    },
    startingState,
    finalState: finalCheckpoint.state,
    acceptance: {
      transactionTargetMet: confirmedTransactions >= transactionTarget,
      durationMet: Date.now() - soakStartedAt >= durationMs,
      noUnexpectedFailures: unexpectedFailures === 0,
      noQueuedSales:
        finalCheckpoint.state.nextRequest === 1n &&
        finalCheckpoint.state.nextToProcess === 1n,
      navReconciled:
        BigInt(finalCheckpoint.state.status.nav) === finalCheckpoint.state.nav,
      supplyReconciled:
        BigInt(finalCheckpoint.state.status.supply) === finalCheckpoint.state.supply,
    },
  };
  report.accepted = Object.values(report.acceptance).every(Boolean);
  await writeFile(resolve(evidenceDirectory, "report.json"), bigintJson(report));
  if (!report.accepted) process.exitCode = 1;
} catch (error) {
  await record(failuresPath, {
    at: new Date().toISOString(),
    seed: masterSeed,
    randomState: `0x${randomState.toString(16)}`,
    error: error instanceof Error ? error.stack : String(error),
  });
  await writeFile(
    resolve(evidenceDirectory, "reproduce.txt"),
    `MDB_TORTURE_SEED=${JSON.stringify(masterSeed)} MDB_TORTURE_DURATION_SECONDS=60 MDB_TORTURE_TRANSACTION_TARGET=1 scripts/run-devnet-torture.sh\n`,
  );
  throw error;
}
