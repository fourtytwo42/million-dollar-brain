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

test("V6 builds dossiers from the active manifest and preserves its tags", () => {
  const context = readFileSync(
    new URL("../apps/web/lib/decision-context.ts", import.meta.url),
    "utf8",
  );
  assert.match(context, /buildManifestDossiers/);
  assert.match(context, /stockRecords\.map/);
  assert.match(context, /robinhoodStockData\(record\.symbol\)/);
  assert.match(context, /identity:[\s\S]*tags: \[\.\.\.record\.tags\]/);
  assert.doesNotMatch(context, /tags: \[asset\.kind, "deployment_manifest"\]/);
  assert.match(context, /coinbaseEthTicker/);
});

test("V6 evidence never turns unavailable history into a neutral return", () => {
  const context = readFileSync(
    new URL("../apps/web/lib/decision-context.ts", import.meta.url),
    "utf8",
  );
  assert.match(context, /"complete" \| "partial" \| "price_only"/);
  assert.match(context, /unavailableReasons/);
  assert.match(context, /`\$\{field\} unavailable from validated sources`/);
  assert.match(context, /return24hBps: feature\?\.return24hBps \?\? null/);
});

test("V7 prompt uses DEX-only authority and treats position count as a maximum", () => {
  const allocator = readFileSync(
    new URL("../apps/web/lib/allocator.ts", import.meta.url),
    "utf8",
  );
  assert.match(allocator, /Missing evidence is uncertainty/);
  assert.match(allocator, /this is a maximum, never a target/);
  assert.match(allocator, /DecisionContextV7/);
  assert.match(allocator, /DEX TWAP, time-weighted liquidity/);
  assert.match(allocator, /rawAllocationById/);
  assert.match(allocator, /allocationWarnings/);
});

test("every accepted AI allocation carries a validated Brain Pulse", () => {
  const allocator = readFileSync(
    new URL("../apps/web/lib/allocator.ts", import.meta.url),
    "utf8",
  );
  assert.match(allocator, /Every final allocation response must include/);
  assert.match(allocator, /validateAiBrainPulse/);
  assert.match(allocator, /model returned an invalid Brain Pulse/);
  assert.match(
    allocator,
    /decision\.source === "ai" \? decision\.brainPulse : null/,
  );
});

test("review cadence advances only after a cycle is durably completed", () => {
  const allocator = readFileSync(
    new URL("../apps/web/lib/allocator.ts", import.meta.url),
    "utf8",
  );
  const reviewStarted = allocator.indexOf('status: "review_started"');
  const persisted = allocator.indexOf(
    "await persistAccountingSnapshot(accountingAfter, stateAfter.blockNumber)",
  );
  const cadenceAdvanced = allocator.indexOf(
    "eligibilityState.lastReviewAtMs = Date.now()",
  );
  assert.ok(reviewStarted >= 0);
  assert.ok(persisted > reviewStarted);
  assert.ok(cadenceAdvanced > persisted);
  assert.match(allocator, /status: "review_completed"/);
});
