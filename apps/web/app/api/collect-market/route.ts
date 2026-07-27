import { NextRequest, NextResponse } from "next/server";
import { dashboard } from "@/lib/chain";
import { collectOfficialMarketData } from "@/lib/market-history";
import {
  matureDecisionOutcomes,
  syncVaultLedger,
} from "@/lib/portfolio-accounting";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const expected =
    process.env.MDB_COLLECTOR_TOKEN ?? process.env.MDB_CYCLE_TOKEN;
  const token = request.headers.get("x-mdb-collector-token");
  if (expected && token !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const state = await dashboard();
    const [market, ledger] = await Promise.all([
      collectOfficialMarketData(state),
      syncVaultLedger(),
    ]);
    const outcomes = await matureDecisionOutcomes();
    return NextResponse.json({ market, ledger, outcomes });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "collector failed" },
      { status: 500 },
    );
  }
}
