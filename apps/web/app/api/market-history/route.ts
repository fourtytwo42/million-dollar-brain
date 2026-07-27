import { NextRequest, NextResponse } from "next/server";
import { readMarketHistory, type MarketInterval } from "@/lib/market-history";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const symbol = request.nextUrl.searchParams.get("symbol") ?? "";
    const interval =
      (request.nextUrl.searchParams.get("interval") as MarketInterval) ?? "1h";
    const range = Number(request.nextUrl.searchParams.get("rangeDays") ?? "30");
    const candles = await readMarketHistory(symbol, interval, range);
    return NextResponse.json({
      symbol,
      interval,
      rangeDays: Math.max(1, Math.min(range, interval === "1m" ? 30 : 3650)),
      candles,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "history unavailable" },
      { status: 400 },
    );
  }
}
