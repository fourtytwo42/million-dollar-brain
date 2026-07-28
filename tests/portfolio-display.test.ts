import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("visible USD values use the exact two-decimal formatter", () => {
  const dashboard = readFileSync(
    "apps/web/components/editorial-dashboard.tsx",
    "utf8",
  );
  assert.match(
    dashboard,
    /<small>\$\{usd\(slice\.value\.toString\(\)\)\}<\/small>/,
  );
  assert.match(dashboard, /value=\{`\$\$\{data \? usd\(data\.nav\)/);
  assert.match(
    dashboard,
    /network\.networkLabel\} production-interface replicas · no real funds/,
  );
});

test("Brain summary and responsive controls stay compact and actionable", () => {
  const dashboard = readFileSync(
    "apps/web/components/editorial-dashboard.tsx",
    "utf8",
  );
  const styles = readFileSync("apps/web/app/globals.css", "utf8");
  const pulse = dashboard.slice(
    dashboard.indexOf('<section className="brain-pulse-strip"'),
    dashboard.indexOf('<section className="brain-primary-grid"'),
  );
  assert.match(pulse, /label="Strongest preferences"/);
  assert.doesNotMatch(pulse, /label="Data"/);
  assert.doesNotMatch(pulse, /label="Latest result"/);
  assert.doesNotMatch(pulse, /label="Next cycle"/);
  assert.match(dashboard, /className="editorial-page brain-page"/);
  assert.match(
    styles,
    /\.brain-map-viewport \{[\s\S]*max-height: none;[\s\S]*overflow: clip;/,
  );
  assert.doesNotMatch(styles, /\.brain-page \{[\s\S]{0,300}height: calc\(/);
  assert.doesNotMatch(
    styles,
    /\.brain-page \.piece-inspector \{[\s\S]{0,120}overflow-y: auto/,
  );
  assert.match(
    styles,
    /@media \(max-width: 720px\)[\s\S]*\.market-strip \{[\s\S]*display: grid/,
  );
  assert.match(
    styles,
    /@media \(max-width: 900px\)[\s\S]*\.mobile-map-switch \{[\s\S]*display: flex/,
  );
  assert.match(
    styles,
    /\.mood-ledger \{[\s\S]*grid-template-columns: repeat\(2,/,
  );
});
