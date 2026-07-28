import { NextRequest, NextResponse } from "next/server";
import { keccak256, parseUnits, stringToHex } from "viem";
import {
  admin,
  adminClient,
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

async function write(request: Parameters<typeof adminClient.writeContract>[0]) {
  const hash = await adminClient.writeContract(request);
  const receipt = await waitForReliableTransactionReceipt(hash);
  if (receipt.status !== "success")
    throw new Error(`transaction ${hash} failed`);
  return hash;
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
    await collectOfficialMarketData();
    await syncLocalMarketPrices();
    const result = await withAdminTransactionLock(async () => {
      const d = deployment();
      if (d.schemaVersion !== 3)
        throw new Error("V3 testnet deployment is not active");
      const before = await dashboard(admin.address);
      const transactions: Record<string, string> = {};

      const piece =
        before.pieces.find(
          (candidate) =>
            candidate.owner.toLowerCase() === admin.address.toLowerCase(),
        ) ?? before.pieces.find((candidate) => candidate.unowned);
      if (!piece) throw new Error("no brain piece is available for acceptance");
      if (piece.unowned) {
        const price = BigInt(piece.price);
        transactions.brainApproval = await write({
          address: d.usdg,
          abi: erc20Abi,
          functionName: "approve",
          args: [d.brain, price],
        });
        transactions.brainPurchase = await write({
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

      transactions.preset = await write({
        address: d.brain,
        abi: brainAbi,
        functionName: "setPreset",
        args: [BigInt(piece.id), 3],
      });

      const gross = parseUnits("1000", 18);
      const depositPreview = await publicClient.readContract({
        address: d.basket,
        abi: basketAbi,
        functionName: "previewDeposit",
        args: [gross],
      });
      transactions.basketApproval = await write({
        address: d.usdg,
        abi: erc20Abi,
        functionName: "approve",
        args: [d.basket, gross],
      });
      const depositQuote = await buildTestnetSwapPlans("deposit", gross);
      transactions.buy = await write({
        address: d.basket,
        abi: basketAbi,
        functionName: "depositWithPlan",
        args: [
          gross,
          (depositPreview[2] * 99n) / 100n,
          BigInt(depositQuote.expiresAt),
          revivePlans(depositQuote.plans),
        ],
      });

      const afterBuy = await dashboard(admin.address);
      const ownedShares = BigInt(afterBuy.shares);
      const sellShares = ownedShares / 10n;
      if (sellShares === 0n) throw new Error("buy did not mint MDBS");
      const redeemPreview = await publicClient.readContract({
        address: d.basket,
        abi: basketAbi,
        functionName: "previewRedeem",
        args: [sellShares],
      });
      const redeemQuote = await buildTestnetSwapPlans("redeem", sellShares);
      transactions.sell = await write({
        address: d.basket,
        abi: basketAbi,
        functionName: "redeemWithPlan",
        args: [
          sellShares,
          (redeemPreview[2] * 99n) / 100n,
          BigInt(redeemQuote.expiresAt),
          revivePlans(redeemQuote.plans),
        ],
      });

      const beforeClaim = await dashboard(admin.address);
      if (BigInt(beforeClaim.rewards.pending) > 0n) {
        transactions.claim = await write({
          address: d.rewards,
          abi: rewardAbi,
          functionName: "claim",
          args: [[BigInt(piece.id)]],
        });
      }
      const after = await dashboard(admin.address);
      return {
        ok: true,
        network: networkConfig.networkLabel,
        pieceId: piece.id,
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
