import { NextResponse } from "next/server";
import { publicNetworkConfig } from "@/lib/network";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    ...publicNetworkConfig(),
    walletConnectProjectId:
      process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ??
      "5a4c41c8c461ca59724069d740760a2f",
    officialFaucetUrl: "https://faucet.testnet.chain.robinhood.com",
  });
}
