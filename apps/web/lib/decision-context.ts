import { readFileSync } from "node:fs";
import { keccak256, stringToHex, type Address } from "viem";
import {
  coinbaseEthCandles,
  fredMacro,
  latestSecFact,
  robinhoodStockData,
  secCompanyFacts,
  type SourceValue,
} from "./market-sources";
import { recentPortfolioSnapshots } from "./persistence";
import {
  collectOfficialMarketData,
  latestMarketFeatures,
  REFERENCE_UNIVERSE,
  type DataCoverageV1,
  type MarketFeatureSetV1,
} from "./market-history";
import {
  buildPortfolioAccounting,
  emptyDecisionOutcomes,
  type DecisionOutcomeV2,
  type PortfolioAccountingV1,
} from "./portfolio-accounting";
import { calculateCandleMetrics, stableDecisionJson } from "./decision-math";
export { calculateCandleMetrics, stableDecisionJson } from "./decision-math";

export type SourceStamp = {
  source: string;
  observationTime: string | null;
  retrievalTime: string;
  expiryTime: string;
  formulaVersion: string;
  hash: string;
  valid: boolean;
  error?: string;
};

export type AssetDossierV2 = {
  symbol: string;
  identity: {
    contract: Address;
    robinhoodUid: string | null;
    assetClass: "stable" | "equity" | "crypto";
    tags: string[];
    executable: true;
    permissions: { buy: boolean; sell: boolean; halted: boolean };
  };
  portfolio: {
    balanceWad: string;
    valueUsdWad: string;
    weightBps: number;
    costBasisUsdWad: string | null;
    realizedPnlUsdWad: string | null;
    unrealizedPnlUsdWad: string | null;
  };
  quote: {
    bidUsd: number | null;
    askUsd: number | null;
    midpointUsd: number | null;
    spreadBps: number | null;
    volume24h: number | null;
    priceAgeSeconds: number | null;
    oraclePriceUsdWad: string;
    oracleTimestamp: number;
    oracleValid: boolean;
  };
  performance: {
    return1hBps: number | null;
    return24hBps: number | null;
    return7dBps: number | null;
    return30dBps: number | null;
    volatility30dBps: number | null;
    maximumDrawdownBps: number | null;
    trend: "up" | "down" | "flat" | null;
    momentumBps: number | null;
    meanReversionBps: number | null;
    correlationToBasket: number | null;
  };
  execution: {
    liquidityScoreBps: number | null;
    estimatedPriceImpactBps: number | null;
    estimatedExecutionCostBps: number | null;
  };
  fundamentals: {
    marketCapUsd: number | null;
    revenueUsd: number | null;
    netIncomeUsd: number | null;
    assetsUsd: number | null;
    liabilitiesUsd: number | null;
    filingDate: string | null;
    corporateActions: unknown[];
  };
  provenance: SourceStamp[];
};

export type PortfolioSnapshotV2 = {
  observedAt: string;
  navUsdWad: string;
  navPerShareWad: string;
  supplyWad: string;
  reserveUsdWad: string;
  holdings: Record<string, string>;
  holdingValuesUsdWad: Record<string, string>;
  weightsBps: Record<string, number>;
  pendingFlowUsdWad: string | null;
  return24hBps: number | null;
  return7dBps: number | null;
  return30dBps: number | null;
  pnl24hUsdWad: string | null;
  maximumDrawdown30dBps: number | null;
  turnover24hBps: number | null;
  deposits24hUsdWad: string | null;
  redemptions24hUsdWad: string | null;
};

export type MarketRegimeV1 = {
  breadthPositiveBps: number | null;
  medianReturn24hBps: number | null;
  dispersion24hBps: number | null;
  crossAssetVolatilityBps: number | null;
  correlationRegime: "concentrated" | "mixed" | "diversified" | null;
  riskOnScore: number | null;
  macro: Record<string, number | null> | null;
  referenceOnlyUniverse: string[];
};

export type BenchmarkDossierV1 = {
  symbol: string;
  executable: false;
  features: MarketFeatureSetV1 | null;
  coverage: DataCoverageV1 | null;
};

export type CycleOutcomeV1 = {
  at: string;
  source: string;
  allocation: Record<string, number>;
  txHash: string;
  block: string | null;
  navPerShareAfterWad: string | null;
  maturedReturn1hBps: number | null;
  maturedReturn24hBps: number | null;
};

export type DecisionContextV3 = {
  schemaVersion: 3;
  generatedAt: string;
  mode: "local_devnet_simulation";
  tokenBudget: {
    maximumInputTokens: 32_000;
    detailedCycleLimit: 12;
    estimatedTokens: number;
    truncation: string[];
  };
  portfolio: PortfolioSnapshotV2;
  previousTarget: Record<string, number> | null;
  recentCycles: CycleOutcomeV1[];
  assets: AssetDossierV2[];
  accounting: PortfolioAccountingV1;
  benchmarks: BenchmarkDossierV1[];
  decisionOutcomes: {
    oneHour: DecisionOutcomeV2;
    twentyFourHour: DecisionOutcomeV2;
  };
  marketRegime: MarketRegimeV1;
  dataAvailability: Record<string, boolean>;
  freshness: {
    requiredStateFresh: boolean;
    requiredQuotesFresh: boolean;
    holdRequired: boolean;
    reasons: string[];
  };
  hardLimits: {
    stableReserveMinBps: 2000;
    longOnly: true;
    totalWeightBps: 10000;
    arbitraryContracts: false;
  };
  sourceManifest: SourceStamp[];
  inputHash: string;
};

// Kept as a source-compatible alias while legacy persisted V2 records remain readable.
export type DecisionContextV2 = DecisionContextV3;

type DashboardState = {
  deployment: Record<string, Address>;
  nav: string;
  navPerShare: string;
  supply: string;
  holdings: Record<string, string>;
  holdingValues: Record<string, string>;
  currentWeightsBps: Record<string, number>;
  oracle: {
    fresh: boolean;
    assets: Record<
      string,
      { priceUsdWad: string; updatedAt: number; valid: boolean }
    >;
  };
};

const tags = {
  USDG: ["stable_reserve", "deep_liquidity"],
  NVDA: ["equity", "technology", "ai_semiconductor", "mega_cap", "high_beta"],
  AAPL: [
    "equity",
    "technology",
    "consumer_discretionary",
    "mega_cap",
    "quality",
  ],
  ETHX: ["crypto", "crypto_major", "high_beta"],
} as const;

function stamp(
  source: SourceValue<unknown>,
  observationTime: string | null,
  formulaVersion: string,
): SourceStamp {
  return {
    source: source.source,
    observationTime,
    retrievalTime: source.retrievedAt,
    expiryTime: source.expiresAt,
    formulaVersion,
    hash: keccak256(stringToHex(stableDecisionJson(source.value))),
    valid: source.valid,
    ...(source.error ? { error: source.error } : {}),
  };
}

function cycleHistory(currentPrice: bigint): CycleOutcomeV1[] {
  try {
    const file = `${process.env.MDB_STATE_DIR ?? "/home/hendo420/projects/million-dollar-brain/var"}/cycles.jsonl`;
    const lines = readFileSync(file, "utf8").trim().split("\n").slice(-12);
    return lines.reverse().flatMap((line) => {
      try {
        const cycle = JSON.parse(line);
        const price = cycle?.portfolioAfter?.navPerShareWad;
        const ageHours = (Date.now() - Date.parse(cycle.at)) / 3_600_000;
        const matured = typeof price === "string" && BigInt(price) > 0n;
        const returnBps = matured
          ? Number(((currentPrice - BigInt(price)) * 10_000n) / BigInt(price))
          : null;
        return [
          {
            at: cycle.at,
            source: cycle.source,
            allocation: cycle.allocation,
            txHash: cycle.txHash,
            block: cycle.block ?? null,
            navPerShareAfterWad: price ?? null,
            maturedReturn1hBps: ageHours >= 1 ? returnBps : null,
            maturedReturn24hBps: ageHours >= 24 ? returnBps : null,
          },
        ];
      } catch {
        return [];
      }
    });
  } catch {
    return [];
  }
}

function latestFactValue(
  facts: Awaited<ReturnType<typeof secCompanyFacts>>["value"],
  concept: string,
) {
  const fact = latestSecFact(facts, concept);
  return { value: fact?.val ?? null, filed: fact?.filed ?? null };
}

export async function buildDecisionContext(
  state: DashboardState,
): Promise<DecisionContextV3> {
  const generatedAt = new Date().toISOString();
  await collectOfficialMarketData(state);
  const [
    nvda,
    aapl,
    eth,
    nvdaSec,
    aaplSec,
    macro,
    storedSnapshots,
    collectedFeatures,
    accounting,
  ] = await Promise.all([
    robinhoodStockData("NVDA"),
    robinhoodStockData("AAPL"),
    coinbaseEthCandles(),
    secCompanyFacts("NVDA"),
    secCompanyFacts("AAPL"),
    fredMacro(),
    recentPortfolioSnapshots(),
    latestMarketFeatures(),
    buildPortfolioAccounting(state),
  ]);
  const currentPrice = BigInt(state.navPerShare);
  const history = cycleHistory(currentPrice);
  const snapshotPrices = storedSnapshots
    .map((snapshot) =>
      typeof (snapshot as { navPerShareWad?: unknown }).navPerShareWad ===
      "string"
        ? BigInt((snapshot as { navPerShareWad: string }).navPerShareWad)
        : null,
    )
    .filter((value): value is bigint => value !== null && value > 0n);
  const previousPrice = snapshotPrices.at(-1) ?? null;
  const portfolioReturn =
    previousPrice && previousPrice > 0n
      ? Number(((currentPrice - previousPrice) * 10_000n) / previousPrice)
      : null;
  const portfolio: PortfolioSnapshotV2 = {
    observedAt: generatedAt,
    navUsdWad: state.nav,
    navPerShareWad: state.navPerShare,
    supplyWad: state.supply,
    reserveUsdWad: state.holdings.USDG ?? "0",
    holdings: state.holdings,
    holdingValuesUsdWad: state.holdingValues,
    weightsBps: state.currentWeightsBps,
    pendingFlowUsdWad: null,
    return24hBps:
      history.find((cycle) => cycle.maturedReturn24hBps !== null)
        ?.maturedReturn24hBps ?? null,
    return7dBps: portfolioReturn,
    return30dBps: portfolioReturn,
    pnl24hUsdWad: null,
    maximumDrawdown30dBps: null,
    turnover24hBps: null,
    deposits24hUsdWad: null,
    redemptions24hUsdWad: null,
  };
  const ethRows = (eth.value ?? [])
    .filter((row) => row.length >= 5)
    .map((row) => ({ time: row[0], close: row[4] }));
  const ethPerformance = calculateCandleMetrics(ethRows);
  const equity = { NVDA: nvda, AAPL: aapl } as const;
  const sec = { NVDA: nvdaSec, AAPL: aaplSec } as const;
  const addresses = {
    USDG: state.deployment.usdg,
    NVDA: state.deployment.nvda,
    AAPL: state.deployment.aapl,
    ETHX: state.deployment.ethx,
  } as const;
  const assets = (Object.keys(addresses) as (keyof typeof addresses)[]).map(
    (symbol): AssetDossierV2 => {
      const quote =
        symbol === "NVDA" || symbol === "AAPL" ? equity[symbol].quote : null;
      const source =
        symbol === "NVDA" || symbol === "AAPL" ? equity[symbol] : null;
      const facts = symbol === "NVDA" || symbol === "AAPL" ? sec[symbol] : null;
      const bid = quote ? Number(quote.bid) : null;
      const ask = quote ? Number(quote.ask) : null;
      const midpoint = bid !== null && ask !== null ? (bid + ask) / 2 : null;
      const quoteAge = quote
        ? Math.max(
            0,
            Math.floor((Date.now() - Date.parse(quote.generatedAt)) / 1_000),
          )
        : symbol === "USDG"
          ? 0
          : null;
      const revenue = facts
        ? latestFactValue(facts.value, "Revenues")
        : { value: null, filed: null };
      const netIncome = facts
        ? latestFactValue(facts.value, "NetIncomeLoss")
        : { value: null, filed: null };
      const totalAssets = facts
        ? latestFactValue(facts.value, "Assets")
        : { value: null, filed: null };
      const liabilities = facts
        ? latestFactValue(facts.value, "Liabilities")
        : { value: null, filed: null };
      const officialFeature = collectedFeatures[symbol];
      const performance =
        symbol === "ETHX"
          ? ethPerformance
          : symbol === "USDG"
            ? {
                return1hBps: 0,
                return24hBps: 0,
                return7dBps: 0,
                return30dBps: 0,
                volatility30dBps: 0,
                maximumDrawdownBps: 0,
              }
            : {
                return1hBps: officialFeature?.return1hBps ?? null,
                return24hBps: officialFeature?.return24hBps ?? null,
                return7dBps: officialFeature?.return7dBps ?? null,
                return30dBps: officialFeature?.return30dBps ?? null,
                volatility30dBps: officialFeature?.volatility30dBps ?? null,
                maximumDrawdownBps:
                  officialFeature?.maximumDrawdown30dBps ?? null,
              };
      const provenance: SourceStamp[] = [];
      if (source) {
        provenance.push(
          stamp(source.sources.assets, null, "robinhood-assets-v1"),
          stamp(
            source.sources.quote,
            quote?.generatedAt ?? null,
            "robinhood-raw-underlier-quote-v1",
          ),
          stamp(source.sources.actions, null, "robinhood-actions-v1"),
        );
      }
      if (facts) {
        provenance.push(
          stamp(facts, revenue.filed, "sec-companyfacts-latest-filing-v1"),
        );
      }
      if (symbol === "ETHX") {
        provenance.push(
          stamp(
            eth,
            ethRows.at(-1)
              ? new Date(ethRows.at(-1)!.time * 1_000).toISOString()
              : null,
            "coinbase-hourly-candles-v1",
          ),
        );
      }
      return {
        symbol,
        identity: {
          contract: addresses[symbol],
          robinhoodUid: source?.asset?.id ?? null,
          assetClass:
            symbol === "USDG"
              ? "stable"
              : symbol === "ETHX"
                ? "crypto"
                : "equity",
          tags: [...tags[symbol]],
          executable: true,
          permissions: {
            buy:
              !quote?.isTradingHalt &&
              (source?.asset?.status === "ASSET_STATUS_ACTIVE" ||
                symbol === "USDG" ||
                symbol === "ETHX"),
            sell: !quote?.isTradingHalt,
            halted: quote?.isTradingHalt ?? false,
          },
        },
        portfolio: {
          balanceWad: state.holdings[symbol] ?? "0",
          valueUsdWad: state.holdingValues[symbol] ?? "0",
          weightBps: state.currentWeightsBps[symbol] ?? 0,
          costBasisUsdWad:
            accounting.positions[symbol]?.costBasisUsdWad ?? null,
          realizedPnlUsdWad:
            accounting.positions[symbol]?.realizedPnlUsdWad ?? null,
          unrealizedPnlUsdWad:
            accounting.positions[symbol]?.unrealizedPnlUsdWad ?? null,
        },
        quote: {
          bidUsd: bid,
          askUsd: ask,
          midpointUsd: midpoint,
          spreadBps:
            midpoint && bid !== null && ask !== null
              ? Math.round(((ask - bid) / midpoint) * 10_000)
              : null,
          volume24h: quote ? Number(quote.dailyTradingVolume) : null,
          priceAgeSeconds: quoteAge,
          oraclePriceUsdWad: state.oracle.assets[symbol]?.priceUsdWad ?? "0",
          oracleTimestamp: state.oracle.assets[symbol]?.updatedAt ?? 0,
          oracleValid: state.oracle.assets[symbol]?.valid ?? false,
        },
        performance: {
          ...performance,
          trend:
            performance.return24hBps === null
              ? null
              : performance.return24hBps > 25
                ? "up"
                : performance.return24hBps < -25
                  ? "down"
                  : "flat",
          momentumBps: performance.return24hBps,
          meanReversionBps:
            performance.return7dBps === null ||
            performance.return24hBps === null
              ? null
              : performance.return24hBps - performance.return7dBps / 7,
          correlationToBasket: null,
        },
        execution: {
          liquidityScoreBps: quote
            ? Math.min(
                10_000,
                Math.round(
                  Math.log10(Number(quote.dailyTradingVolume) + 1) * 1_500,
                ),
              )
            : symbol === "USDG"
              ? 10_000
              : null,
          estimatedPriceImpactBps:
            officialFeature?.estimatedExecutionCostBps ?? null,
          estimatedExecutionCostBps:
            quote && midpoint && bid !== null && ask !== null
              ? Math.round(((ask - bid) / midpoint) * 5_000)
              : symbol === "USDG"
                ? 0
                : null,
        },
        fundamentals: {
          marketCapUsd: null,
          revenueUsd: revenue.value,
          netIncomeUsd: netIncome.value,
          assetsUsd: totalAssets.value,
          liabilitiesUsd: liabilities.value,
          filingDate: revenue.filed,
          corporateActions: source?.corporateActions ?? [],
        },
        provenance,
      };
    },
  );
  const riskReturns = assets
    .map((asset) => asset.performance.return24hBps)
    .filter((value): value is number => value !== null);
  const sortedReturns = [...riskReturns].sort((a, b) => a - b);
  const median =
    sortedReturns.length > 0
      ? sortedReturns[Math.floor(sortedReturns.length / 2)]
      : null;
  const dataAvailability = {
    asset_registry: assets.every((asset) => asset.identity.contract.length > 0),
    market_metrics: assets
      .filter((asset) => asset.symbol !== "USDG")
      .every((asset) => asset.quote.oracleValid),
    returns: assets
      .filter((asset) => asset.symbol !== "USDG")
      .every((asset) => asset.performance.return24hBps !== null),
    volatility: assets
      .filter((asset) => asset.symbol !== "USDG")
      .every((asset) => asset.performance.volatility30dBps !== null),
    drawdown: assets
      .filter((asset) => asset.symbol !== "USDG")
      .every((asset) => asset.performance.maximumDrawdownBps !== null),
    liquidity: assets
      .filter((asset) => asset.symbol !== "USDG")
      .every((asset) => asset.execution.liquidityScoreBps !== null),
    execution_cost: assets
      .filter((asset) => asset.symbol !== "USDG")
      .every((asset) => asset.execution.estimatedExecutionCostBps !== null),
    correlation: false,
    market_cap: false,
    corporate_actions: nvda.sources.actions.valid && aapl.sources.actions.valid,
    confidence: false,
    portfolio_pnl: portfolio.return24hBps !== null,
    fundamentals: nvdaSec.valid && aaplSec.valid,
    dividends: false,
    macro: macro.valid,
  };
  const reasons: string[] = [];
  if (!state.oracle.fresh) reasons.push("required on-chain valuation is stale");
  for (const asset of assets) {
    if (!asset.quote.oracleValid) {
      reasons.push(`${asset.symbol} valuation is invalid`);
    }
    if (
      asset.identity.assetClass === "equity" &&
      (asset.quote.priceAgeSeconds === null ||
        asset.quote.priceAgeSeconds > 60 ||
        asset.identity.permissions.halted)
    ) {
      reasons.push(`${asset.symbol} quote or trading state is not fresh`);
    }
  }
  const sourceManifest = assets.flatMap((asset) => asset.provenance);
  sourceManifest.push(
    stamp(
      macro as SourceValue<unknown>,
      macro.observedAt,
      "fred-latest-observation-v1",
    ),
  );
  const partial = {
    schemaVersion: 3 as const,
    generatedAt,
    mode: "local_devnet_simulation" as const,
    tokenBudget: {
      maximumInputTokens: 32_000 as const,
      detailedCycleLimit: 12 as const,
      estimatedTokens: 0,
      truncation: [] as string[],
    },
    portfolio,
    previousTarget: history[0]?.allocation ?? null,
    recentCycles: history,
    assets,
    accounting,
    benchmarks: REFERENCE_UNIVERSE.map((symbol) => ({
      symbol,
      executable: false as const,
      features:
        symbol === "ETH-USD"
          ? ({
              formulaVersion: "market-features-v1",
              symbol,
              observedAt: generatedAt,
              currentPrice: ethRows.at(-1)?.close ?? null,
              ...ethPerformance,
              return90dBps: null,
              maximumDrawdown30dBps: ethPerformance.maximumDrawdownBps,
              momentumBps: ethPerformance.return7dBps,
              meanReversionBps:
                ethPerformance.return7dBps !== null &&
                ethPerformance.return24hBps !== null
                  ? Math.round(
                      ethPerformance.return24hBps -
                        ethPerformance.return7dBps / 7,
                    )
                  : null,
              averageSpreadBps: null,
              spreadTrendBps: null,
              liquidityScoreBps: null,
              estimatedExecutionCostBps: null,
              correlationToBasket: null,
              betaToBasket: null,
              relativeStrengthBps: null,
              coverage: {
                sampleCount: ethRows.length,
                oldestAt: ethRows[0]
                  ? new Date(ethRows[0].time * 1_000).toISOString()
                  : null,
                newestAt: ethRows.at(-1)
                  ? new Date(ethRows.at(-1)!.time * 1_000).toISOString()
                  : null,
                spanMinutes:
                  ethRows.length > 1
                    ? Math.floor((ethRows.at(-1)!.time - ethRows[0].time) / 60)
                    : 0,
                return1hReady: ethPerformance.return1hBps !== null,
                return24hReady: ethPerformance.return24hBps !== null,
                return7dReady: ethPerformance.return7dBps !== null,
                return30dReady: ethPerformance.return30dBps !== null,
                reasons: [],
              },
              sourceHash: stamp(eth, generatedAt, "coinbase-hourly-candles-v1")
                .hash,
            } satisfies MarketFeatureSetV1)
          : (collectedFeatures[symbol] ?? null),
      coverage:
        symbol === "ETH-USD"
          ? null
          : (collectedFeatures[symbol]?.coverage ?? null),
    })),
    decisionOutcomes: emptyDecisionOutcomes(),
    marketRegime: {
      breadthPositiveBps: riskReturns.length
        ? Math.round(
            (riskReturns.filter((value) => value > 0).length * 10_000) /
              riskReturns.length,
          )
        : null,
      medianReturn24hBps: median,
      dispersion24hBps:
        riskReturns.length > 1
          ? Math.max(...riskReturns) - Math.min(...riskReturns)
          : null,
      crossAssetVolatilityBps: null,
      correlationRegime: null,
      riskOnScore: median,
      macro: macro.value,
      referenceOnlyUniverse: [...REFERENCE_UNIVERSE, "FRED macro series"],
    },
    dataAvailability,
    freshness: {
      requiredStateFresh: state.oracle.fresh,
      requiredQuotesFresh: reasons.length === 0,
      holdRequired: reasons.length > 0,
      reasons,
    },
    hardLimits: {
      stableReserveMinBps: 2000 as const,
      longOnly: true as const,
      totalWeightBps: 10000 as const,
      arbitraryContracts: false as const,
    },
    sourceManifest,
  };
  const estimatedTokens = Math.ceil(stableDecisionJson(partial).length / 4);
  partial.tokenBudget.estimatedTokens = estimatedTokens;
  if (estimatedTokens > 32_000) {
    partial.recentCycles = partial.recentCycles.slice(0, 4);
    partial.tokenBudget.truncation.push(
      "recentCycles reduced deterministically from 12 to 4",
    );
    partial.tokenBudget.estimatedTokens = Math.ceil(
      stableDecisionJson(partial).length / 4,
    );
  }
  const inputHash = keccak256(stringToHex(stableDecisionJson(partial)));
  return { ...partial, inputHash };
}
