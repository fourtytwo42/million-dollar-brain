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
  mintAbi,
  publicClient,
  waitForReliableTransactionReceipt,
} from "@/lib/chain";
import {
  basketAbi,
  brainAbi,
  brainControlAbi,
  erc20Abi,
  rewardAbi,
} from "@/lib/abi";
import { controlSpec, packAssetIds, packScalars } from "@/lib/brain-controls";
import { withAdminTransactionLock } from "@/lib/admin-transaction-lock";
import { buildDexSwapPlans, reviveDexSwapPlans } from "@/lib/quote-planner";
import { networkConfig } from "@/lib/network";
import { syncLocalMarketPrices } from "@/lib/market-price-sync";
import { collectOfficialMarketData } from "@/lib/market-history";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  requiredUsdg: bigint,
  transactions: Record<string, string>,
) {
  // Capacity V3 safety validation makes a full multi-leg buy approach 3M gas.
  // Retain a 4.5M transaction ceiling and enough balance for both sequential
  // operations without concentrating the shared endurance budget in one actor.
  const targetGas = parseEther("0.000125");
  const gasBalance = await publicClient.getBalance({
    address: actor.account.address,
  });
  if (gasBalance < targetGas) {
    const hash = await adminClient.sendTransaction({
      to: actor.account.address,
      value: targetGas - gasBalance,
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
  if (balance < requiredUsdg) {
    transactions.usdgFunding = await write(adminClient, {
      address: usdg,
      abi: mintAbi,
      functionName: "mint",
      args: [actor.account.address, requiredUsdg - balance],
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
      if ((d.schemaVersion ?? 0) < 3)
        throw new Error("dynamic testnet deployment is not active");
      const reserve = d.assets?.find((asset) => asset.kind === "reserve");
      if (!reserve) throw new Error("reserve asset is unavailable");
      const actorIndex = scenario % 3;
      const actor = enduranceActor(expected, actorIndex);
      const otherActor = enduranceActor(expected, (actorIndex + 2) % 3);
      const transactions: Record<string, string> = {};
      const before = await dashboard(actor.account.address);
      const grossOptions = ["125", "250", "500", "1000"];
      const gross = parseUnits(
        grossOptions[scenario % grossOptions.length],
        reserve.decimals,
      );

      const unowned = before.pieces.filter((candidate) => candidate.unowned);
      const resale = before.pieces.find(
        (candidate) =>
          !candidate.unowned &&
          candidate.owner.toLowerCase() !== actor.account.address.toLowerCase(),
      );
      const piece =
        (scenario % 2 === 0 && unowned.length > 0
          ? unowned[scenario % unowned.length]
          : before.pieces.find(
              (candidate) =>
                candidate.owner.toLowerCase() ===
                otherActor.account.address.toLowerCase(),
            )) ??
        resale ??
        unowned[0];
      if (!piece) throw new Error("no brain piece is available for acceptance");
      const brainPurchasePrice =
        piece.owner.toLowerCase() === actor.account.address.toLowerCase()
          ? 0n
          : BigInt(piece.price);
      const fundingBuffer = parseUnits("1000", reserve.decimals);
      await fundActor(
        actor,
        reserve.address,
        brainPurchasePrice + gross + fundingBuffer,
        transactions,
      );
      if (piece.owner.toLowerCase() !== actor.account.address.toLowerCase()) {
        transactions.brainApproval = await write(actor.client, {
          address: d.usdg,
          abi: erc20Abi,
          functionName: "approve",
          args: [d.brain, brainPurchasePrice],
        });
        transactions.brainPurchase = await write(actor.client, {
          address: d.brain,
          abi: brainAbi,
          functionName: "buy",
          args: [
            BigInt(piece.id),
            brainPurchasePrice,
            BigInt(Math.floor(Date.now() / 1_000) + 300),
          ],
        });
      }

      if (d.brainControlRegistry) {
        // Cadence pieces feed the autonomous scheduler. Exercise their next
        // control instead so an acceptance transaction cannot stretch the
        // review interval beyond the acceptance freshness window.
        const controlIndex = [4, 6, 38].includes(piece.id) ? 1 : 0;
        const control = controlSpec(piece.id).controls[controlIndex];
        const nextBundle = {
          ...piece.controlBundle,
          values: [...piece.controlBundle.values],
          assetIds: [...piece.controlBundle.assetIds],
        };
        if (piece.id === 42) {
          const shift = Math.min(5, nextBundle.values[1] ?? 0);
          nextBundle.values[0] += shift;
          nextBundle.values[1] -= shift;
        } else if (control.kind === "multi") {
          const optionCount = control.options?.length ?? 1;
          nextBundle.values[controlIndex] =
            1 << ((scenario + piece.id) % optionCount);
        } else {
          const optionCount =
            control.kind === "attention"
              ? (control.maximum ?? 0) + 1
              : (control.options?.length ?? 1);
          nextBundle.values[controlIndex] =
            ((nextBundle.values[controlIndex] ?? 0) + 1) % optionCount;
        }
        transactions.controls = await write(actor.client, {
          address: d.brainControlRegistry,
          abi: brainControlAbi,
          functionName: "setControlBundle",
          args: [
            BigInt(piece.id),
            packScalars(nextBundle.values),
            packAssetIds(nextBundle.assetIds),
          ],
        });
      } else {
        const selectedPreset = scenario % 5;
        transactions.preset = await write(actor.client, {
          address: d.brain,
          abi: brainAbi,
          functionName: "setPreset",
          args: [BigInt(piece.id), selectedPreset],
        });
      }

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
      const depositQuote = await buildDexSwapPlans("deposit", gross);
      transactions.buy = await write(actor.client, {
        address: d.basket,
        abi: basketAbi,
        functionName: "depositWithDexPlan",
        gas: 4_500_000n,
        args: [
          gross,
          (depositPreview[2] * 99n) / 100n,
          BigInt(depositQuote.expiresAt),
          reviveDexSwapPlans(depositQuote.plans),
        ],
      });

      const afterBuy = await dashboard(actor.account.address);
      const ownedShares = BigInt(afterBuy.shares);
      const sellDivisors = [10n, 4n, 2n];
      const sellShares =
        ownedShares / sellDivisors[scenario % sellDivisors.length];
      if (sellShares === 0n) throw new Error("buy did not mint BRAINS");
      const redeemPreview = await publicClient.readContract({
        address: d.basket,
        abi: basketAbi,
        functionName: "previewRedeem",
        args: [sellShares],
      });
      const redeemQuote = await buildDexSwapPlans("redeem", sellShares);
      transactions.sell = await write(actor.client, {
        address: d.basket,
        abi: basketAbi,
        functionName: "redeemWithDexPlan",
        gas: 4_500_000n,
        args: [
          sellShares,
          (redeemPreview[2] * 99n) / 100n,
          BigInt(redeemQuote.expiresAt),
          reviveDexSwapPlans(redeemQuote.plans),
        ],
      });

      let oversizedSellRejected = false;
      try {
        await publicClient.simulateContract({
          account: actor.account.address,
          address: d.basket,
          abi: basketAbi,
          functionName: "redeemWithDexPlan",
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
