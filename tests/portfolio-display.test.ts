import assert from "node:assert/strict";
import test from "node:test";
import {
  allocationSummary,
  positiveAllocationEntries,
  positiveBalanceSymbols,
} from "../apps/web/lib/portfolio-display.ts";

test("portfolio holdings include only positive token balances", () => {
  assert.deepEqual(
    positiveBalanceSymbols({
      USDG: "20000000000000000000",
      NVDA: "0",
      AAPL: "1",
      ETHX: "not-a-balance",
    }),
    ["USDG", "AAPL"],
  );
});

test("decision allocations include only positive target weights", () => {
  const allocation = {
    USDG: 2000,
    NVDA: 0,
    AAPL: 3500,
    ETHX: -1,
    BROKEN: Number.NaN,
  };
  assert.deepEqual(positiveAllocationEntries(allocation), [
    ["USDG", 2000],
    ["AAPL", 3500],
  ]);
  assert.equal(allocationSummary(allocation), "USDG 20% · AAPL 35%");
  assert.equal(allocationSummary({ USDG: 0 }), "No target positions");
});
