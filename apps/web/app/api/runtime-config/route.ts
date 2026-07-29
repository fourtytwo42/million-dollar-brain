import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { networkConfig, publicNetworkConfig } from "@/lib/network";

export const runtime = "nodejs";

export async function GET() {
  const deploymentManifestHash = existsSync(networkConfig.deploymentFile)
    ? createHash("sha256")
        .update(readFileSync(networkConfig.deploymentFile))
        .digest("hex")
    : null;
  return NextResponse.json({
    ...publicNetworkConfig(),
    releaseSha: process.env.MDB_RELEASE_SHA ?? "unrecorded",
    deploymentManifestHash,
    walletConnectProjectId:
      process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ??
      "5a4c41c8c461ca59724069d740760a2f",
    officialFaucetUrl: "https://faucet.testnet.chain.robinhood.com",
  });
}
