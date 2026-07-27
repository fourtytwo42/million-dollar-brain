import { keccak256, stringToHex } from "viem";
import { stableDecisionJson } from "./decision-math.ts";
import { robinhoodStockData, type RobinhoodSymbol } from "./market-sources.ts";
import { withDatabase } from "./persistence.ts";

export const EXECUTABLE_STOCKS = ["NVDA", "AAPL"] as const;
export const REFERENCE_STOCKS = ["SPY", "QQQ", "SOXX"] as const;
export const REFERENCE_UNIVERSE = ["SPY", "QQQ", "SOXX", "ETH-USD"] as const;
export type TrackedStock = RobinhoodSymbol;
export type MarketInterval = "1m" | "15m" | "1h" | "1d";

type CollectorState = {
  blockNumber?: string;
  oracle?: {
    assets?: Record<
      string,
      { priceUsdWad: string; updatedAt: number; valid: boolean }
    >;
  };
};

export type DataCoverageV1 = {
  sampleCount: number;
  oldestAt: string | null;
  newestAt: string | null;
  spanMinutes: number;
  return1hReady: boolean;
  return24hReady: boolean;
  return7dReady: boolean;
  return30dReady: boolean;
  reasons: string[];
};

export type MarketFeatureSetV1 = {
  formulaVersion: "market-features-v1";
  symbol: string;
  observedAt: string;
  currentPrice: number | null;
  return1hBps: number | null;
  return24hBps: number | null;
  return7dBps: number | null;
  return30dBps: number | null;
  return90dBps: number | null;
  volatility30dBps: number | null;
  maximumDrawdown30dBps: number | null;
  momentumBps: number | null;
  meanReversionBps: number | null;
  averageSpreadBps: number | null;
  spreadTrendBps: number | null;
  liquidityScoreBps: number | null;
  estimatedExecutionCostBps: number | null;
  correlationToBasket: number | null;
  betaToBasket: number | null;
  relativeStrengthBps: number | null;
  coverage: DataCoverageV1;
  sourceHash: string;
};

export function correlationAndBeta(
  assetReturns: number[],
  basketReturns: number[],
) {
  const length = Math.min(assetReturns.length, basketReturns.length);
  if (length < 20) return { correlation: null, beta: null };
  const asset = assetReturns.slice(-length);
  const basket = basketReturns.slice(-length);
  const assetMean = asset.reduce((sum, value) => sum + value, 0) / length;
  const basketMean = basket.reduce((sum, value) => sum + value, 0) / length;
  let covariance = 0;
  let assetVariance = 0;
  let basketVariance = 0;
  for (let index = 0; index < length; index += 1) {
    const a = asset[index] - assetMean;
    const b = basket[index] - basketMean;
    covariance += a * b;
    assetVariance += a * a;
    basketVariance += b * b;
  }
  return {
    correlation:
      assetVariance > 0 && basketVariance > 0
        ? covariance / Math.sqrt(assetVariance * basketVariance)
        : null,
    beta: basketVariance > 0 ? covariance / basketVariance : null,
  };
}

type Candle = {
  bucket_start: Date | string;
  open: string;
  high: string;
  low: string;
  close: string;
  average_spread_bps: number;
  sample_count: number;
};

const hash = (value: unknown) =>
  keccak256(stringToHex(stableDecisionJson(value)));

function horizonReturn(
  rows: { at: number; close: number }[],
  minutes: number,
  minimumSpanMinutes: number,
) {
  const latest = rows.at(-1);
  const oldest = rows[0];
  if (
    !latest ||
    !oldest ||
    (latest.at - oldest.at) / 60_000 < minimumSpanMinutes
  ) {
    return null;
  }
  const target = latest.at - minutes * 60_000;
  const prior = [...rows].reverse().find((row) => row.at <= target);
  return prior && prior.close > 0
    ? Math.round((latest.close / prior.close - 1) * 10_000)
    : null;
}

export function calculateMarketFeatures(
  symbol: string,
  candles: Candle[],
): MarketFeatureSetV1 {
  const rows = candles
    .map((row) => ({
      at: new Date(row.bucket_start).getTime(),
      close: Number(row.close),
      spread: Number(row.average_spread_bps),
    }))
    .filter((row) => Number.isFinite(row.at) && row.close > 0)
    .sort((a, b) => a.at - b.at);
  const oldest = rows[0];
  const newest = rows.at(-1);
  const spanMinutes =
    oldest && newest ? Math.floor((newest.at - oldest.at) / 60_000) : 0;
  const return1hBps = horizonReturn(rows, 60, 55);
  const return24hBps = horizonReturn(rows, 24 * 60, 20 * 60);
  const return7dBps = horizonReturn(rows, 7 * 24 * 60, 6 * 24 * 60);
  const return30dBps = horizonReturn(rows, 30 * 24 * 60, 27 * 24 * 60);
  const return90dBps = horizonReturn(rows, 90 * 24 * 60, 80 * 24 * 60);
  const daily = rows.filter(
    (row, index) =>
      index === rows.length - 1 ||
      new Date(row.at).toISOString().slice(0, 10) !==
        new Date(rows[index + 1]?.at ?? row.at).toISOString().slice(0, 10),
  );
  const returns = daily
    .slice(1)
    .map((row, index) => Math.log(row.close / daily[index].close))
    .filter(Number.isFinite);
  const enoughDaily = daily.length >= 20;
  const mean = returns.length
    ? returns.reduce((sum, value) => sum + value, 0) / returns.length
    : 0;
  const variance = returns.length
    ? returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
      returns.length
    : 0;
  let peak = daily[0]?.close ?? 0;
  let maximumDrawdown = 0;
  for (const row of daily) {
    peak = Math.max(peak, row.close);
    if (peak > 0)
      maximumDrawdown = Math.min(maximumDrawdown, row.close / peak - 1);
  }
  const recentSpreads = rows.slice(-60).map((row) => row.spread);
  const olderSpreads = rows.slice(-120, -60).map((row) => row.spread);
  const average = (values: number[]) =>
    values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : null;
  const averageSpreadBps = average(recentSpreads);
  const priorSpread = average(olderSpreads);
  const coverage: DataCoverageV1 = {
    sampleCount: rows.length,
    oldestAt: oldest ? new Date(oldest.at).toISOString() : null,
    newestAt: newest ? new Date(newest.at).toISOString() : null,
    spanMinutes,
    return1hReady: return1hBps !== null,
    return24hReady: return24hBps !== null,
    return7dReady: return7dBps !== null,
    return30dReady: return30dBps !== null && enoughDaily,
    reasons: [
      ...(return1hBps === null
        ? ["1h requires 55 minutes of official history"]
        : []),
      ...(return24hBps === null
        ? ["24h requires 20 hours of official history"]
        : []),
      ...(return7dBps === null
        ? ["7d requires six days of official history"]
        : []),
      ...(!enoughDaily
        ? ["30d risk metrics require 20 daily observations"]
        : []),
    ],
  };
  const partial = {
    formulaVersion: "market-features-v1" as const,
    symbol,
    observedAt: newest
      ? new Date(newest.at).toISOString()
      : new Date(0).toISOString(),
    currentPrice: newest?.close ?? null,
    return1hBps,
    return24hBps,
    return7dBps,
    return30dBps: enoughDaily ? return30dBps : null,
    return90dBps,
    volatility30dBps:
      enoughDaily && returns.length
        ? Math.round(Math.sqrt(variance * 252) * 10_000)
        : null,
    maximumDrawdown30dBps: enoughDaily
      ? Math.round(Math.abs(maximumDrawdown) * 10_000)
      : null,
    momentumBps: return7dBps,
    meanReversionBps:
      return7dBps !== null && return24hBps !== null
        ? Math.round(return24hBps - return7dBps / 7)
        : null,
    averageSpreadBps:
      averageSpreadBps === null ? null : Math.round(averageSpreadBps),
    spreadTrendBps:
      averageSpreadBps === null || priorSpread === null
        ? null
        : Math.round(averageSpreadBps - priorSpread),
    liquidityScoreBps:
      averageSpreadBps === null
        ? null
        : Math.max(
            0,
            Math.min(10_000, 10_000 - Math.round(averageSpreadBps * 100)),
          ),
    estimatedExecutionCostBps:
      averageSpreadBps === null
        ? null
        : Math.max(1, Math.ceil(averageSpreadBps / 2)),
    correlationToBasket: null,
    betaToBasket: null,
    relativeStrengthBps: null,
    coverage,
  };
  return { ...partial, sourceHash: hash(partial) };
}

async function aggregateCandles(client: {
  query: (sql: string, values?: unknown[]) => Promise<unknown>;
}) {
  const buckets = [
    ["1m", "date_trunc('minute', source_generated_at)"],
    [
      "15m",
      "date_trunc('hour', source_generated_at) + floor(extract(minute from source_generated_at) / 15) * interval '15 minutes'",
    ],
    ["1h", "date_trunc('hour', source_generated_at)"],
    ["1d", "date_trunc('day', source_generated_at)"],
  ] as const;
  for (const [interval, bucket] of buckets) {
    await client.query(`
      INSERT INTO mdb_price_candles
        (symbol, interval, bucket_start, open, high, low, close,
         average_spread_bps, sample_count, source_hash)
      SELECT symbol, '${interval}', ${bucket},
             (array_agg(adjusted_midpoint ORDER BY source_generated_at ASC))[1],
             max(adjusted_midpoint), min(adjusted_midpoint),
             (array_agg(adjusted_midpoint ORDER BY source_generated_at DESC))[1],
             round(avg(spread_bps))::integer, count(*)::integer,
             md5(string_agg(source_hash, '' ORDER BY source_generated_at))
        FROM mdb_quote_observations
       WHERE valid = true
         AND source_generated_at >= now() - interval '100 days'
       GROUP BY symbol, ${bucket}
      ON CONFLICT (symbol, interval, bucket_start) DO UPDATE SET
        open=excluded.open, high=excluded.high, low=excluded.low,
        close=excluded.close, average_spread_bps=excluded.average_spread_bps,
        sample_count=excluded.sample_count, source_hash=excluded.source_hash
    `);
  }
  await client.query(
    "DELETE FROM mdb_quote_observations WHERE source_generated_at < now() - interval '30 days'",
  );
  await client.query(
    "DELETE FROM mdb_price_candles WHERE interval='1m' AND bucket_start < now() - interval '30 days'",
  );
  await client.query(
    "DELETE FROM mdb_price_candles WHERE interval='15m' AND bucket_start < now() - interval '1 year'",
  );
}

export async function collectOfficialMarketData(state?: CollectorState) {
  const started = Date.now();
  const observedAt = new Date().toISOString();
  const stocks = [...EXECUTABLE_STOCKS, ...REFERENCE_STOCKS];
  const fetched = await Promise.all(
    stocks.map(
      async (symbol) => [symbol, await robinhoodStockData(symbol)] as const,
    ),
  );
  const result = await withDatabase(async (client) => {
    await client.query("BEGIN");
    try {
      const lock = await client.query<{ locked: boolean }>(
        "SELECT pg_try_advisory_xact_lock(424242) AS locked",
      );
      if (!lock.rows[0]?.locked) {
        await client.query("ROLLBACK");
        return { skipped: true, inserted: 0, failures: [] as string[] };
      }
      await client.query(
        `INSERT INTO mdb_worker_state(worker,last_started_at,details)
         VALUES ('market-collector',now(),'{}')
         ON CONFLICT(worker) DO UPDATE SET last_started_at=excluded.last_started_at`,
      );
      let inserted = 0;
      const failures: string[] = [];
      for (const [symbol, source] of fetched) {
        const asset = source.asset;
        const quote = source.quote;
        if (!asset || !quote || !source.sources.quote.valid) {
          failures.push(
            `${symbol}: ${source.sources.quote.error ?? "missing quote"}`,
          );
          continue;
        }
        const multiplier = Number(asset.currentMultiplier);
        const bid = Number(quote.bid);
        const ask = Number(quote.ask);
        const midpoint = (bid + ask) / 2;
        const adjustedMidpoint = midpoint * multiplier;
        const spreadBps =
          midpoint > 0 ? Math.round(((ask - bid) / midpoint) * 10_000) : 0;
        const role = (EXECUTABLE_STOCKS as readonly string[]).includes(symbol)
          ? "executable"
          : "reference";
        const assetHash = hash(asset);
        await client.query(
          `INSERT INTO mdb_asset_registry
            (symbol,role,source,source_uid,token_name,multiplier,status,metadata,
             observed_at,retrieved_at,source_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
           ON CONFLICT(symbol) DO UPDATE SET
             role=excluded.role, source_uid=excluded.source_uid,
             token_name=excluded.token_name, multiplier=excluded.multiplier,
             status=excluded.status, metadata=excluded.metadata,
             observed_at=excluded.observed_at, retrieved_at=excluded.retrieved_at,
             source_hash=excluded.source_hash`,
          [
            symbol,
            role,
            source.sources.assets.source,
            asset.id,
            asset.tokenName,
            multiplier,
            asset.status,
            JSON.stringify({
              tradingCapabilities: asset.tradingCapabilities ?? null,
              corporateActions: source.corporateActions,
            }),
            quote.generatedAt,
            source.sources.quote.retrievedAt,
            assetHash,
          ],
        );
        const oracle = state?.oracle?.assets?.[symbol];
        const quoteHash = hash({ assetHash, quote, adjustedMidpoint });
        const insertedRow = await client.query(
          `INSERT INTO mdb_quote_observations
            (symbol,source_generated_at,retrieved_at,bid,ask,midpoint,
             adjusted_midpoint,spread_bps,daily_volume,halted,multiplier,
             oracle_price_wad,chain_block,valid,source_hash)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
           ON CONFLICT(symbol,source_generated_at) DO NOTHING`,
          [
            symbol,
            quote.generatedAt,
            source.sources.quote.retrievedAt,
            bid,
            ask,
            midpoint,
            adjustedMidpoint,
            spreadBps,
            quote.dailyTradingVolume,
            quote.isTradingHalt,
            multiplier,
            oracle?.priceUsdWad ?? null,
            state?.blockNumber ?? null,
            !quote.isTradingHalt && asset.status === "ASSET_STATUS_ACTIVE",
            quoteHash,
          ],
        );
        inserted += insertedRow.rowCount ?? 0;
      }
      await aggregateCandles(client);
      const calculated: Record<string, MarketFeatureSetV1> = {};
      for (const symbol of stocks) {
        const candles = await client.query<Candle>(
          `SELECT bucket_start,open,high,low,close,average_spread_bps,sample_count
             FROM mdb_price_candles
            WHERE symbol=$1 AND interval='1m'
            ORDER BY bucket_start ASC`,
          [symbol],
        );
        calculated[symbol] = calculateMarketFeatures(symbol, candles.rows);
      }
      const portfolioRows = await client.query<{
        observed_at: string;
        snapshot: { navPerShareWad?: string };
      }>(
        `SELECT observed_at::text,snapshot FROM mdb_portfolio_snapshots
          WHERE phase='after' AND observed_at >= now() - interval '100 days'
          ORDER BY observed_at ASC`,
      );
      const portfolioDaily = new Map<string, number>();
      for (const row of portfolioRows.rows) {
        const value = row.snapshot.navPerShareWad;
        if (value) {
          portfolioDaily.set(
            new Date(row.observed_at).toISOString().slice(0, 10),
            Number(value),
          );
        }
      }
      const portfolioDates = [...portfolioDaily.keys()].sort();
      const portfolioReturns = portfolioDates.slice(1).map((date, index) => {
        const prior = portfolioDaily.get(portfolioDates[index])!;
        return portfolioDaily.get(date)! / prior - 1;
      });
      for (const symbol of stocks) {
        const features = calculated[symbol];
        const daily = await client.query<{
          bucket_start: string;
          close: string;
        }>(
          `SELECT bucket_start::text,close FROM mdb_price_candles
            WHERE symbol=$1 AND interval='1d'
            ORDER BY bucket_start ASC`,
          [symbol],
        );
        const dailyMap = new Map(
          daily.rows.map((row) => [
            new Date(row.bucket_start).toISOString().slice(0, 10),
            Number(row.close),
          ]),
        );
        const alignedPrices = portfolioDates
          .map((date) => dailyMap.get(date))
          .filter((value): value is number => value !== undefined);
        const alignedReturns = alignedPrices
          .slice(1)
          .map((value, index) => value / alignedPrices[index] - 1);
        const relationship = correlationAndBeta(
          alignedReturns,
          portfolioReturns.slice(-alignedReturns.length),
        );
        const enriched = {
          ...features,
          correlationToBasket: relationship.correlation,
          betaToBasket: relationship.beta,
          relativeStrengthBps:
            features.return24hBps !== null &&
            calculated.SPY?.return24hBps !== null &&
            calculated.SPY?.return24hBps !== undefined
              ? features.return24hBps - calculated.SPY.return24hBps
              : null,
        };
        enriched.sourceHash = hash({ ...enriched, sourceHash: undefined });
        await client.query(
          `INSERT INTO mdb_market_features
             (symbol,observed_at,formula_version,features,coverage,source_hash)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT(symbol,observed_at) DO UPDATE SET
             features=excluded.features,coverage=excluded.coverage,
             source_hash=excluded.source_hash`,
          [
            symbol,
            observedAt,
            enriched.formulaVersion,
            JSON.stringify(enriched),
            JSON.stringify(enriched.coverage),
            enriched.sourceHash,
          ],
        );
      }
      await client.query(
        `UPDATE mdb_worker_state SET
           last_succeeded_at=now(),last_error=null,duration_ms=$1,
           details=$2 WHERE worker='market-collector'`,
        [
          Date.now() - started,
          JSON.stringify({ inserted, failures, trackedSymbols: stocks }),
        ],
      );
      await client.query("COMMIT");
      return { skipped: false, inserted, failures };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
  return {
    observedAt,
    durationMs: Date.now() - started,
    databaseConfigured: result !== null,
    ...(result ?? {
      skipped: true,
      inserted: 0,
      failures: ["database unavailable"],
    }),
  };
}

export async function latestMarketFeatures() {
  return (
    (await withDatabase(async (client) => {
      const result = await client.query<{
        symbol: string;
        features: MarketFeatureSetV1;
      }>(
        `SELECT DISTINCT ON (symbol) symbol,features
           FROM mdb_market_features
          ORDER BY symbol,observed_at DESC`,
      );
      return Object.fromEntries(
        result.rows.map((row) => [row.symbol, row.features]),
      );
    })) ?? {}
  );
}

export async function marketDataHealth() {
  return (
    (await withDatabase(async (client) => {
      const worker = await client.query<{
        last_started_at: string | null;
        last_succeeded_at: string | null;
        last_failed_at: string | null;
        last_error: string | null;
        duration_ms: number | null;
        details: unknown;
      }>("SELECT * FROM mdb_worker_state WHERE worker='market-collector'");
      const coverage = await client.query<{
        symbol: string;
        count: string;
        oldest: string | null;
        newest: string | null;
      }>(
        `SELECT symbol,count(*)::text, min(source_generated_at)::text AS oldest,
                max(source_generated_at)::text AS newest
           FROM mdb_quote_observations GROUP BY symbol ORDER BY symbol`,
      );
      return {
        configured: true,
        worker: worker.rows[0] ?? null,
        coverage: coverage.rows.map((row) => ({
          ...row,
          count: Number(row.count),
        })),
      };
    })) ?? { configured: false, worker: null, coverage: [] }
  );
}

export async function readMarketHistory(
  symbol: string,
  interval: MarketInterval,
  rangeDays: number,
) {
  const allowed = [
    ...EXECUTABLE_STOCKS,
    ...REFERENCE_STOCKS,
  ] as readonly string[];
  if (!allowed.includes(symbol)) throw new Error("symbol is not allowlisted");
  if (!["1m", "15m", "1h", "1d"].includes(interval)) {
    throw new Error("unsupported interval");
  }
  const days = Math.max(1, Math.min(rangeDays, interval === "1m" ? 30 : 3650));
  return (
    (await withDatabase(async (client) => {
      const result = await client.query(
        `SELECT bucket_start,open,high,low,close,average_spread_bps,sample_count
           FROM mdb_price_candles
          WHERE symbol=$1 AND interval=$2
            AND bucket_start >= now() - ($3::text || ' days')::interval
          ORDER BY bucket_start ASC LIMIT 2000`,
        [symbol, interval, days],
      );
      return result.rows;
    })) ?? []
  );
}
