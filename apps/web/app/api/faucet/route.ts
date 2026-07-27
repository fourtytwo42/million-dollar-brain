import { NextRequest, NextResponse } from "next/server";
import { isAddress, parseEther, parseUnits } from "viem";
import { adminClient, deployment, mintAbi, publicClient } from "@/lib/chain";
import { networkConfig } from "@/lib/network";

export const runtime = "nodejs";

type RateRecord = { count: number; resetAt: number };
const rates = new Map<string, RateRecord>();
let dailyNativeWei = 0n;
let dailyResetAt = 0;

function takeRate(key: string, maximum: number, windowMs: number) {
  const now = Date.now();
  const current = rates.get(key);
  if (!current || current.resetAt <= now) {
    rates.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= maximum) return false;
  current.count += 1;
  return true;
}

export async function POST(request: NextRequest) {
  const { address } = await request.json().catch(() => ({}));
  if (!isAddress(address))
    return NextResponse.json(
      { error: "A valid wallet address is required." },
      { status: 400 },
    );
  if (!networkConfig.faucetEnabled || networkConfig.mode === "mainnet") {
    return NextResponse.json({ error: "Faucet unavailable." }, { status: 404 });
  }
  if (
    networkConfig.faucetLanOnly &&
    process.env.MDB_ALLOW_LAN_FAUCET !== "true"
  ) {
    return NextResponse.json(
      {
        error:
          "Automatic testnet funding is disabled. Use the official Robinhood Testnet faucet.",
        officialFaucetUrl: "https://faucet.testnet.chain.robinhood.com",
      },
      { status: 403 },
    );
  }
  const forwarded =
    request.headers.get("x-real-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "direct";
  if (
    !takeRate(
      `address:${networkConfig.chainId}:${address.toLowerCase()}`,
      1,
      60 * 60 * 1000,
    ) ||
    !takeRate(`ip:${networkConfig.chainId}:${forwarded}`, 5, 60 * 60 * 1000)
  ) {
    return NextResponse.json(
      { error: "Faucet limit reached. Try again later." },
      { status: 429 },
    );
  }
  try {
    const d = deployment();
    const nativeAmount =
      networkConfig.mode === "local"
        ? parseEther("2")
        : BigInt(
            process.env.MDB_TESTNET_FAUCET_NATIVE_WEI ?? "100000000000000",
          );
    if (Date.now() >= dailyResetAt) {
      dailyNativeWei = 0n;
      dailyResetAt = Date.now() + 24 * 60 * 60 * 1000;
    }
    const dailyCap = BigInt(
      process.env.MDB_TESTNET_FAUCET_DAILY_CAP_WEI ?? "1000000000000000",
    );
    const reserve = BigInt(
      process.env.MDB_TESTNET_OPERATOR_RESERVE_WEI ?? "5000000000000000",
    );
    const operatorBalance = await publicClient.getBalance({
      address: adminClient.account.address,
    });
    const sendNative =
      networkConfig.mode === "local" ||
      (dailyNativeWei + nativeAmount <= dailyCap &&
        operatorBalance >= reserve + nativeAmount);
    if (networkConfig.mode === "testnet" && !sendNative) {
      return NextResponse.json(
        {
          error:
            "The MDB testnet faucet is preserving its gas reserve. Use the official faucet.",
          officialFaucetUrl: "https://faucet.testnet.chain.robinhood.com",
        },
        { status: 503 },
      );
    }
    const ethHash = await adminClient.sendTransaction({
      to: address,
      value: nativeAmount,
    });
    const usdgHash = await adminClient.writeContract({
      address: d.usdg,
      abi: mintAbi,
      functionName: "mint",
      args: [address, parseUnits("100000", 18)],
    });
    await Promise.all([
      publicClient.waitForTransactionReceipt({ hash: ethHash }),
      publicClient.waitForTransactionReceipt({ hash: usdgHash }),
    ]);
    dailyNativeWei += nativeAmount;
    return NextResponse.json({
      ok: true,
      ethHash,
      usdgHash,
      amount: "100000",
      nativeWei: nativeAmount.toString(),
      network: networkConfig.networkLabel,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "faucet failed" },
      { status: 500 },
    );
  }
}
