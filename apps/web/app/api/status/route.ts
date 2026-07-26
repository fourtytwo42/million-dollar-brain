import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { isAddress } from "viem";
import { dashboard } from "@/lib/chain";
import { DATA_AVAILABILITY } from "@/lib/market-context";

export const runtime = "nodejs";
function cycleHistory() {
  try {
    const file = `${process.env.MDB_STATE_DIR ?? "/home/hendo420/projects/million-dollar-brain/var"}/cycles.jsonl`;
    const contents = readFileSync(file, "utf8").trim();
    if (!contents) return [];
    return contents
      .split("\n")
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      })
      .slice(-50)
      .reverse();
  } catch {
    return [];
  }
}

export async function GET(request: NextRequest) {
  try {
    const address = request.nextUrl.searchParams.get("address");
    const history = cycleHistory();
    return NextResponse.json({
      ...(await dashboard(address && isAddress(address) ? address : undefined)),
      dataAvailability: DATA_AVAILABILITY,
      latestCycle: history[0] ?? null,
      cycleHistory: history,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "status unavailable" },
      { status: 503 },
    );
  }
}
