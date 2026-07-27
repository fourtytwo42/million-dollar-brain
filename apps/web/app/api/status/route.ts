import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { isAddress, parseUnits } from "viem";
import { dashboard } from "@/lib/chain";
import { DATA_AVAILABILITY } from "@/lib/market-context";
import { databaseHealth } from "@/lib/persistence";
import {
  latestMarketFeatures,
  marketDataHealth,
  REFERENCE_UNIVERSE,
} from "@/lib/market-history";
import {
  buildPortfolioAccounting,
  decisionOutcomeMap,
} from "@/lib/portfolio-accounting";

export const runtime = "nodejs";
function depositAmount(value: string) {
  try {
    return parseUnits(value || "0", 18);
  } catch {
    return 0n;
  }
}
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
    const deposit = request.nextUrl.searchParams.get("deposit") ?? "1000";
    const history = cycleHistory();
    const [current, persistence, marketData, features, outcomes] =
      await Promise.all([
        dashboard(
          address && isAddress(address) ? address : undefined,
          depositAmount(deposit),
        ),
        databaseHealth(),
        marketDataHealth(),
        latestMarketFeatures(),
        decisionOutcomeMap(),
      ]);
    const portfolioAccounting = await buildPortfolioAccounting(current);
    const enrichedHistory = history.map((cycle) => ({
      ...cycle,
      maturedOutcomes: cycle.inputHash
        ? (outcomes[cycle.inputHash] ?? null)
        : null,
    }));
    const latestPrice = BigInt(current.navPerShare);
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const prior = history.find(
      (cycle) =>
        Date.parse(cycle.at) <= cutoff &&
        typeof cycle?.portfolioAfter?.navPerShareWad === "string",
    );
    const priorPrice = prior
      ? BigInt(prior.portfolioAfter.navPerShareWad)
      : null;
    const navChange24hBps =
      priorPrice && priorPrice > 0n
        ? Number(((latestPrice - priorPrice) * 10_000n) / priorPrice)
        : null;
    return NextResponse.json({
      ...current,
      navChange24hBps,
      dataAvailability:
        history[0]?.decisionContext?.dataAvailability ?? DATA_AVAILABILITY,
      persistence,
      marketData,
      marketFeatures: features,
      portfolioAccounting,
      benchmarks: REFERENCE_UNIVERSE.map((symbol) => ({
        symbol,
        executable: false,
        features: features[symbol] ?? null,
      })),
      latestOutcome:
        (history[0]?.inputHash && outcomes[history[0].inputHash]) ??
        history[0]?.decisionContext?.decisionOutcomes ??
        null,
      latestCycle: enrichedHistory[0] ?? null,
      cycleHistory: enrichedHistory,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "status unavailable" },
      { status: 503 },
    );
  }
}
