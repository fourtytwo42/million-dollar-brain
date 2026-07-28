import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  calculateCandleMetrics,
  stableDecisionJson,
} from "../apps/web/lib/decision-math.ts";

test("stable decision serialization is deterministic across object key order", () => {
  const first = stableDecisionJson({
    z: 1,
    a: { d: 2, b: [3, 4] },
  });
  const second = stableDecisionJson({
    a: { b: [3, 4], d: 2 },
    z: 1,
  });
  assert.equal(first, second);
});

test("decision evidence distinguishes local, testnet replica, and mainnet shadow", () => {
  const source = readFileSync("apps/web/lib/decision-context.ts", "utf8");
  assert.match(source, /networkConfig\.mode === "testnet"/);
  assert.match(source, /robinhood_testnet_replica/);
  assert.match(source, /robinhood_mainnet_shadow/);
});

test("candle formulas produce returns, volatility, and drawdown from observations", () => {
  const candles = Array.from({ length: 31 }, (_, hour) => ({
    time: hour * 3_600,
    close: hour < 20 ? 100 + hour : 120 - (hour - 20) * 2,
  }));
  const metrics = calculateCandleMetrics(candles);
  assert.notEqual(metrics.return1hBps, null);
  assert.notEqual(metrics.return24hBps, null);
  assert.ok((metrics.volatility30dBps ?? 0) > 0);
  assert.ok((metrics.maximumDrawdownBps ?? 0) > 0);
  assert.equal(metrics.return7dBps, null);
  assert.equal(metrics.return30dBps, null);
});

test("unobserved fields are unavailable by default", () => {
  const source = readFileSync(
    new URL("../apps/web/lib/market-context.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /:\s*true/);
  assert.match(source, /portfolio_pnl:\s*false/);
});

test("allocator remains stateless and context history is capped", () => {
  const allocator = readFileSync(
    new URL("../apps/web/lib/allocator.ts", import.meta.url),
    "utf8",
  );
  const context = readFileSync(
    new URL("../apps/web/lib/decision-context.ts", import.meta.url),
    "utf8",
  );
  assert.match(
    allocator,
    /messages:\s*\[\{ role: "user", content: prompt \}\]/,
  );
  assert.doesNotMatch(allocator, /conversation[_A-Za-z]*:/);
  assert.match(context, /\.slice\(-12\)/);
  assert.match(context, /maximumInputTokens:\s*96_000/);
  assert.match(allocator, /maximumInputTokens:\s*96_000/);
  assert.match(allocator, /validateResearchRequests/);
  assert.match(allocator, /No more research is allowed/);
  assert.match(allocator, /persistResearchRound/);
  assert.doesNotMatch(allocator, /conversation[_A-Za-z]*:/);
});
