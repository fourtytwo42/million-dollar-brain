import { NextRequest, NextResponse } from "next/server";
import {
  decisionOutcomeMap,
  portfolioPerformanceHistory,
} from "@/lib/portfolio-accounting";
import { readCycleHistory } from "@/lib/status-history";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const requested = Number(request.nextUrl.searchParams.get("limit") ?? "50");
  const limit = Number.isFinite(requested)
    ? Math.max(1, Math.min(requested, 100))
    : 50;
  const [history, outcomes, performanceHistory] = await Promise.all([
    Promise.resolve(readCycleHistory(limit)),
    decisionOutcomeMap(),
    portfolioPerformanceHistory(),
  ]);
  return NextResponse.json(
    {
      cycleHistory: history.map((cycle) => ({
        ...cycle,
        maturedOutcomes: cycle.inputHash
          ? (outcomes[cycle.inputHash] ?? null)
          : null,
      })),
      performanceHistory,
    },
    {
      headers: {
        "cache-control": "public, max-age=15, stale-while-revalidate=60",
      },
    },
  );
}
