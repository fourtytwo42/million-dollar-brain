# 42 Braincells Control Catalog

**Version:** 1.1

**Status:** Control Catalog v1 is deployed; Braincell Controls Experience v2 is active on devnet

**Pieces:** 42

**Supersedes for new development:** The single `-2` through `+2` selection model

**Preserves:** NFT IDs, affinities, influence weights, ownership, pricing, rewards, and profile customization

## Braincell Controls Experience v2

The packed Control Catalog v1 contract schema remains the stable on-chain
format. Experience v2 is the owner-facing interpretation of that schema:

- Every braincell exposes two or three character-specific levers. A tagged
  sector cell may also expose one qualified-asset picker.
- A choice shows no more than four meaningful options. Low-level institutional
  labels such as `Desk status`, `Preferred sleeve`, and `Desk lens` are never
  presented to users.
- Each option pairs meme copy with a plain-English allocator effect.
- Opening the editor prepares a normalized bundle. When the owner confirms,
  retired hidden knobs return to their canonical safe defaults, so invisible
  legacy choices cannot continue steering the allocator.
- Sector pieces select one chosen asset rather than three favorites plus a
  separate champion. Direct orders are limited to no order, prefer, reduce, or
  exit.
- Every proposed and confirmed bundle renders a deterministic, copyable
  `braincell decree`. It is entertainment and steering commentary; its factual
  settings remain derived from the exact on-chain bundle.

Experience v2 does not change contract addresses, packed storage, NFT state,
economics, eligibility rules, or safety precedence. It is versioned separately
as `BRAIN_CONTROL_EXPERIENCE_VERSION = 2`.

## 1. Product rule

Each braincell is a small, themed control panel, not a free-form prompt and not
one generic mood selector. Its owner chooses several closed, protocol-authored
settings. All changes for one braincell are submitted in one wallet
transaction.

Controls may change:

- Portfolio preferences and desired styles.
- Which already-qualified assets receive positive or negative attention.
- Whether an already-qualified asset may receive new buys.
- Desired reserve, concentration, responsiveness, and trade cadence.
- Which optional evidence and calculated timeframes receive scarce AI context
  and research attention.

Controls may never:

- Register or authorize a contract.
- Override asset qualification, oracle, halt, liquidity, slippage, reserve,
  concentration, turnover, or emergency-pause rules.
- Hide mandatory safety or accounting data.
- Supply user-authored text, prompts, arbitrary URLs, arbitrary token
  addresses, or arbitrary data sources to Ornith.
- Directly execute a trade or trigger an immediate AI cycle.

Profile names, portraits, animated media, and profile URLs remain
presentation-only and never enter model context.

## 2. Control vocabulary

The application may render a control as a toggle, segmented choice, fixed-step
slider, dial, multi-select chip group, ranked picker, budget allocator,
threshold, reaction matrix, or constrained rule card. Every control has a
stable numeric ID and closed value domain.

| Control kind       | Use                                    | Required bounds                     |
| ------------------ | -------------------------------------- | ----------------------------------- |
| `choice`           | One named choice                       | 2 to 8 protocol-authored values     |
| `toggle`           | Enable or disable one behavior         | Boolean                             |
| `step`             | Ordered numeric setting                | Fixed allowlisted steps             |
| `asset_set`        | Select qualified assets                | Registry IDs only; explicit maximum |
| `ranked_assets`    | Rank qualified assets                  | Registry IDs only; no duplicates    |
| `attention_budget` | Divide attention points                | Fixed total of 100 points           |
| `threshold`        | Select a trigger                       | Fixed protocol-authored thresholds  |
| `reaction`         | Map a validated condition to an action | Closed condition and action enums   |
| `rule_card`        | `WHEN -> DO -> TARGET -> WITH`         | Every field allowlisted and bounded |

Every value has:

- A meme label.
- A plain-English explanation.
- A canonical machine effect.
- A default.
- Any required data dependency.
- A deterministic unavailable-data fallback.

## 3. On-chain bundle

The target Brain Settings Registry stores one versioned bundle per piece:

```json
{
  "pieceId": 21,
  "schemaVersion": 1,
  "values": {
    "sectorStatus": "overweight",
    "favorites": [104, 119],
    "champion": 104,
    "selectionLens": "earnings_and_momentum",
    "exposureCeilingBps": 1500
  },
  "selectionVersion": 7,
  "effectiveCycle": 1440,
  "bundleHash": "0x..."
}
```

The contract validates the schema version, control IDs, value ranges,
selection counts, asset registry membership, and the owner's authority.
`setControlBundle(pieceId, schemaVersion, packedValues)` updates the entire
piece atomically and emits the version and bundle hash.

Asset references use stable registry IDs, never symbols or owner-provided
addresses. An asset removed from the qualified universe remains recorded in
history but becomes inert in new compilation.

## 4. Deterministic compilation and precedence

The compiler produces a `CompiledBrainV1` before each eligible cycle.
Conflicts resolve in this order:

1. Emergency pauses and immutable protocol limits.
2. Asset Registry eligibility and execution availability.
3. Restrictive asset directives: `exit`, `disabled`, `no_new_buys`, then
   `reduce`.
4. Reserve, concentration, position-count, volatility, and turnover limits.
5. Weighted sector and asset preferences.
6. Strategy, timing, evidence, and research-attention preferences.
7. Ornith's proposed allocation.

When several cells address the same asset:

- The most restrictive valid directive wins.
- Positive preference scores aggregate using immutable braincell weights.
- Equal restrictive directives break ties by lower canonical piece ID.
- No positive preference can reactivate an ineligible or restricted asset.

The compiler publishes:

- Effective portfolio preferences.
- Asset directives and weighted scores.
- Cadence and cooldown settings.
- Data-attention and research budgets.
- Inactive controls with reasons.
- Conflicts and their deterministic winners.
- The exact brain bundle hash used by the cycle.

## 5. Core mandate cells

### 1. The Moon-Bull Department — Capital Objective — 500 bps

- **Mission:** `Protect the bag` / `Compound responsibly` / `Number go up` /
  `Moon with paperwork`.
- **Risk appetite:** `Cardigan` / `Business casual` / `Leather jacket` /
  `No helmet`.
- **Loss budget:** 5%, 10%, 15%, or 20% target drawdown tolerance.
- **Profit priority:** capital stability, balanced total return, or
  appreciation.
- **Default:** Compound responsibly, Business casual, 10%, balanced total
  return.

### 2. The Suit-Hoodie Chimera — Equity Versus Crypto — 500 bps

- **Asset-class tilt:** equity-led, balanced, crypto-led.
- **Crypto risk budget:** 0%, 10%, 20%, or the protocol maximum.
- **Relative-strength switch:** follow the stronger class, fade the stronger
  class, or ignore class rotation.
- **Class veto:** none, no new equity buys, or no new crypto buys.
- **Default:** balanced, 10%, follow stronger class, none.

### 3. The Basket Case — Diversification — 500 bps

- **Desired risk positions:** 2, 4, 6, or 9.
- **Preferred maximum position:** 8%, 12%, 16%, or the protocol maximum.
- **Correlation allergy:** none, mild, strong, or `Octopus intervention`.
- **Diversification method:** equal-ish, risk-balanced, conviction-weighted,
  or sector-spread.
- **Required mix:** none, two asset classes, three sectors, or one defensive
  sleeve.
- **Default:** 6 positions, 16%, strong, risk-balanced, two asset classes.

### 4. Time-Horizon Time Machine — Holding Horizon — 500 bps

- **Base AI review cadence:** `Touch grass` (24h), `Long lunch` (6h),
  `Committee meeting` (4h), `Default timeline` (1h), `Doomscroll` (30m), or
  `Refresh goblin` (15m).
- **Decision horizon:** intraday, multi-day, multi-week, or regime.
- **Evidence emphasis:** short, balanced, medium, or long windows.
- **Minimum thesis age:** one cycle, 4h, 24h, or 7d before a non-risk reversal.
- **Default:** Default timeline, multi-day, balanced, 4h.

### 5. Dry-Powder Goblin — Stable Reserve — 500 bps

- **Desired USDG reserve:** 20%, 25%, 30%, 40%, or 50%.
- **Deploy trigger:** always evaluate, confirmed opportunity, broad drawdown,
  or panic discount.
- **Deploy amount:** nibble, standard, double scoop, or to target.
- **Replenish reserve:** trim winners, trim weakest, proportional, or new flows
  only.
- **Default:** 25%, confirmed opportunity, standard, proportional.

### 6. Caffeinated Hummingbird — Responsiveness — 500 bps

- **Adaptive cadence:** off, volatility only, drawdown only, or
  volatility-and-drawdown.
- **Panic review cadence:** 15m, 30m, or 1h.
- **Panic-mode duration:** one review, 2h, 6h, or until conditions normalize.
- **Target-change sensitivity:** sleepy, normal, caffeinated, or vibrating.
- **Immediate-cycle rule:** permanently unavailable; a setting change waits
  for the next eligible scheduler check.
- **Default:** volatility-and-drawdown, 30m, 2h, normal.

## 6. Strategy cells

### 7. Momentum Moth — Trend Response — 300 bps

- Timeframes: select up to three from 1h, 4h, 24h, 7d, 30d, and 90d.
- Signals: select up to three from price trend, relative strength, volume
  confirmation, breakout, and moving-average slope.
- Style: fade, confirm then follow, or chase within limits.
- Failed-breakout response: hold, reduce, or exit.
- Default: 24h and 7d; price trend and relative strength; confirm then follow;
  reduce.

### 8. Bargain-Bin Prophet — Valuation Style — 300 bps

- Valuation lens: earnings, sales, cash flow, book value, or blended.
- Discount demand: none, modest, large, or clearance aisle.
- Growth tolerance: low, balanced, or pay-up-for-growth.
- Value trap response: ignore, require quality, or require improving trend.
- Default: blended, modest, balanced, require quality.

### 9. The Adult in the Room — Fundamental Quality — 300 bps

- Quality checklist: profitability, balance sheet, cash flow, earnings
  stability, and dilution; choose up to four.
- Minimum checklist passes: one, two, three, or all selected.
- Deterioration response: watch, no new buys, reduce, or exit.
- Missing fundamentals: neutral, penalize, or exclude from positive scoring.
- Default: profitability, balance sheet, cash flow; two; reduce; penalize.

### 10. Volatility Vampire — Volatility — 300 bps

- Volatility appetite: avoid, harvest modestly, embrace, or feast.
- Measurement window: 24h, 7d, 30d, or blended.
- Drawdown response: buy, hold, reduce, or exit.
- High-volatility combined budget: 10%, 20%, or protocol maximum.
- Default: harvest modestly, blended, reduce, 20%.

### 11. Big-Fish Energy — Company Size — 300 bps

- Size preference: mega, large, mid, or no preference.
- Market-cap floor preference: $100M, $1B, $10B, or $100B.
- Liquidity over size: never, when close, or always.
- Concentration in largest asset: standard, reduced, or minimum.
- Default: large, $1B, always, standard.

### 12. Yield Goblin — Return Style — 300 bps

- Return style: income, total return, or appreciation.
- Yield quality: raw yield, covered yield, dividend growth, or stability.
- Distribution treatment: reinvest, reserve, or rebalance.
- Yield trap response: ignore yield, reduce, or exit.
- Default: total return, stability, rebalance, reduce.

### 13. Mean-Reversion Pigeon — Mean Reversion — 300 bps

- Mean window: 24h, 7d, 30d, or blended.
- Entry distance: small, medium, large, or extreme.
- Confirmation: none, liquidity, trend stabilization, or both.
- Snapback exit: hold thesis, trim, or close.
- Default: 7d, medium, both, trim.

### 14. Green-Candle Salamander — Breakouts — 300 bps

- Breakout window: 4h, 24h, 7d, or 30d.
- Confirmation: price only, volume, breadth, or price-volume-breadth.
- Entry response: watch, nibble, standard, or strong preference.
- Failure response: hold, reduce, or exit.
- Default: 24h, volume, standard, reduce.

### 15. Main-Character Energy — Relative Strength — 300 bps

- Compare against: basket, sector, SPY, QQQ, SOXX, ETH, or USDG; choose up to
  three available references.
- Leadership window: 24h, 7d, 30d, or blended.
- Leader treatment: watch, prefer, spotlight, or core candidate.
- Fallen-star response: forgive once, reduce, or exit.
- Default: basket and sector, 7d, prefer, reduce.

### 16. Dip-Buying Pelican — Drawdowns — 300 bps

- Dip definition: 24h pullback, 7d drawdown, 30d drawdown, or off-high.
- Allowed targets: current holdings, qualified favorites, sector leaders, or
  all qualified assets.
- Bite size: nibble, standard, double scoop.
- Falling-knife policy: no confirmation, stabilization, or reversal required.
- Average-down limit: never, once, twice, or to risk cap.
- Default: 7d drawdown, current holdings, standard, stabilization, once.

### 17. Bag-Management Golem — Winner Management — 300 bps

- Winner definition: +5%, +10%, +20%, or top-decile relative strength.
- Winner response: let run, rebalance to target, trim excess, or lock profit.
- Add-to-winner policy: never, confirmed only, or within target.
- Loser funding rule: never sell winners for losers, proportional, or
  conviction-led.
- Default: +10%, rebalance to target, confirmed only, proportional.

### 18. Correlation Octopus — Correlation — 300 bps

- Correlation window: 7d, 30d, 90d, or blended.
- Cluster tolerance: low, balanced, high.
- Cluster treatment: cap group, prefer best member, or accept thesis cluster.
- Diversifier preference: none, moderate, or strong.
- Default: 30d, balanced, prefer best member, strong.

## 7. Sector and asset cells

Cells 19 through 34 share these bounded controls:

- **Sector status:** off, watch, normal, overweight, or feast.
- **Favorites:** up to three currently qualified assets with the cell's
  registry tag.
- **Champion:** automatic or one favorite.
- **Asset directive:** one tagged asset may be marked eligible, preferred,
  spotlight, core candidate, reduce, no new buys, disabled, or exit.
- **Exposure preference:** 0%, 5%, 10%, 15%, or the applicable protocol cap.

`Off` and restrictive asset directives affect only qualified assets already
inside the cell's canonical tag. They cannot alter the registry.

|  ID | Character and affinity                      | Bespoke lever                                                                                                                                                                                      | Default                                                                    |
| --: | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
|  19 | Normie Core — Broad market                  | Breadth regime: narrow, normal, broad; benchmark lens: SPY, equal-weight proxy, or basket                                                                                                          | Normal; no favorites; automatic; no directive; 10%; normal breadth         |
|  20 | Silicon-Valley Brain — Technology           | Growth/quality balance: quality, balanced, growth                                                                                                                                                  | Normal; automatic; 10%; balanced                                           |
|  21 | The Wafer Cult — AI and semiconductors      | Stack layer: designers, foundries, equipment, infrastructure, or full stack; selection lens: earnings, momentum, valuation, or blended                                                             | Normal; automatic; 15%; full stack; blended                                |
|  22 | Banker Brain — Financials                   | Rate sensitivity: falling, neutral, or rising-rate beneficiaries                                                                                                                                   | Normal; automatic; 10%; neutral                                            |
|  23 | Lab-Rat Portfolio — Healthcare              | Catalyst risk: avoid, measured, or embrace; evidence: commercial, clinical, or blended                                                                                                             | Normal; automatic; 10%; measured; blended                                  |
|  24 | Mall-Rat Economics — Consumer discretionary | Consumer signal: spending, employment, sentiment, or blended                                                                                                                                       | Normal; automatic; 10%; blended                                            |
|  25 | Doomsday Hamster — Consumer staples         | Defensive trigger: always, risk-off only, drawdown only, or off                                                                                                                                    | Normal; automatic; 10%; risk-off only                                      |
|  26 | Hard-Hat Arc — Industrials                  | Cycle stage: early, mid, late, or all-weather                                                                                                                                                      | Normal; automatic; 10%; all-weather                                        |
|  27 | Dinosaur-Juice Baron — Energy               | Commodity sensitivity: avoid, balanced, or embrace                                                                                                                                                 | Normal; automatic; 10%; balanced                                           |
|  28 | Grid Lord — Utilities                       | Utility style: defensive, yield, growth infrastructure, or blended                                                                                                                                 | Normal; automatic; 10%; blended                                            |
|  29 | Attention Hydra — Communications and media  | Comparison set: basket, sector, SPY, QQQ, ETH; select up to three; timeframe set: 1h, 4h, 24h, 7d, 30d, 90d; select up to four; conflict policy: newest, longest, majority, or confidence-weighted | Normal; automatic; 10%; basket/sector/QQQ; 24h/7d/30d; confidence-weighted |
|  30 | Landlord Hermit Crab — Real estate and RWA  | Income/appreciation balance: income, balanced, appreciation                                                                                                                                        | Normal; automatic; 10%; balanced                                           |
|  31 | Digital-Rock Golem — Major crypto           | Crypto regime: BTC-led, ETH-led, broad, or defensive; dominance response: follow, fade, or ignore                                                                                                  | Normal; automatic; 15%; broad; follow                                      |
|  32 | DeFi Scarecrow — DeFi and native protocols  | Protocol quality: fees, users, TVL quality, governance risk, or blended                                                                                                                            | Watch; automatic; 5%; blended                                              |
|  33 | Shiny-Object Dragon — Tokenized commodities | Commodity sleeve: metals, energy, agriculture, or diversified; inflation response: follow, confirm, or ignore                                                                                      | Watch; automatic; 5%; diversified; confirm                                 |
|  34 | Meme-Lord Marionette — Meme and speculative | Speculation budget: 0%, 2%, 5%, or protocol cap; entry proof: liquidity, momentum, both, or vibes forbidden                                                                                        | Watch; automatic; 2%; both                                                 |

## 8. Decision-behavior cells

### 35. Macro Weather Goblin — Macro Sensitivity — 125 bps

- Macro groups: rates, curve, inflation, employment, liquidity, and risk
  regime; choose up to four.
- Macro weight: ignore, supporting, strong, or regime boss.
- Reaction matrix: risk-on, neutral, and risk-off each map to deploy, hold,
  raise reserve, or reduce risk.
- Stale macro response: omit, reduce confidence, or Hold if the owner-selected
  rule requires it.
- Default: rates/inflation/employment/risk regime; supporting;
  deploy/hold/raise reserve; omit.

### 36. Headline-Risk Manager — Corporate Actions — 125 bps

- Structured event types: earnings, dividends, splits, offerings, mergers,
  guidance, and regulatory actions; choose up to five.
- Before-event posture: ignore, reduce new buys, reduce exposure, or exit.
- After-event wait: none, one session, two sessions, or one week.
- Surprise response: hold, re-score, reduce, or exit.
- Default: earnings/offerings/mergers/guidance/regulatory; reduce new buys;
  one session; re-score.

### 37. Exit-Liquidity Unicorn — Liquidity — 125 bps

- Minimum depth preference: $250K, $500K, $1M, or $5M.
- Maximum preferred impact: 0.25%, 0.5%, 0.75%, or 1%.
- Spread tolerance: tight, normal, or protocol maximum.
- Liquidity deterioration: watch, no new buys, reduce, or exit.
- Default: $500K, 0.5%, normal, reduce.

### 38. Gas-Fee Furnace — Trading Costs — 125 bps

- Minimum time between executed rebalances: 15m, 30m, 1h, 4h, or 24h.
- Minimum drift before trading: 0.5%, 1%, 2%, 3%, or 5%.
- Maximum desired turnover per cycle: 5%, 10%, 20%, or protocol maximum.
- Execution attitude: penny-pincher, balanced, signal-first.
- Dust handling: leave as USDG or fold into largest required trade.
- Default: 1h, 2%, 10%, balanced, leave as USDG.

### 39. Trust-Issues Owl — Confidence — 125 bps

- Evidence checklist: price coverage, liquidity, fundamentals, valuation,
  macro, correlation, outcomes, and corporate events; choose up to six.
- Minimum satisfied: one, half, majority, or all selected.
- Source conflict: use safer value, lower confidence, omit field, or Hold.
- Immature optional metric: omit, penalize, or prevent positive scoring.
- Research queue: off or up to 1, 2, or 4 registered assets.
- Default: price/liquidity/fundamentals/correlation/outcomes; majority; lower
  confidence; omit; two assets.

### 40. Victory-Lap Racehorse — Profit Taking — 125 bps

- Trigger: +5%, +10%, +20%, +30%, or trailing drawdown.
- Action: hold, trim to target, trim fixed amount, or raise reserve.
- Fixed trim: 10%, 25%, or 50% of excess exposure.
- Re-entry: never, after cooldown, after new high, or after renewed evidence.
- Default: +20%, trim to target, 25%, after renewed evidence.

### 41. First-Date Filter — New Positions — 125 bps

- New-position confidence: standard, high, or extremely online but skeptical.
- Starter size: 1%, 2%, 5%, or target size.
- Confirmation count: one, two, or three independent signals.
- Trial period: one cycle, 4h, 24h, or 7d.
- Failure response: hold, reduce, or exit.
- Default: high, 2%, two signals, 24h, exit.

### 42. Data-Diet Chef — Context and Data Focus — 125 bps

- **Attention budget:** allocate exactly 100 points among price/technical,
  fundamentals, valuation, macro, liquidity/execution, portfolio history,
  decision outcomes, and corporate events.
- **Context appetite:** compact, balanced, or full within the 96K hard budget.
- **History windows:** choose up to four from 1h, 4h, 24h, 7d, 30d, 90d, and
  since-entry.
- **Truncation priority:** freshest-first, holdings-first, risks-first, or
  balanced.
- **Optional detail depth:** holdings only, holdings plus favorites, top 32, or
  top 64 qualified assets.
- **Default:** 20 technical, 15 fundamentals, 10 valuation, 10 macro, 15
  liquidity, 10 portfolio history, 10 outcomes, 10 corporate events; balanced;
  24h/7d/30d/since-entry; balanced; top 64.

Attention changes prominence and optional detail. It never removes the
mandatory fields in Section 9.

## 9. Mandatory data and optional attention

Every cycle always includes:

- Exact chain, registry ID, contract, permissions, and qualification state.
- Current balance, value, weight, reserve, NAV, supply, cost basis, and P&L.
- Validated price, timestamp, age, bid, ask, spread, liquidity, halt state,
  oracle pause, and corporate-action transition.
- Hard portfolio limits, pending flows, current target, previous execution,
  and current execution availability.
- The complete compact directory of qualified assets.

Owner controls allocate optional attention among calculated features, longer
history, fundamentals, macro, comparisons, outcome evidence, and bounded
research. Raw candles, unlimited events, old prompts, prior conversations, and
web prose never enter context.

Ornith may request one structured research round for at most the compiled
research limit, capped at four by this catalog and sixteen by the protocol.
The orchestrator accepts only registered asset IDs and protocol-defined
questions. If the complete compact qualified-asset directory cannot fit the
96K deterministic budget, the cycle Holds and raises an operational alert.

## 10. Cadence semantics

A scheduler eligibility worker wakes every five minutes. It reads the compiled
on-chain cadence and decides whether a cycle is eligible. It does not rewrite
systemd timers.

- Base cadence is selected by Piece 4.
- Piece 6 may temporarily shorten review cadence after validated volatility or
  drawdown triggers.
- Piece 38 sets minimum time between executed trades and minimum drift.
- One inference/execution cycle may be active at a time.
- No owner setting change starts a cycle immediately.
- Missed windows do not create a backlog.
- Emergency pause, stale mandatory data, cooldown, turnover caps, and risk
  rules always win.
- A review may produce Hold or skip execution when drift is insufficient.

Cycle history records base cadence, effective cadence, normal or panic mode,
eligibility reason, time since prior cycle and trade, drift, Hold reason, and
execution result.

## 11. Owner experience

The selected-cell inspector shows:

1. A concise compiled steering summary.
2. Current owner, influence, price, rewards, and profile.
3. A clear **Change controls** action when the active wallet owns the cell.
4. A panel or modal with meme labels and plain-English explanations.
5. A preview of current versus proposed compiled effects, affected assets,
   inactive dependencies, conflicts, and next eligible cycle.
6. One wallet confirmation for the complete valid bundle.

The form contains no free text. Asset pickers show only currently qualified
registry assets in the control's allowed tag or scope. Invalidated assets are
identified before submission and cannot be saved.

## 12. Migration from catalog v3

`BRAIN_PRESET_CATALOG.md` remains the historical catalog-v3 record, rollback
format, and migration source. Each of its five moods maps to a protocol-authored control bundle for
the corresponding piece.

The upgrade:

- Appends storage through the existing UUPS pattern.
- Initializes each bundle from the piece's current catalog-v3 selection.
- Preserves ownership, prices, rewards, profile serials, and all economics.
- Preserves the old selection and instruction in historical cycle evidence.
- Starts new cycles with `brainControlSchemaVersion: 1`.
- Does not require owners to transact during migration.

Devnet may compile Control Catalog v1 after its coordinated contract, UI,
compiler, replay, and browser acceptance pass. Testnet must promote that exact
pushed commit in place and enable Control Catalog v1 only after its migration
reconciles. Mainnet inherits it solely through the normal graduation pipeline.

## 13. Acceptance criteria

- Exactly 42 pieces and the existing immutable influence weights remain.
- Every control has a closed domain, default, effect, dependency, and fallback.
- A single piece update uses one transaction and one emitted bundle hash.
- Arbitrary text, URLs, contracts, and data sources cannot enter AI steering.
- Restrictive asset directives fail closed and cannot register an asset.
- Mandatory safety and accounting data cannot be disabled or de-prioritized
  out of context.
- Cadence never runs faster than 15 minutes or slower than 24 hours.
- Scheduler, cooldown, concurrency, Hold, and no-backlog behavior are
  deterministic and replayable.
- The compiler produces identical output for identical registry, data,
  ownership, and control snapshots.
- Catalog-v3 state migrates without changing ownership, economics, or history.
- Desktop, tablet, mobile, keyboard, screen-reader, external-wallet, and
  wrong-chain UAT cover the complete control editor and preview.
