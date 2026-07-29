import assert from "node:assert/strict";
import test from "node:test";
import {
  chainlinkMappingsFromCatalog,
  officialHistoryCoverage,
  sessionAwareMaximumAgeSeconds,
  summarizeMainnetReadiness,
} from "../scripts/lib/mainnet-readiness.mjs";

test("Chainlink catalog maps Robinhood equities and ETH without inventing SOXX", () => {
  const rows = [
    {
      proxyAddress: "0x0000000000000000000000000000000000000001",
      heartbeat: 86400,
      path: "robinhood-aapl-usd",
      docs: {
        baseAsset: "AAPL",
        quoteAsset: "USD",
        blockchainName: "Robinhood",
        productTypeCode: "primaryTokenizedPrice",
        marketHours: "us_equities_24/5",
      },
    },
    {
      proxyAddress: "0x0000000000000000000000000000000000000002",
      heartbeat: 3600,
      docs: {
        baseAsset: "ETH",
        quoteAsset: "USD",
        productTypeCode: "RefPrice",
        marketHours: "Crypto",
      },
    },
  ];
  const mappings = chainlinkMappingsFromCatalog(rows, ["AAPL", "SOXX", "WETH"]);
  assert.equal(mappings.AAPL.address, rows[0].proxyAddress);
  assert.equal(mappings.WETH.address, rows[1].proxyAddress);
  assert.equal(mappings.SOXX, undefined);
});

test("equity feed freshness allows a closed weekend without weakening weekdays", () => {
  const mapping = {
    heartbeatSeconds: 86400,
    marketHours: "us_equities_24/5",
  };
  assert.equal(
    sessionAwareMaximumAgeSeconds(mapping, new Date("2026-07-29T14:00:00Z")),
    86400,
  );
  assert.equal(
    sessionAwareMaximumAgeSeconds(mapping, new Date("2026-08-01T14:00:00Z")),
    96 * 3600,
  );
});

test("official history matures only after 48 covered hours", () => {
  const start = Date.parse("2026-07-27T00:10:00Z");
  const rows = Array.from({ length: 48 }, (_, index) => ({
    at: new Date(start + index * 3600000).toISOString(),
    assets: [
      { assetId: "4663:a", symbol: "AAPL", officialPriceUsd: 200 + index },
    ],
  }));
  const mature = officialHistoryCoverage(
    rows,
    "4663:a",
    "AAPL",
    new Date(start + 47 * 3600000).toISOString(),
  );
  assert.equal(mature.spanHours, 47);
  assert.equal(mature.coverageBps, 10000);
  assert.equal(mature.valid, true);
  assert.equal(
    officialHistoryCoverage(rows.slice(1), "4663:a", "AAPL", mature.newestAt)
      .valid,
    false,
  );
});

test("core four determine readiness while optional assets never delay it", () => {
  const passed = ["AAPL", "NVDA", "SPY", "WETH"].map((symbol) => ({
    symbol,
    qualificationWindowPassed: true,
  }));
  const readiness = summarizeMainnetReadiness([
    ...passed,
    { symbol: "MSFT", qualificationWindowPassed: false },
  ]);
  assert.equal(readiness.coreQualificationPassed, true);
  assert.deepEqual(readiness.missingCore, []);
  assert.deepEqual(readiness.includedSymbols, ["AAPL", "NVDA", "SPY", "WETH"]);
});
