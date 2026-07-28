import { NextRequest, NextResponse } from "next/server";
import { dashboard } from "@/lib/chain";
import { collectOfficialMarketData } from "@/lib/market-history";
import { syncLocalMarketPrices } from "@/lib/market-price-sync";
import {
  buildPortfolioAccounting,
  matureDecisionOutcomes,
  persistAccountingSnapshot,
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
    // Collection must be able to recover a deliberately fail-closed oracle.
    // The pre-sync dashboard adds useful chain metadata when prices are fresh,
    // but official quote collection does not depend on it.
    const before = await dashboard().catch(() => undefined);
    const market = await collectOfficialMarketData(before);
    const priceSync = await syncLocalMarketPrices();
    const ledger = await syncVaultLedger();
    const after = await dashboard();
    const accounting = await buildPortfolioAccounting(after);
    await persistAccountingSnapshot(accounting, after.blockNumber);
    const outcomes = await matureDecisionOutcomes();
    return NextResponse.json({
      market,
      priceSync,
      ledger,
      accounting,
      outcomes,
    });
  } catch (error) {
    console.error("Market collector failed", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "collector failed" },
      { status: 500 },
    );
  }
}
