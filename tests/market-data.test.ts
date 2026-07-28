import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  calculateMarketFeatures,
  correlationAndBeta,
} from "../apps/web/lib/market-history.ts";
import {
  changedByAtLeastOneBps,
  decimalWad,
  needsOracleFreshnessRefresh,
  retryRpcConsistency,
} from "../apps/web/lib/price-sync-math.ts";

function candles(count: number, minutes = 1) {
  const start = Date.parse("2026-01-01T00:00:00Z");
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index / 100;
    return {
      bucket_start: new Date(start + index * minutes * 60_000),
      open: String(close),
      high: String(close),
      low: String(close),
      close: String(close),
      average_spread_bps: 4,
      sample_count: 1,
    };
  });
}

test("official history gates each horizon independently", () => {
  const immature = calculateMarketFeatures("NVDA", candles(30));
  assert.equal(immature.return1hBps, null);
  assert.equal(immature.coverage.return1hReady, false);
  const oneHour = calculateMarketFeatures("NVDA", candles(61));
  assert.notEqual(oneHour.return1hBps, null);
  assert.equal(oneHour.return24hBps, null);
  assert.equal(oneHour.coverage.return1hReady, true);
});

test("30-day risk metrics require twenty aligned daily observations", () => {
  const nineteen = calculateMarketFeatures("SPY", candles(19, 24 * 60));
  assert.equal(nineteen.volatility30dBps, null);
  assert.equal(nineteen.maximumDrawdown30dBps, null);
  const twentyOne = calculateMarketFeatures("SPY", candles(21, 24 * 60));
  assert.notEqual(twentyOne.volatility30dBps, null);
  assert.notEqual(twentyOne.maximumDrawdown30dBps, null);
});

test("correlation and beta require twenty aligned returns", () => {
  assert.deepEqual(correlationAndBeta([1, 2], [1, 2]), {
    correlation: null,
    beta: null,
  });
  const series = Array.from({ length: 20 }, (_, index) => index / 100);
  const related = correlationAndBeta(series, series);
  assert.ok((related.correlation ?? 0) > 0.999);
  assert.ok((related.beta ?? 0) > 0.999);
});

test("official decimal prices convert to exact WAD values", () => {
  assert.equal(decimalWad("335.44"), 335_440000000000000000n);
  assert.equal(decimalWad("3000"), 3_000000000000000000000n);
  assert.equal(decimalWad("1.1234567890123456789"), 1_123456789012345678n);
  assert.throws(() => decimalWad("-1"), /invalid decimal price/);
});

test("local oracle sync ignores sub-basis-point noise", () => {
  const current = decimalWad("100");
  assert.equal(changedByAtLeastOneBps(current, decimalWad("100.009")), false);
  assert.equal(changedByAtLeastOneBps(current, decimalWad("100.01")), true);
});

test("testnet oracle receives a freshness heartbeat after sixty seconds", () => {
  assert.equal(needsOracleFreshnessRefresh(46630, 1_000, 1_059), false);
  assert.equal(needsOracleFreshnessRefresh(46630, 1_000, 1_060), true);
  assert.equal(needsOracleFreshnessRefresh(31337, 1_000, 2_000), false);
  assert.equal(needsOracleFreshnessRefresh(4663, 1_000, 2_000), false);
});

test("public RPC verification retries temporary replica lag", async () => {
  let attempts = 0;
  const result = await retryRpcConsistency(
    async () => {
      attempts += 1;
      if (attempts < 3) throw new Error("replica is behind");
      return "confirmed";
    },
    4,
    0,
  );
  assert.equal(result, "confirmed");
  assert.equal(attempts, 3);
  await assert.rejects(
    retryRpcConsistency(
      async () => {
        throw new Error("still behind");
      },
      2,
      0,
    ),
    /still behind/,
  );
});

test("V3 context remains stateless, bounded, and excludes raw candles", () => {
  const allocator = readFileSync("apps/web/lib/allocator.ts", "utf8");
  const context = readFileSync("apps/web/lib/decision-context.ts", "utf8");
  assert.match(context, /schemaVersion: 3/);
  assert.match(context, /maximumInputTokens: 32_000/);
  assert.match(context, /detailedCycleLimit: 12/);
  assert.match(context, /\.sort\(\(a, b\) => a\.time - b\.time\)/);
  assert.doesNotMatch(allocator, /conversation[_A-Z]?id/i);
  assert.doesNotMatch(context, /rawCandles/);
  assert.match(allocator, /const allowed = \["USDG", "NVDA", "AAPL", "ETHX"\]/);
  assert.doesNotMatch(
    allocator,
    /SPY.*cleanAllocation|QQQ.*cleanAllocation|SOXX.*cleanAllocation/,
  );
});

test("collector synchronizes the local oracle and execution router", () => {
  const collector = readFileSync(
    "apps/web/app/api/collect-market/route.ts",
    "utf8",
  );
  const sync = readFileSync("apps/web/lib/market-price-sync.ts", "utf8");
  assert.match(collector, /syncLocalMarketPrices/);
  assert.match(sync, /chainId === 46630/);
  assert.match(sync, /chainId === 4663/);
  assert.match(sync, /Robinhood Stock Token API/);
  assert.match(sync, /Coinbase Exchange ETH-USD ticker/);
  assert.match(sync, /verifiedOracle\[0\] !== candidate\.priceWad/);
  assert.match(sync, /verifiedRouter !== candidate\.priceWad/);
  assert.match(
    sync,
    /oracleNeedsFreshnessRefresh && routerPrice !== candidate\.priceWad/,
  );
});
