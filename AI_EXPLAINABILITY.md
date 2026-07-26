# MillionDollar Brain AI Explainability

**Version:** 0.1 proposal  
**Status:** Draft for review

## 1. Explainability principle

The application should explain the complete path from NFT-owned settings to executed portfolio changes:

```text
NFT ownership and settings
        ↓
Locked brain snapshot
        ↓
Weighted preference vector
        ↓
Ornith target allocation
        ↓
Deterministic risk adjustments
        ↓
Executed trades
        ↓
Resulting basket
```

The interface must distinguish between facts the protocol can prove and explanations reported by the model.

## 2. Three evidence levels

### 2.1 Verified on-chain facts

These are authoritative:

- NFT owner at the snapshot block.
- Piece affinity, selected option, and weight.
- Brain version.
- Asset Registry version.
- Basket balances and validated prices.
- Ornith's signed final target output.
- Risk-controller adjustments.
- Executed transactions.
- Resulting holdings.

### 2.2 Deterministically derived explanations

These are calculated from protocol-defined rules:

- Which pieces contributed to each aggregate preference.
- Weighted preference scores.
- Conflicting presets that offset one another.
- Current-versus-target allocation deltas.
- Which hard rule capped, blocked, or modified a target.
- Why a trade was skipped due to bands, cost, liquidity, or slippage.

### 2.3 Model-cited factors

These are Ornith's structured account of what it considered important:

- Which aggregate brain preferences it cited.
- Which market-statistic reason codes it cited.
- Which asset tags it associated with a target.
- Its confidence score.

Model-cited factors are useful but are not mathematical proof of internal causation. The interface should label them as "Ornith cited," not "the protocol proved."

## 3. Do not show raw chain-of-thought

Ornith's reasoning stream is not the official protocol explanation.

Reasons:

- It may be incomplete or inconsistent.
- It is not a reliable measure of actual model causation.
- It can consume substantial output tokens.
- It may contain irrelevant internal deliberation.
- The on-chain system validates only the final structured output.

The product should parse and publish:

- Final target JSON.
- Approved reason codes.
- Bounded final summary.
- Deterministic validation and execution results.

The raw reasoning stream may be retained in restricted operational logs when needed for debugging, but it should not drive contracts or be presented as authoritative financial reasoning.

## 4. Brain snapshot

Every scheduled cycle locks a specific brain snapshot:

```json
{
  "cycle_id": 1205,
  "snapshot_block": 345678,
  "brain_version": 91,
  "pieces": [
    {
      "piece_id": 20,
      "owner": "0x42...A91",
      "affinity_id": "technology",
      "option_id": 2,
      "option_label": "Overweight",
      "weight_bps": 150
    }
  ],
  "brain_hash": "0x..."
}
```

The UI should let users inspect all 42 pieces exactly as Ornith received them.

## 5. Weighted preference compilation

Every selected option maps to protocol-defined numeric effects.

Example:

```text
Technology piece
Setting: Overweight
Piece weight: 1.5%
Effect: technology preference +1
Weighted contribution: +0.015
```

The compiler aggregates every contribution:

```json
{
  "technology_preference": 0.22,
  "growth_preference": 0.18,
  "stable_reserve_bias": 0.32,
  "diversification_preference": 0.51,
  "crypto_preference": -0.08
}
```

These scores are exact outputs of the brain compiler, not model interpretations.

## 6. Conflict presentation

Contradictory pieces are expected and should be visible.

Example:

```text
Growth preference

+0.30  Capital Objective: Maximum growth
+0.12  Valuation Style: Growth
-0.18  Drawdown Reaction: Reduce exposure
-0.06  Stable Reserve: High reserve
-----
+0.18  Net growth preference
```

The UI should describe this as:

> The brain leaned toward growth, but defensive settings reduced the strength of that preference.

## 7. Required Ornith output additions

In addition to target weights, Ornith should return structured decision attribution:

```json
{
  "cycle_id": 1205,
  "input_hash": "0x...",
  "decision": "rebalance",
  "targets_bps": [
    {"asset_id": 0, "weight_bps": 2500},
    {"asset_id": 7, "weight_bps": 2000}
  ],
  "confidence_bps": 7100,
  "cited_brain_factors": [
    {
      "factor_id": "technology_preference",
      "direction": "positive",
      "importance_bps": 3500,
      "affected_asset_ids": [7]
    },
    {
      "factor_id": "stable_reserve_bias",
      "direction": "positive",
      "importance_bps": 2200,
      "affected_asset_ids": [0]
    }
  ],
  "cited_market_factors": [
    {
      "reason_code": "RELATIVE_STRENGTH_POSITIVE",
      "affected_asset_ids": [7]
    }
  ],
  "summary_code": "GROWTH_WITH_RESERVE"
}
```

Requirements:

- `factor_id` must exist in the compiled preference vector.
- Asset IDs must exist in the supplied Asset Registry.
- Importance values are explanatory and do not directly control allocations.
- Reason and summary codes come from approved enumerations.
- The frontend creates human-readable sentences from canonical templates.

## 8. Brain-to-trade trace

Each cycle should display five stages.

### Stage 1: Brain requested

Show the strongest compiled preferences:

```text
Technology                   +0.22
Growth                       +0.18
Stable reserve               +0.32
Diversification              +0.51
Crypto                       -0.08
```

Each row expands to the NFT pieces, owners, settings, and weighted contributions behind it.

### Stage 2: Ornith proposed

Show:

- Previous target.
- New target.
- Difference.
- Ornith-cited brain factors.
- Ornith-cited market factors.
- Confidence.

### Stage 3: Protocol constrained

Show every deterministic change:

```text
Ornith proposed technology: 24%
Hard maximum:               20%
Approved target:            20%
Adjustment:                 -4%
```

### Stage 4: Trades executed

Show:

- Asset sold.
- Asset bought.
- Expected amount.
- Actual amount.
- Slippage.
- Gas.
- Transaction link.

### Stage 5: Result

Show:

- Basket before.
- Target.
- Basket after.
- Remaining drift.
- NAV before and after.
- Next scheduled cycle.

## 9. Homepage Brain Pulse

The homepage should summarize the current brain in a compact "Brain Pulse" card:

```text
BRAIN PULSE

Growth               Moderate ↑
Technology           Strong ↑
Crypto               Slight ↓
Stable reserve       Moderate ↑
Diversification      Strong ↑

Last changed:
Piece 20 selected Technology: Overweight

Effective:
Cycle 1205
```

This lets visitors understand the active steering without inspecting all 42 pieces.

## 10. Visual influence map

During and after a cycle, the UI may draw lines from brain pieces to preference nodes and then to affected assets.

Visual rules:

- Violet line: verified piece-to-preference contribution.
- Cyan line: Ornith-cited preference-to-asset relationship.
- Gold line: executed allocation change.
- Gray dashed line: proposed but blocked or skipped.

Line thickness represents influence or allocation magnitude.

A legend must explain that cyan model-cited lines are self-reported attribution, while violet and gold relationships are deterministically verified.

## 11. Piece-level history

Each Piece Detail drawer should show:

- Current owner and setting.
- Effective cycle.
- Historical setting changes.
- Cycles in which Ornith cited the piece's aggregate preference.
- Assets associated with those cycles.
- Whether risk rules blocked the resulting preference.
- Rewards earned.

Do not claim that a single piece caused a return or trade. Multiple settings, market data, current holdings, and protocol limits contribute to every decision.

## 12. Cycle timeline

Every Cycle Detail screen should show:

```text
12:00:00  Brain snapshot locked
12:00:01  Market snapshot accepted
12:00:03  Decision package sent to GPU45
12:00:08  Ornith final output received
12:00:09  Schema validated
12:00:10  Risk controller adjusted two targets
12:00:12  Three trades executed
12:00:13  Result recorded
```

During a live cycle, the timeline updates rather than showing an indefinite spinner.

## 13. Plain-language decision summary

The frontend should generate summaries from verified data and approved templates:

> The brain favored technology, growth, and a larger stable reserve. Ornith proposed increasing two technology-tagged assets while keeping 25% in USDG. The protocol reduced one target from 24% to the 20% asset maximum. Two trades executed; one smaller adjustment was skipped because it remained inside its no-trade band.

The summary should link every claim to the relevant brain contribution, model output, constraint, or transaction.

## 14. User-facing terminology

Prefer:

- "Brain requested"
- "Ornith proposed"
- "Protocol approved"
- "Trades executed"
- "Ornith cited"
- "Verified on-chain"
- "Skipped because..."

Avoid:

- "The AI was thinking..."
- "This NFT caused..."
- "Guaranteed influence"
- "The model knew..."
- "The model predicted..."

## 15. Success criteria

A user viewing any cycle should be able to answer:

1. Which brain snapshot was used?
2. Which NFT settings created the strongest preferences?
3. Which preferences conflicted?
4. What allocation did Ornith propose?
5. Which factors did Ornith cite?
6. What did deterministic rules change?
7. Which trades executed?
8. What does the basket hold now?

