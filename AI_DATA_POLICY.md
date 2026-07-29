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

Each scheduled decision package contains:

- USDG as the required reserve asset.
- No fixed ceiling on qualified candidates; no more than nine risk positions
  may receive weight alongside USDG.
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

| Purpose                                    | Free structured source                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------------------------- |
| Canonical Stock Token identity and status  | Robinhood Stock Token `https://api.robinhood.com/rhj/assets` and official chain contracts |
| Quote, trading halt, and underlying volume | Robinhood Stock Token `https://api.robinhood.com/rhj/prices/{symbol}`                     |
| Corporate actions and token multipliers    | Robinhood Stock Token `https://api.robinhood.com/rhj/corporate-actions`                   |
| Execution and NAV price                    | Chainlink feed on Robinhood Chain when supported                                          |
| Token balances, transfers, and pool state  | Robinhood Chain RPC and indexed chain events                                              |
| Issuer filings and structured fundamentals | SEC EDGAR Submissions and Company Facts APIs                                              |
| Macro observations                         | FRED Series Observations API                                                              |

No paid market-data provider, news API, search engine, social feed, or AI research service is required by the MVP.

The runtime builds official history locally for every registered candidate and
the configured reference-only benchmarks. A one-minute collector stores
multiplier-adjusted Robinhood observations, then derives candles and versioned
features in PostgreSQL. No unofficial historical backfill is allowed. Every
metric carries coverage and remains unavailable until its official-history
window matures. Raw candles remain outside the model prompt.

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

## 6. Bounded structured research policy

Ornith has no browser, search, or arbitrary HTTP access. It may request one
orchestrated research round for at most 16 registered asset identities.
Requests are validated against the registry and return only immutable
structured evidence from approved official, on-chain, portfolio, and 0x
sources.

This prevents:

- Prompt injection from webpages or token metadata.
- Fabricated or spoofed token contracts.
- Irreproducible decisions caused by changing search results.
- Decisions based on rumors, social posts, or unattributed claims.
- Unbounded latency and context growth.

News, social sentiment, user-supplied URLs, arbitrary contracts, and prose
research remain excluded.

## 7. How the brain changes data use

Brain controls steer optional attention, comparison, research, and reaction.
They cannot hide or remove mandatory safety evidence.

Always-on data includes:

- Exact asset identity, contract, registry status, and trade permissions.
- Current holdings, value, weight, reserve, NAV, cost basis, and P&L.
- Validated price and age, bid, ask, spread, liquidity, halt state, oracle
  pause, and corporate-action transition.
- Hard limits, pending flows, previous target, and execution result and
  availability.

Data-Diet Chef allocates exactly 100 optional-attention points among:

- Price and technical features.
- Fundamentals.
- Valuation.
- Macro.
- Liquidity and execution.
- Portfolio history.
- Decision outcomes.
- Corporate events.

It also selects context appetite, up to four history windows, deterministic
truncation priority, and optional dossier depth. Attention Hydra selects
timeframes, reference comparisons, and the policy for conflicting horizons.
Holding Horizon, Momentum Moth, The Adult in the Room, Bargain-Bin Prophet,
Macro Weather Goblin, Headline-Risk Manager, Exit-Liquidity Unicorn, and
Trust-Issues Owl further steer their corresponding optional evidence.

Trust-Issues Owl may permit one structured research round for zero to four
registered assets. The protocol hard cap remains sixteen. Research uses only
registered IDs and protocol-authored questions.

These controls alter prominence and scoring, not truth or availability. They
do not override the stable reserve, asset caps, qualification, liquidity
minimums, oracle freshness, halts, turnover limits, or other hard rules. Raw
candles, old prompts, prior conversations, unlimited events, owner URLs, and
web prose remain excluded.

## 8. Reproducibility

Every cycle stores:

- Asset Registry version.
- Brain schema version, all 42 control bundles, compiled result, conflicts, and
  bundle hashes.
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
