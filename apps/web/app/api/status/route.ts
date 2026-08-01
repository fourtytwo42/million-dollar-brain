import { NextRequest, NextResponse } from "next/server";
import { readFileSync } from "node:fs";
import { isAddress, parseUnits } from "viem";
import { dashboard, deployment, deploymentAssets } from "@/lib/chain";
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
  portfolioPerformanceHistory,
} from "@/lib/portfolio-accounting";
import { localPriceSyncHealth } from "@/lib/market-price-sync";
import { releaseStatus } from "@/lib/release-status";
import { rpcFailoverHealth } from "@/lib/rpc-health";

export const runtime = "nodejs";
function tokenAmount(value: string, decimals = 18) {
  try {
    return parseUnits(value || "0", decimals);
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
    const sell = request.nextUrl.searchParams.get("sell");
    const reserveDecimals =
      deploymentAssets(deployment()).find((asset) => asset.kind === "reserve")
        ?.decimals ?? 18;
    const history = cycleHistory();
    const [
      current,
      persistence,
      marketData,
      features,
      outcomes,
      performanceHistory,
      priceSync,
      rpcHealth,
    ] = await Promise.all([
      dashboard(
        address && isAddress(address) ? address : undefined,
        tokenAmount(deposit, reserveDecimals),
        sell == null ? undefined : tokenAmount(sell),
      ),
      databaseHealth(),
      marketDataHealth(),
      latestMarketFeatures(),
      decisionOutcomeMap(),
      portfolioPerformanceHistory(),
      localPriceSyncHealth(),
      rpcFailoverHealth(),
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
      release: releaseStatus(current.activation),
      navChange24hBps,
      dataAvailability:
        history[0]?.decisionContext?.dataAvailability ?? DATA_AVAILABILITY,
      persistence,
      marketData,
      marketFeatures: features,
      portfolioAccounting,
      performanceHistory,
      priceSync,
      rpcHealth,
      rpcFailover: rpcHealth,
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
