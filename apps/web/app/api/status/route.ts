import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { isAddress } from "viem";
import { dashboard } from "@/lib/chain";
import { DATA_AVAILABILITY } from "@/lib/market-context";

export const runtime = "nodejs";
function latestCycle() {
  try {
    const file = `${process.env.MDB_STATE_DIR ?? "/home/hendo420/projects/million-dollar-brain/var"}/cycles.jsonl`;
    const lines = readFileSync(file, "utf8").trim().split("\n");
    return JSON.parse(lines.at(-1) ?? "null");
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    const address = request.nextUrl.searchParams.get("address");
    return NextResponse.json({
      ...(await dashboard(address && isAddress(address) ? address : undefined)),
      dataAvailability: DATA_AVAILABILITY,
      latestCycle: latestCycle(),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "status unavailable" },
      { status: 503 },
    );
  }
}
