import { createHash } from "node:crypto";

export const MAINNET_CORE_SYMBOLS = Object.freeze([
  "AAPL",
  "NVDA",
  "SPY",
  "WETH",
]);
export const MAINNET_OPTIONAL_SYMBOLS = Object.freeze(["MSFT", "QQQ", "SOXX"]);
export const MAINNET_NOMINATED_SYMBOLS = Object.freeze([
  ...MAINNET_CORE_SYMBOLS,
  ...MAINNET_OPTIONAL_SYMBOLS,
]);
export const CHAINLINK_ROBINHOOD_CATALOG =
  "https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json";

export function sha256(value) {
  return createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
}

export function parseAllowlist(value = "") {
  return new Set(
    value
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function chainlinkMappingsFromCatalog(rows, symbols) {
  const wanted = new Set(symbols);
  const mappings = {};
  for (const row of rows ?? []) {
    const symbol = row?.docs?.baseAsset;
    const quote = row?.docs?.quoteAsset;
    const isRobinhoodEquity =
      row?.docs?.blockchainName === "Robinhood" &&
      row?.docs?.productTypeCode === "primaryTokenizedPrice";
    const isEthReference =
      symbol === "ETH" &&
      quote === "USD" &&
      row?.docs?.productTypeCode === "RefPrice";
    const requestedSymbol = isEthReference ? "WETH" : symbol;
    if (
      !wanted.has(requestedSymbol) ||
      quote !== "USD" ||
      (!isRobinhoodEquity && !isEthReference) ||
      typeof row.proxyAddress !== "string"
    )
      continue;
    mappings[requestedSymbol] = {
      address: row.proxyAddress,
      heartbeatSeconds: Number(row.heartbeat ?? 86_400),
      marketHours: row?.docs?.marketHours ?? null,
      path: row.path ?? null,
      sourceHash: sha256(row),
    };
  }
  return mappings;
}

export function sessionAwareMaximumAgeSeconds(mapping, now = new Date()) {
  const heartbeat = Math.max(
    3_600,
    Number(mapping?.heartbeatSeconds ?? 86_400),
  );
  if (mapping?.marketHours !== "us_equities_24/5") return heartbeat;
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
  }).format(now);
  return weekday === "Sat" || weekday === "Sun"
    ? Math.max(heartbeat, 96 * 3_600)
    : heartbeat;
}

export function officialHistoryCoverage(rows, assetId, symbol, nowIso) {
  const observations = [
    ...rows.flatMap((row) =>
      (row.assets ?? [])
        .filter(
          (asset) =>
            asset.assetId === assetId ||
            (asset.symbol === symbol && !asset.assetId),
        )
        .map((asset) => ({
          at: asset.at ?? row.at,
          price: Number(asset.officialPriceUsd),
        })),
    ),
  ].filter(
    (row) =>
      Number.isFinite(Date.parse(row.at ?? "")) &&
      Number.isFinite(row.price) &&
      row.price > 0,
  );
  const deduplicated = new Map();
  for (const row of observations) {
    const hour = new Date(row.at);
    hour.setUTCMinutes(0, 0, 0);
    deduplicated.set(hour.toISOString(), row);
  }
  const points = [...deduplicated.values()].sort(
    (left, right) => Date.parse(left.at) - Date.parse(right.at),
  );
  if (points.length === 0) {
    return {
      observationCount: 0,
      spanHours: 0,
      coverageBps: 0,
      oldestAt: null,
      newestAt: null,
      valid: false,
      reason: "official hourly history has not started",
    };
  }
  const oldestAt = points[0].at;
  const newestAt = points.at(-1).at;
  const spanHours = Math.floor(
    (Date.parse(newestAt) - Date.parse(oldestAt)) / 3_600_000,
  );
  const expected = Math.max(1, spanHours + 1);
  const coverageBps = Math.min(
    10_000,
    Math.floor((points.length * 10_000) / expected),
  );
  const currentAgeHours = Math.floor(
    (Date.parse(nowIso) - Date.parse(newestAt)) / 3_600_000,
  );
  const valid = spanHours >= 47 && coverageBps >= 9_000 && currentAgeHours <= 2;
  return {
    observationCount: points.length,
    spanHours,
    coverageBps,
    oldestAt,
    newestAt,
    sourceHash: sha256(points),
    valid,
    reason: valid
      ? null
      : "48 hours of 90% complete official hourly history are not available",
  };
}

export function summarizeMainnetReadiness(qualification) {
  const bySymbol = new Map(qualification.map((asset) => [asset.symbol, asset]));
  const requiredAssets = MAINNET_CORE_SYMBOLS.map(
    (symbol) =>
      bySymbol.get(symbol) ?? { symbol, qualificationWindowPassed: false },
  );
  const optionalAssets = MAINNET_OPTIONAL_SYMBOLS.map(
    (symbol) =>
      bySymbol.get(symbol) ?? { symbol, qualificationWindowPassed: false },
  );
  const missingCore = requiredAssets
    .filter((asset) => asset.qualificationWindowPassed !== true)
    .map((asset) => asset.symbol);
  return {
    requiredSymbols: [...MAINNET_CORE_SYMBOLS],
    optionalSymbols: [...MAINNET_OPTIONAL_SYMBOLS],
    missingCore,
    includedSymbols: [
      ...MAINNET_CORE_SYMBOLS.filter(
        (symbol) => bySymbol.get(symbol)?.qualificationWindowPassed === true,
      ),
      ...MAINNET_OPTIONAL_SYMBOLS.filter(
        (symbol) => bySymbol.get(symbol)?.qualificationWindowPassed === true,
      ),
    ],
    coreQualificationPassed: missingCore.length === 0,
    optionalQualification: Object.fromEntries(
      optionalAssets.map((asset) => [
        asset.symbol,
        asset.qualificationWindowPassed === true,
      ]),
    ),
  };
}
