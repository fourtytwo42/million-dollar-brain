import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type SourceValue<T> = {
  value: T | null;
  source: string;
  observedAt: string | null;
  retrievedAt: string;
  expiresAt: string;
  valid: boolean;
  error?: string;
};

const stateDir =
  process.env.MDB_STATE_DIR ??
  "/home/hendo420/projects/million-dollar-brain/var";
const cacheDir = join(stateDir, "source-cache");

function cached<T>(key: string, maximumAgeMs: number): T | null {
  try {
    const value = JSON.parse(
      readFileSync(join(cacheDir, `${key}.json`), "utf8"),
    ) as { retrievedAt: string; value: T };
    return Date.now() - Date.parse(value.retrievedAt) <= maximumAgeMs
      ? value.value
      : null;
  } catch {
    return null;
  }
}

function save<T>(key: string, value: T) {
  mkdirSync(cacheDir, { recursive: true });
  writeFileSync(
    join(cacheDir, `${key}.json`),
    JSON.stringify({ retrievedAt: new Date().toISOString(), value }),
  );
}

export async function fetchJson<T>(
  key: string,
  url: string,
  maximumAgeMs: number,
  headers: Record<string, string> = {},
): Promise<SourceValue<T>> {
  const retrievedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + maximumAgeMs).toISOString();
  if (process.env.MDB_EXTERNAL_DATA_ENABLED === "false") {
    return {
      value: null,
      source: url,
      observedAt: null,
      retrievedAt,
      expiresAt,
      valid: false,
      error: "external feeds disabled",
    };
  }
  const cache = cached<T>(key, maximumAgeMs);
  if (cache) {
    return {
      value: cache,
      source: url,
      observedAt: null,
      retrievedAt,
      expiresAt,
      valid: true,
    };
  }
  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(8_000),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const value = (await response.json()) as T;
    save(key, value);
    return {
      value,
      source: url,
      observedAt: null,
      retrievedAt,
      expiresAt,
      valid: true,
    };
  } catch (error) {
    return {
      value: null,
      source: url,
      observedAt: null,
      retrievedAt,
      expiresAt,
      valid: false,
      error: error instanceof Error ? error.message : "fetch failed",
    };
  }
}

export type RobinhoodAsset = {
  id: string;
  tokenSymbol: string;
  tokenName: string;
  currentMultiplier: string;
  status: string;
  tradingCapabilities?: Record<string, unknown> | null;
};
export type RobinhoodQuote = {
  tokenSymbol: string;
  bid: string;
  ask: string;
  dailyTradingVolume: string;
  isTradingHalt: boolean;
  generatedAt: string;
};

export type RobinhoodSymbol = string;

export async function robinhoodStockData(symbol: RobinhoodSymbol) {
  const [assets, quote, actions] = await Promise.all([
    fetchJson<{ assets: RobinhoodAsset[] }>(
      "robinhood-assets",
      "https://api.robinhood.com/rhj/assets",
      2 * 60 * 60 * 1_000,
    ),
    fetchJson<{ quotes: RobinhoodQuote[] }>(
      `robinhood-price-${symbol}`,
      `https://api.robinhood.com/rhj/prices/${symbol}`,
      15_000,
    ),
    fetchJson<{
      corpActions: {
        tokenSymbol: string;
        type: string;
        status: string;
        processDate?: { year: number; month: number; day: number };
      }[];
    }>(
      "robinhood-corporate-actions",
      "https://api.robinhood.com/rhj/corporate-actions",
      60 * 60 * 1_000,
    ),
  ]);
  const asset = assets.value?.assets.find(
    (candidate) => candidate.tokenSymbol === symbol,
  );
  const currentQuote = quote.value?.quotes[0];
  return {
    asset: asset ?? null,
    quote: currentQuote ?? null,
    corporateActions:
      actions.value?.corpActions
        .filter((action) => action.tokenSymbol === symbol)
        .slice(0, 8) ?? [],
    sources: { assets, quote, actions },
  };
}

export async function coinbaseEthCandles() {
  return fetchJson<number[][]>(
    "coinbase-eth-usd-hourly",
    "https://api.exchange.coinbase.com/products/ETH-USD/candles?granularity=3600",
    60_000,
  );
}

export async function coinbaseEthTicker() {
  return fetchJson<{
    price: string;
    time: string;
    bid: string;
    ask: string;
    volume: string;
  }>(
    "coinbase-eth-usd-ticker",
    "https://api.exchange.coinbase.com/products/ETH-USD/ticker",
    15_000,
  );
}

type SecUnit = {
  end?: string;
  filed?: string;
  form?: string;
  val?: number;
  fp?: string;
};

export async function secCompanyFacts(symbol: "NVDA" | "AAPL") {
  const cik = symbol === "NVDA" ? "0001045810" : "0000320193";
  return fetchJson<{
    entityName: string;
    facts?: {
      "us-gaap"?: Record<string, { units?: Record<string, SecUnit[]> }>;
      dei?: Record<string, { units?: Record<string, SecUnit[]> }>;
    };
  }>(
    `sec-companyfacts-${symbol}`,
    `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
    6 * 60 * 60 * 1_000,
    {
      "user-agent":
        process.env.MDB_SEC_USER_AGENT ??
        "MillionDollarBrain local research prototype",
      accept: "application/json",
    },
  );
}

export async function fredMacro() {
  const apiKey = process.env.FRED_API_KEY;
  if (!apiKey) {
    return {
      value: null,
      source: "https://api.stlouisfed.org/fred/series/observations",
      observedAt: null,
      retrievedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
      valid: false,
      error: "FRED_API_KEY not configured",
    } satisfies SourceValue<Record<string, number | null>>;
  }
  const series = ["FEDFUNDS", "DGS2", "DGS10", "CPIAUCSL", "UNRATE"];
  const rows = await Promise.all(
    series.map(async (id) => {
      const result = await fetchJson<{
        observations: { date: string; value: string }[];
      }>(
        `fred-${id}`,
        `https://api.stlouisfed.org/fred/series/observations?series_id=${id}&api_key=${apiKey}&file_type=json&sort_order=desc&limit=10`,
        24 * 60 * 60 * 1_000,
      );
      const observation = result.value?.observations.find(
        (candidate) => candidate.value !== ".",
      );
      return {
        id,
        value: observation ? Number(observation.value) : null,
        observedAt: observation?.date ?? null,
        source: result,
      };
    }),
  );
  return {
    value: Object.fromEntries(rows.map((row) => [row.id, row.value])),
    source: "FRED",
    observedAt:
      rows
        .map((row) => row.observedAt)
        .filter(Boolean)
        .sort()
        .at(-1) ?? null,
    retrievedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1_000).toISOString(),
    valid: rows.some((row) => row.value !== null),
    components: rows.map((row) => row.source),
  };
}

export function latestSecFact(
  value: Awaited<ReturnType<typeof secCompanyFacts>>["value"],
  concept: string,
  unit = "USD",
) {
  const rows = value?.facts?.["us-gaap"]?.[concept]?.units?.[unit] ?? [];
  return (
    [...rows]
      .filter(
        (row) =>
          typeof row.val === "number" &&
          typeof row.filed === "string" &&
          ["10-K", "10-Q"].includes(row.form ?? ""),
      )
      .sort((a, b) => (b.filed ?? "").localeCompare(a.filed ?? ""))[0] ?? null
  );
}
