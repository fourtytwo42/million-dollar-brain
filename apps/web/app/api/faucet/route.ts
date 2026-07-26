import { NextRequest, NextResponse } from "next/server";
import { isAddress, parseEther, parseUnits } from "viem";
import { adminClient, deployment, mintAbi, publicClient } from "@/lib/chain";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const { address } = await request.json().catch(() => ({}));
  if (!isAddress(address)) return NextResponse.json({ error: "A valid wallet address is required." }, { status: 400 });
  try {
    const d = deployment();
    const ethHash = await adminClient.sendTransaction({ to: address, value: parseEther("2") });
    const usdgHash = await adminClient.writeContract({ address: d.usdg, abi: mintAbi, functionName: "mint", args: [address, parseUnits("100000", 18)] });
    await Promise.all([publicClient.waitForTransactionReceipt({ hash: ethHash }), publicClient.waitForTransactionReceipt({ hash: usdgHash })]);
    return NextResponse.json({ ok: true, ethHash, usdgHash, amount: "100000" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "faucet failed" }, { status: 500 });
  }
}
