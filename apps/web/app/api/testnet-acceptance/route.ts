import { NextRequest, NextResponse } from "next/server";
import {
  createWalletClient,
  http,
  keccak256,
  parseEther,
  parseUnits,
  stringToHex,
} from "viem";
import { nonceManager, privateKeyToAccount } from "viem/accounts";
import {
  admin,
  adminClient,
  chain,
  dashboard,
  deployment,
  publicClient,
  waitForReliableTransactionReceipt,
} from "@/lib/chain";
import { basketAbi, brainAbi, erc20Abi, rewardAbi } from "@/lib/abi";
import { withAdminTransactionLock } from "@/lib/admin-transaction-lock";
import { buildTestnetSwapPlans, type JsonSwapPlan } from "@/lib/quote-planner";
import { networkConfig } from "@/lib/network";
import { syncLocalMarketPrices } from "@/lib/market-price-sync";
import { collectOfficialMarketData } from "@/lib/market-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function revivePlans(plans: JsonSwapPlan[]) {
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

async function write(
  client: typeof adminClient,
  request: Parameters<typeof adminClient.writeContract>[0],
) {
  const hash = await client.writeContract(request);
  const receipt = await waitForReliableTransactionReceipt(hash);
  if (receipt.status !== "success")
    throw new Error(`transaction ${hash} failed`);
  return hash;
}

function enduranceActor(secret: string, index: number) {
  const privateKey = keccak256(
    stringToHex(`${secret}:million-dollar-brain:endurance:${index % 3}`),
  );
  const account = privateKeyToAccount(privateKey, { nonceManager });
  return {
    account,
    client: createWalletClient({
      account,
      chain,
      transport: http(networkConfig.serverRpcUrl, {
        retryCount: 5,
        retryDelay: 1_000,
        timeout: 30_000,
      }),
    }),
  };
}

async function fundActor(
  actor: ReturnType<typeof enduranceActor>,
  usdg: `0x${string}`,
  decimals: number,
  transactions: Record<string, string>,
) {
  const minimumGas = parseEther("0.00025");
  const gasBalance = await publicClient.getBalance({
    address: actor.account.address,
  });
  if (gasBalance < minimumGas) {
    const hash = await adminClient.sendTransaction({
      to: actor.account.address,
      value: parseEther("0.001"),
    });
    await waitForReliableTransactionReceipt(hash);
    transactions.gasFunding = hash;
  }
  const balance = await publicClient.readContract({
    address: usdg,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [actor.account.address],
  });
  const minimumUsdg = parseUnits("5000", decimals);
  if (balance < minimumUsdg) {
    transactions.usdgFunding = await write(adminClient, {
      address: usdg,
      abi: erc20Abi,
      functionName: "transfer",
      args: [actor.account.address, parseUnits("10000", decimals)],
    });
  }
}

export async function POST(request: NextRequest) {
  const expected = process.env.MDB_CYCLE_TOKEN;
  if (
    !expected ||
    request.headers.get("x-mdb-cycle-token") !== expected ||
    networkConfig.mode !== "testnet"
  ) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  try {
    const input = (await request.json().catch(() => ({}))) as {
      scenario?: number;
    };
    const scenario =
      Number.isInteger(input.scenario) && Number(input.scenario) >= 0
        ? Number(input.scenario)
        : 0;
    await collectOfficialMarketData();
    await syncLocalMarketPrices();
    const result = await withAdminTransactionLock(async () => {
      const d = deployment();
      if (d.schemaVersion !== 3)
        throw new Error("V3 testnet deployment is not active");
      const reserve = d.assets?.find((asset) => asset.kind === "reserve");
      if (!reserve) throw new Error("reserve asset is unavailable");
      const actorIndex = scenario % 3;
      const actor = enduranceActor(expected, actorIndex);
      const otherActor = enduranceActor(expected, (actorIndex + 2) % 3);
      const transactions: Record<string, string> = {};
      await fundActor(actor, reserve.address, reserve.decimals, transactions);
      const before = await dashboard(actor.account.address);

      const unowned = before.pieces.filter((candidate) => candidate.unowned);
      const piece =
        (scenario % 2 === 1
          ? before.pieces.find(
              (candidate) =>
                candidate.owner.toLowerCase() ===
                otherActor.account.address.toLowerCase(),
            )
          : unowned[scenario % Math.max(1, unowned.length)]) ??
        before.pieces.find(
          (candidate) =>
            candidate.owner.toLowerCase() ===
            actor.account.address.toLowerCase(),
        ) ??
        unowned[0];
      if (!piece) throw new Error("no brain piece is available for acceptance");
      if (piece.owner.toLowerCase() !== actor.account.address.toLowerCase()) {
        const price = BigInt(piece.price);
        transactions.brainApproval = await write(actor.client, {
          address: d.usdg,
          abi: erc20Abi,
          functionName: "approve",
          args: [d.brain, price],
        });
        transactions.brainPurchase = await write(actor.client, {
          address: d.brain,
          abi: brainAbi,
          functionName: "buy",
          args: [
            BigInt(piece.id),
            price,
            BigInt(Math.floor(Date.now() / 1_000) + 300),
          ],
        });
      }

      const selectedPreset = scenario % 5;
      transactions.preset = await write(actor.client, {
        address: d.brain,
        abi: brainAbi,
        functionName: "setPreset",
        args: [BigInt(piece.id), selectedPreset],
      });

      const grossOptions = ["125", "250", "500", "1000"];
      const gross = parseUnits(
        grossOptions[scenario % grossOptions.length],
        reserve.decimals,
      );
      const depositPreview = await publicClient.readContract({
        address: d.basket,
        abi: basketAbi,
        functionName: "previewDeposit",
        args: [gross],
      });
      transactions.basketApproval = await write(actor.client, {
        address: d.usdg,
        abi: erc20Abi,
        functionName: "approve",
        args: [d.basket, gross],
      });
      const depositQuote = await buildTestnetSwapPlans("deposit", gross);
      transactions.buy = await write(actor.client, {
        address: d.basket,
        abi: basketAbi,
        functionName: "depositWithPlan",
        gas: 6_000_000n,
        args: [
          gross,
          (depositPreview[2] * 99n) / 100n,
          BigInt(depositQuote.expiresAt),
          revivePlans(depositQuote.plans),
        ],
      });

      const afterBuy = await dashboard(actor.account.address);
      const ownedShares = BigInt(afterBuy.shares);
      const sellDivisors = [10n, 4n, 2n];
      const sellShares =
        ownedShares / sellDivisors[scenario % sellDivisors.length];
      if (sellShares === 0n) throw new Error("buy did not mint MDBS");
      const redeemPreview = await publicClient.readContract({
        address: d.basket,
        abi: basketAbi,
        functionName: "previewRedeem",
        args: [sellShares],
      });
      const redeemQuote = await buildTestnetSwapPlans("redeem", sellShares);
      transactions.sell = await write(actor.client, {
        address: d.basket,
        abi: basketAbi,
        functionName: "redeemWithPlan",
        gas: 6_000_000n,
        args: [
          sellShares,
          (redeemPreview[2] * 99n) / 100n,
          BigInt(redeemQuote.expiresAt),
          revivePlans(redeemQuote.plans),
        ],
      });

      let oversizedSellRejected = false;
      try {
        await publicClient.simulateContract({
          account: actor.account.address,
          address: d.basket,
          abi: basketAbi,
          functionName: "redeemWithPlan",
          args: [
            ownedShares + 1n,
            0n,
            BigInt(Math.floor(Date.now() / 1_000) + 60),
            [],
          ],
        });
      } catch {
        oversizedSellRejected = true;
      }
      const beforeClaim = await dashboard(actor.account.address);
      if (BigInt(beforeClaim.rewards.pending) > 0n) {
        const ownedPieceIds = beforeClaim.pieces
          .filter(
            (candidate) =>
              candidate.owner.toLowerCase() ===
              actor.account.address.toLowerCase(),
          )
          .map((candidate) => BigInt(candidate.id));
        transactions.claim = await write(actor.client, {
          address: d.rewards,
          abi: rewardAbi,
          functionName: "claim",
          args: [ownedPieceIds],
        });
      }
      const after = await dashboard(actor.account.address);
      return {
        ok: true,
        network: networkConfig.networkLabel,
        scenario,
        actorIndex,
        actor: actor.account.address,
        pieceId: piece.id,
        purchaseType: transactions.brainPurchase
          ? piece.unowned
            ? "initial"
            : "resale"
          : "already-owned",
        grossUsdG: gross.toString(),
        sellShares: sellShares.toString(),
        transactions,
        assertions: {
          navPositive: BigInt(after.nav) > 0n,
          supplyPositive: BigInt(after.supply) > 0n,
          noQueuedSale: after.redemption.pendingRequestId === "0",
          oracleFresh: after.oracle.fresh,
          riskPositions: after.assets.filter(
            (asset) =>
              asset.kind !== "reserve" &&
              BigInt(after.holdings[asset.symbol] ?? "0") > 0n,
          ).length,
          preset: after.pieces.find((candidate) => candidate.id === piece.id)
            ?.preset,
          oversizedSellRejected,
          actorFunded: BigInt(after.walletUsdg) > 0n,
          accountingHash: keccak256(
            stringToHex(`${after.nav}:${after.supply}:${after.blockNumber}`),
          ),
        },
        state: {
          nav: after.nav,
          supply: after.supply,
          shares: after.shares,
          walletUsdg: after.walletUsdg,
          weightsBps: after.currentWeightsBps,
        },
      };
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "acceptance run failed",
      },
      { status: 500 },
    );
  }
}
