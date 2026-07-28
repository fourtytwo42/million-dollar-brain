import { readFileSync } from "node:fs";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const path =
    process.env.MDB_MAINNET_SHADOW_STATE ??
    "/home/hendo420/projects/million-dollar-brain/var/mainnet-shadow/state.json";
  try {
    const state = JSON.parse(readFileSync(path, "utf8"));
    return NextResponse.json(state, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        mode: "robinhood-mainnet-shadow",
        available: false,
        reason:
          error instanceof Error ? error.message : "shadow state unavailable",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
}
