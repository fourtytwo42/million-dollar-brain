# MillionDollar Brain AI Data and Asset-Universe Policy

**Version:** 0.1  
**Status:** MVP decisions locked

## 1. Core separation

The protocol separates three responsibilities:

1. **Asset Registry:** determines what Ornith is allowed to hold.
2. **Deterministic data pipeline:** fetches, validates, timestamps, and calculates information.
3. **Ornith allocator:** chooses target weights from the supplied active assets and metrics.

Ornith cannot add an asset, browse for a token contract, choose a data source, change a formula, or execute a trade. No other AI curates Ornith's inputs.

## 2. MVP asset universe

The hourly decision package contains:

- USDG as the required reserve asset.
- No more than 24 active risk assets.
- No more than 10 non-zero target positions including USDG.

The candidate universe is synchronized daily from Robinhood's free canonical Stock Token metadata and official Robinhood Chain contract registry. Discovery does not equal approval.

An asset becomes active only after the risk administrator has verified:

- Exact chain ID, Robinhood UID, and token contract.
- Active issuer and deployment status.
- Valid price source and corporate-action multiplier handling.
- Approved on-chain trading venue and executable route.
- Minimum liquidity and maximum expected price impact.
- Complete source mapping for its assigned tags.
- Buy, sell, hold, halt, and redemption behavior.
- Eligibility under the protocol's current legal and jurisdiction policy.

The exact launch contracts are selected immediately before deployment from the then-current registry. Symbols are not hardcoded because contracts, availability, liquidity, and legal eligibility can change.

## 3. Free MVP sources

| Purpose | Free structured source |
| --- | --- |
| Canonical Stock Token identity and status | Robinhood Stock Token `https://api.robinhood.com/rhj/assets` and official chain contracts |
| Quote, trading halt, and underlying volume | Robinhood Stock Token `https://api.robinhood.com/rhj/prices/{symbol}` |
| Corporate actions and token multipliers | Robinhood Stock Token `https://api.robinhood.com/rhj/corporate-actions` |
| Execution and NAV price | Chainlink feed on Robinhood Chain when supported |
| Token balances, transfers, and pool state | Robinhood Chain RPC and indexed chain events |
| Issuer filings and structured fundamentals | SEC EDGAR Submissions and Company Facts APIs |
| Macro observations | FRED Series Observations API |

No paid market-data provider, news API, search engine, social feed, or AI research service is required by the MVP.

Robinhood Stock Token quotes describe the underlying asset and are not multiplier-adjusted. Supported Chainlink Stock Token feeds are already multiplier-adjusted. The price adapter records this semantic difference and must not apply the ERC-8056 multiplier twice.

## 4. Deterministically calculated metrics

Protocol-owned code calculates all derived values from the approved source fields:

- One-hour, 24-hour, seven-day, and 30-day returns.
- Realized volatility and maximum drawdown.
- Trend, breakout, mean-reversion, and relative-strength scores.
- Correlation with current holdings.
- Spread and estimated on-chain price impact.
- Market capitalization from validated price and reported shares outstanding.
- Valuation ratios from price and SEC facts.
- Quality and growth scores from versioned SEC fact formulas.
- Dividend metrics from Robinhood corporate actions and supported SEC facts.
- Portfolio cost basis, realized P&L, unrealized P&L, and turnover.
- Macro regime score from an allowlisted set of FRED series and fixed formulas.

Every formula has a version. Ornith receives the resulting values and formula version, not permission to calculate a replacement from prose.

## 5. What Ornith receives for every asset

```json
{
  "asset_id": 7,
  "contract": "0x...",
  "robinhood_uid": "0x...",
  "symbol": "EXAMPLE",
  "asset_class": "tokenized_equity",
  "tags": ["technology", "ai_semiconductor"],
  "permissions": {
    "buy": true,
    "sell": true,
    "hold": true
  },
  "market": {
    "price_usd": "100.25",
    "price_age_seconds": 18,
    "returns_bps": {
      "1h": 20,
      "24h": -110,
      "7d": 340,
      "30d": 510
    },
    "volatility_30d_bps": 2840,
    "maximum_drawdown_30d_bps": 910,
    "liquidity_usd": "2500000",
    "spread_bps": 12,
    "price_impact_bps_at_trade_size": 28
  },
  "fundamentals": {
    "market_cap_usd": "100000000000",
    "valuation_score_bps": 6100,
    "quality_score_bps": 7300,
    "growth_score_bps": 6800,
    "dividend_yield_bps": 45
  },
  "data_sources": [],
  "data_valid": true
}
```

Every field includes or inherits:

- Source ID.
- Observation time.
- Retrieval time.
- Expiry time.
- Formula version when derived.
- Content or record hash.
- Valid, stale, unavailable, or conflicting status.

Ornith also receives the current basket, protocol limits, complete brain, previous targets, previous execution result, and recent deposits and redemptions.

## 6. No-browsing policy

Ornith has no browser, search, arbitrary HTTP, or tool-calling access during allocation.

This prevents:

- Prompt injection from webpages or token metadata.
- Fabricated or spoofed token contracts.
- Irreproducible decisions caused by changing search results.
- Decisions based on rumors, social posts, or unattributed claims.
- Unbounded latency and context growth.

News, social sentiment, user-supplied URLs, and prose research are excluded from the MVP.

## 7. How the brain changes data use

Brain Piece 42 selects data-group weighting:

| Preset | Market and technical | Issuer fundamentals | Macro and corporate actions |
| --- | ---: | ---: | ---: |
| Market and technical | 70% | 20% | 10% |
| Balanced data | 50% | 35% | 15% |
| Fundamentals and macro | 30% | 50% | 20% |

Other pieces narrow the focus further:

- Holding Horizon selects the return windows emphasized.
- Trend, valuation, quality, volatility, and corporate-action pieces control their corresponding metrics.
- Sector affinities change scores only for assets carrying approved registry tags.
- Liquidity and trading-cost pieces influence preferences inside the hard execution limits.

These settings steer ranking. They do not override the stable reserve, asset caps, liquidity minimums, oracle freshness, halts, turnover limits, or other hard rules.

## 8. Reproducibility

Every cycle stores:

- Asset Registry version.
- Brain version and all 42 selections.
- Source record identifiers and observation timestamps.
- Hash of the structured decision package.
- Formula versions.
- Exact prompt, model, sampling configuration, and schema version.
- Raw final model output, validated targets, and compiler result.

The same stored package can be replayed without accessing live external sources.

## 9. Failure behavior

- Missing optional data disables only dependent preference effects.
- Missing or stale execution-price data forces a hold.
- A halted asset cannot be purchased.
- A disabled asset follows its explicit `sell_only`, `hold_only`, or `frozen` state.
- Conflicting sources invalidate the affected field instead of asking Ornith to choose.
- No valid allocation output means the current allocation is held.
