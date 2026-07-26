# MillionDollar Brain Preset and Asset Schema

**Version:** 0.1 proposal  
**Status:** Draft for review  
**Purpose:** Define how the 42 brain pieces steer the AI and how the protocol tells the AI which assets it may hold.

The complete user-facing option meanings, recommended defaults, behavioral effects, and data dependencies are defined in `BRAIN_PRESET_CATALOG.md`.

## 1. Core design rule

The system has three separate layers:

1. **Asset Registry**
   - Defines the exact assets the protocol permits.
   - Uses contract addresses and numeric asset IDs rather than ticker text.
   - Stores hard restrictions the AI cannot change.

2. **Brain**
   - Expresses weighted preferences through closed preset options.
   - Does not directly authorize contracts or execute trades.
   - Does not accept user text.

3. **AI Allocator**
   - Receives the active asset catalog, complete brain, current basket, and market statistics.
   - Returns target weights for the next cycle.
   - Does not return swap instructions.

The deterministic portfolio compiler compares target weights with current weights and determines what must be bought or sold.

## 2. Brain-piece structure

Every piece has:

```json
{
  "piece_id": 1,
  "affinity_id": "capital_objective",
  "weight_bps": 500,
  "allowed_option_ids": [0, 1, 2],
  "default_option_id": 1,
  "selected_option_id": 1,
  "selection_version": 4,
  "effective_cycle": 1205
}
```

On-chain state stores IDs, weights, ownership, selections, and versions. Each option has protocol-authored metadata and a content hash so the exact meaning supplied to the model is auditable.

## 3. Proposed weight tiers

| Tier | Pieces | Weight per piece | Combined influence |
| --- | ---: | ---: | ---: |
| Core mandate | 6 | 500 bps | 3,000 bps |
| Strategy | 12 | 300 bps | 3,600 bps |
| Asset and sector affinity | 16 | 150 bps | 2,400 bps |
| Decision behavior | 8 | 125 bps | 1,000 bps |
| **Total** | **42** | | **10,000 bps** |

No single piece controls more than 5% of the complete brain.

## 4. Proposed 42-piece brain

### 4.1 Core mandate pieces

| ID | Affinity | Weight | Option 0 | Option 1 | Option 2 |
| ---: | --- | ---: | --- | --- | --- |
| 1 | Capital objective | 500 | Preserve | Balanced growth | Maximum growth |
| 2 | Equity versus crypto | 500 | Equity-led | Balanced mix | Crypto-led |
| 3 | Diversification | 500 | Broad | Balanced | Focused |
| 4 | Holding horizon | 500 | Tactical | Multi-day | Patient |
| 5 | Stable reserve preference | 500 | Minimum permitted | Balanced reserve | High reserve |
| 6 | Rebalance responsiveness | 500 | Patient | Normal | Responsive |

These options express preferences inside hard protocol limits. For example, "minimum permitted" cannot reduce the stable reserve below the hard minimum.

### 4.2 Strategy pieces

| ID | Affinity | Weight | Option 0 | Option 1 | Option 2 |
| ---: | --- | ---: | --- | --- | --- |
| 7 | Trend response | 300 | Fade trends | Neutral | Follow trends |
| 8 | Valuation style | 300 | Value | Neutral | Growth |
| 9 | Fundamental quality | 300 | Quality-first | Balanced | Speculative |
| 10 | Volatility preference | 300 | Low volatility | Neutral | High beta |
| 11 | Company-size preference | 300 | Mega-cap | Large-cap mix | Smaller assets |
| 12 | Return style | 300 | Income and stability | Balanced | Capital appreciation |
| 13 | Mean-reversion preference | 300 | Avoid | Moderate | Strong |
| 14 | Breakout preference | 300 | Ignore | Require confirmation | Seek breakouts |
| 15 | Relative-strength preference | 300 | Accumulate laggards | Neutral | Prefer leaders |
| 16 | Drawdown reaction | 300 | Accumulate weakness | Hold course | Reduce exposure |
| 17 | Winner management | 300 | Trim winners | Hold winners | Add to winners |
| 18 | Correlation preference | 300 | Maximize diversification | Neutral | Allow thematic clusters |

### 4.3 Asset and sector affinity pieces

Every piece in this group uses the same option structure:

- Option 0: Underweight
- Option 1: Neutral
- Option 2: Overweight

| ID | Affinity | Weight | Registry tag affected |
| ---: | --- | ---: | --- |
| 19 | Broad-market funds | 150 | `broad_market` |
| 20 | Technology | 150 | `technology` |
| 21 | AI and semiconductors | 150 | `ai_semiconductor` |
| 22 | Financials | 150 | `financials` |
| 23 | Healthcare | 150 | `healthcare` |
| 24 | Consumer discretionary | 150 | `consumer_discretionary` |
| 25 | Consumer staples | 150 | `consumer_staples` |
| 26 | Industrials | 150 | `industrials` |
| 27 | Energy | 150 | `energy` |
| 28 | Utilities | 150 | `utilities` |
| 29 | Communications and media | 150 | `communications` |
| 30 | Real estate and real-world assets | 150 | `real_estate_rwa` |
| 31 | Major crypto assets | 150 | `crypto_major` |
| 32 | DeFi and native protocols | 150 | `defi_native` |
| 33 | Tokenized commodities | 150 | `tokenized_commodity` |
| 34 | Meme and speculative assets | 150 | `meme_speculative` |

If no active asset has a selected tag, that affinity contributes no portfolio preference for the cycle.

### 4.4 Decision-behavior pieces

| ID | Affinity | Weight | Option 0 | Option 1 | Option 2 |
| ---: | --- | ---: | --- | --- | --- |
| 35 | Macro sensitivity | 125 | Ignore macro | Moderate use | Strong use |
| 36 | Corporate-action posture | 125 | Reduce exposure | Neutral | Accept exposure |
| 37 | Liquidity preference | 125 | Deep liquidity only | Balanced | Allow thinner liquidity |
| 38 | Trading-cost sensitivity | 125 | Minimize turnover | Balanced | Prioritize signal |
| 39 | Confidence requirement | 125 | High confidence | Normal confidence | Exploratory |
| 40 | Profit-taking style | 125 | Take profits early | Balanced | Let winners run |
| 41 | New-position threshold | 125 | Very selective | Normal | Explore more names |
| 42 | Data focus | 125 | Market and technical | Balanced data | Fundamentals and macro |

Piece 42 changes the relative weighting of approved structured-data groups. It does not authorize browsing or add assets to the registry.

## 5. Option effects

Each option has two meanings:

1. **Canonical model instruction**
   - A short protocol-written statement placed in the model context.

2. **Machine-readable effects**
   - Numeric preference changes the system can aggregate and audit.

Example:

```json
{
  "affinity_id": "technology_tilt",
  "option_id": 2,
  "label": "Overweight",
  "instruction": "Prefer approved technology-tagged assets when their data supports inclusion.",
  "effects": [
    {
      "dimension": "tag_preference:technology",
      "value": 1
    }
  ]
}
```

Another example:

```json
{
  "affinity_id": "stable_reserve_preference",
  "option_id": 2,
  "label": "High reserve",
  "instruction": "Prefer a stable-asset allocation above the protocol minimum.",
  "effects": [
    {
      "dimension": "stable_reserve_bias",
      "value": 1
    }
  ]
}
```

The brain compiler multiplies each effect by the piece's weight and produces normalized preference scores.

## 6. Conflict resolution

The brain should not be concatenated into 42 unrelated sentences without interpretation.

For each cycle:

1. Read all 42 selections.
2. Convert every option to its canonical effects.
3. Multiply effects by piece weights.
4. Aggregate effects by dimension.
5. Normalize each dimension to a defined range.
6. Supply the model with:
   - The complete piece-by-piece brain.
   - The aggregate preference vector.
   - The permanent protocol constitution.

Example:

```json
{
  "aggregate_preferences": {
    "risk_posture": 0.18,
    "equity_crypto_tilt": -0.24,
    "diversification": 0.51,
    "stable_reserve_bias": 0.32,
    "tag_preference:technology": 0.15,
    "tag_preference:crypto_major": -0.08
  }
}
```

Hard risk rules always outrank the aggregate preference vector.

## 7. Asset Registry

The Asset Registry is the source of truth for what the AI may hold.

Every approved asset has a permanent numeric ID and exact token contract:

```json
{
  "asset_id": 7,
  "symbol": "EXAMPLE",
  "name": "Example Asset",
  "token_contract": "0x0000000000000000000000000000000000000000",
  "decimals": 18,
  "asset_class": "tokenized_equity",
  "tags": ["technology", "ai_semiconductor"],
  "risk_tier": 2,
  "enabled": true,
  "oracle_id": "example_usd",
  "minimum_weight_bps": 0,
  "maximum_weight_bps": 1500,
  "minimum_liquidity_usd": 1000000,
  "approved_venue_ids": [1]
}
```

The contract address, not the symbol, establishes asset identity.

### 7.1 On-chain registry data

The on-chain registry should store:

- Numeric asset ID.
- Token contract and decimals.
- Enabled or paused state.
- Asset class.
- Category tags.
- Risk tier.
- Oracle configuration.
- Minimum and maximum allocation.
- Liquidity requirement.
- Approved execution venues.
- Registry version.

Only the configured asset-listing administrator may add, pause, or change assets. The AI and brain owners cannot modify this registry.

### 7.2 Dynamic cycle data

For every active asset, the hourly decision package includes:

- Current USD price.
- Price timestamp and age.
- Current basket balance and weight.
- One-hour, 24-hour, and seven-day returns.
- Realized volatility.
- Available DEX liquidity.
- Recent trading volume.
- Estimated spread.
- Expected price impact at several trade sizes.
- Correlation with current holdings.
- Market or oracle status.
- Whether buying, selling, or both are currently permitted.

Stable on-chain facts come from the Asset Registry. Dynamic statistics come from approved oracle, indexer, and market-data adapters and are hashed into the cycle input.

## 8. What the AI receives

A compact decision package should look conceptually like:

```json
{
  "cycle": {
    "cycle_id": 1205,
    "decision_horizon": "1h",
    "input_hash": "0x..."
  },
  "constitution": {
    "target_weight_total_bps": 10000,
    "allowed_asset_ids_only": true,
    "allow_hold_decision": true
  },
  "brain": {
    "version": 91,
    "pieces": [],
    "aggregate_preferences": {}
  },
  "portfolio": {
    "nav_usd": 1000000,
    "stable_reserve_bps": 2400,
    "current_weights_bps": []
  },
  "assets": [],
  "limits": {
    "maximum_positions": 10,
    "maximum_cycle_turnover_bps": 1000,
    "maximum_daily_turnover_bps": 3500,
    "minimum_stable_weight_bps": 2000
  }
}
```

The model sees every active asset as an option. It does not search Robinhood Chain or invent candidates.

For the MVP, the decision universe contains USDG plus no more than 24 active risk assets. Ornith may assign non-zero weight to no more than 10 assets including USDG. Candidates are synchronized daily from Robinhood's canonical metadata, but become active only after their contracts, price sources, on-chain liquidity, data completeness, permissions, and legal eligibility are validated.

Each active asset is accompanied by a structured dossier containing its identity, registry tags, trade permissions, basket position, price, returns, volatility, drawdown, trend metrics, liquidity, spread, price impact, correlation, applicable SEC-derived fundamentals, corporate-action status, source timestamps, formula versions, and validity flags.

All external input comes from free structured feeds. All derived metrics are calculated by versioned protocol code. Ornith does not browse, retrieve news, call tools, or receive AI-generated research.

## 9. What the AI returns

The AI returns the desired basket for the next hour:

```json
{
  "cycle_id": 1205,
  "input_hash": "0x...",
  "decision": "rebalance",
  "targets_bps": [
    {"asset_id": 0, "weight_bps": 2500},
    {"asset_id": 2, "weight_bps": 2000},
    {"asset_id": 7, "weight_bps": 1500},
    {"asset_id": 11, "weight_bps": 1500},
    {"asset_id": 14, "weight_bps": 2500}
  ],
  "confidence_bps": 7100,
  "reason_codes": [
    "BRAIN_EQUITY_LED",
    "TECHNOLOGY_OVERWEIGHT",
    "VOLATILITY_NORMAL"
  ]
}
```

The AI does not need to say "buy" or "sell."

## 10. How buys and sells are derived

The portfolio compiler calculates:

```text
target value = NAV × target weight
current value = current token balance × validated price
trade delta = target value - current value
```

- Positive delta means buy.
- Negative delta means sell.
- A zero or small delta means hold.

The compiler then applies:

- No-trade bands.
- Minimum trade sizes.
- Stable reserve requirements.
- Per-asset caps.
- Turnover limits.
- Liquidity limits.
- Slippage limits.
- Gas and execution-cost limits.
- Redemption requirements.

Example:

| Asset | Current | AI target | Raw action | Deterministic result |
| --- | ---: | ---: | --- | --- |
| USDG | 30% | 25% | Deploy 5% | Deploy 4%; preserve reserve |
| Technology asset | 15% | 22% | Buy 7% | Buy 5%; hit asset cap |
| Broad-market asset | 25% | 25% | Hold | No trade |
| Crypto major | 20% | 18% | Sell 2% | No trade; inside band |
| Speculative asset | 10% | 10% | Hold | No trade |

## 11. Asset-listing workflow

Before an asset becomes visible to the AI:

1. Verify the canonical token contract.
2. Verify decimals and transfer behavior.
3. Configure approved oracle sources.
4. Confirm liquidity and approved execution route.
5. Assign asset class, tags, and risk tier.
6. Set minimum and maximum weights.
7. Test deposits, transfers, swaps, and redemption compatibility.
8. Add the asset through the upgrade or asset-listing administrator.
9. Emit an on-chain registry event.
10. Include it in the next cycle's asset catalog.

Pausing an asset removes it from future purchases. The risk controller determines whether an existing position may be sold, held, or frozen during the pause.

## 12. Locked MVP configuration

1. The four weight tiers and 10,000 bps total brain weight are accepted.
2. All 42 pieces affect allocation. Piece 42 controls structured-data focus.
3. The 16 asset and sector affinities are accepted.
4. Asset and sector options are `Underweight / Neutral / Overweight`.
5. A new owner inherits the piece's current setting and may change it after ownership settles.
6. The creator-controlled risk-administrator role initially controls listing and pausing. It is separate from the model, keeper, executor, and vault-withdrawal roles and must migrate to a multisig before real-value deployment.
7. Ornith receives USDG plus up to 24 active risk assets and may hold at most 10 total positions.
8. Only free structured feeds and deterministically calculated metrics are used.
9. If an asset is disabled, the registry explicitly marks it `sell_only`, `hold_only`, or `frozen`; the deterministic risk controller applies that state.
10. The complete source and calculation policy is defined in `AI_DATA_POLICY.md`.
