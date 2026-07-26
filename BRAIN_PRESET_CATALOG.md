# MillionDollar Brain Preset Catalog

**Version:** 0.3
**Status:** AI-facing collectible catalog v3
**Pieces:** 42  
**Options per piece:** 5

## 1. How presets work

Every brain piece is both a collectible character and a bounded portfolio control. It has a unique name, glyph, crew, tagline, lore, immutable affinity, and five closed "moods." Character flavor is shown to people; the selected mood's signed value and canonical instruction are supplied to Ornith.

The complete character identities and mood names are defined in `BRAIN_CHARACTERS.md`. No owner-authored text enters model context.

The selected option creates:

1. A canonical instruction supplied to Ornith.
2. One or more machine-readable preference effects.
3. A weighted contribution based on the piece's immutable influence weight.

Directional mood values are:

- Mood 0: `-2`, strongest preference toward the first pole.
- Mood 1: `-1`, moderate preference toward the first pole.
- Mood 2: `0`, neutral/default behavior.
- Mood 3: `+1`, moderate preference toward the second pole.
- Mood 4: `+2`, strongest preference toward the second pole.

The weighted effect is conceptually:

`weighted contribution = option effect × piece weight`

Presets express preferences. They cannot:

- Add an asset.
- Change an asset contract.
- Override a hard risk limit.
- Override the stable-reserve minimum.
- Override liquidity, oracle, turnover, or slippage limits.
- Directly execute a trade.

## 2. Locked MVP starting defaults

The starting brain uses each character's middle mood and is intentionally neutral:

- Balanced portfolio objective.
- Balanced equity and crypto mix.
- Balanced diversification.
- Multi-day horizon.
- Balanced reserve.
- Normal rebalance responsiveness.
- Mostly neutral strategy and sector options.
- Analytical explanation style.

Owners then move the brain away from neutral through on-chain setting changes.

## 3. Core mandate pieces

### Piece 1: Capital Objective

**Weight:** 500 bps  
**Default:** Balanced growth

| Option          | Meaning                       | Effect                                                                                   |
| --------------- | ----------------------------- | ---------------------------------------------------------------------------------------- |
| Preserve        | Favor capital stability       | Prefer stable reserve, broad assets, lower volatility, and smaller target changes.       |
| Balanced growth | Balance risk and appreciation | Apply no strong preservation or maximum-growth bias.                                     |
| Maximum growth  | Favor appreciation            | Prefer growth and higher-beta opportunities while remaining inside hard exposure limits. |

This controls the overall portfolio posture. It does not remove the hard stable reserve or permit leverage.

### Piece 2: Equity Versus Crypto

**Weight:** 500 bps  
**Default:** Balanced mix

| Option       | Meaning                                           | Effect                                                                                           |
| ------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Equity-led   | Prefer tokenized equities and broad-market assets | Positively scores equity-tagged assets and negatively scores crypto-tagged assets.               |
| Balanced mix | No broad asset-class preference                   | Lets other brain and market signals decide.                                                      |
| Crypto-led   | Prefer approved crypto assets                     | Positively scores crypto-major and DeFi-native assets within the protocol's crypto exposure cap. |

### Piece 3: Diversification

**Weight:** 500 bps  
**Default:** Balanced

| Option   | Meaning                                              | Effect                                                                         |
| -------- | ---------------------------------------------------- | ------------------------------------------------------------------------------ |
| Broad    | Prefer more positions and smaller individual weights | Rewards lower concentration and lower portfolio correlation.                   |
| Balanced | Moderate diversification                             | Uses the standard position-count and concentration preferences.                |
| Focused  | Prefer fewer high-conviction positions               | Allows targets to move closer to per-asset maximums when confidence is strong. |

This changes desired concentration, not the hard maximum position weight.

### Piece 4: Holding Horizon

**Weight:** 500 bps  
**Default:** Multi-day

| Option    | Meaning                          | Effect                                                                                         |
| --------- | -------------------------------- | ---------------------------------------------------------------------------------------------- |
| Tactical  | Emphasize recent conditions      | Gives more importance to one-hour and 24-hour statistics.                                      |
| Multi-day | Balance short and medium windows | Emphasizes 24-hour and seven-day statistics.                                                   |
| Patient   | Emphasize durable conditions     | Gives more importance to seven-day and longer-horizon data and penalizes unnecessary turnover. |

### Piece 5: Stable Reserve Preference

**Weight:** 500 bps  
**Default:** Balanced reserve

| Option            | Meaning                             | Effect                                                                        |
| ----------------- | ----------------------------------- | ----------------------------------------------------------------------------- |
| Minimum permitted | Operate near the hard reserve floor | Favors deploying stable assets while preserving the mandatory minimum.        |
| Balanced reserve  | Maintain a moderate buffer          | Targets a reserve between the hard minimum and configured high-reserve level. |
| High reserve      | Hold additional stable assets       | Positively scores USDG and reduces desired risk-asset deployment.             |

### Piece 6: Rebalance Responsiveness

**Weight:** 500 bps  
**Default:** Normal

| Option     | Meaning                                        | Effect                                                                          |
| ---------- | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| Patient    | Require stronger changes before moving targets | Penalizes frequent target changes and favors holding the current allocation.    |
| Normal     | Standard responsiveness                        | Uses normal target-change sensitivity.                                          |
| Responsive | React more quickly to new data                 | Allows stronger target changes, still subject to turnover and execution limits. |

## 4. Strategy pieces

### Piece 7: Trend Response

**Weight:** 300 bps  
**Default:** Neutral

| Option        | Effect                                                                |
| ------------- | --------------------------------------------------------------------- |
| Fade trends   | Prefer qualified assets that have weakened relative to recent trends. |
| Neutral       | Apply no overall trend-following preference.                          |
| Follow trends | Prefer assets with positive, confirmed trend strength.                |

### Piece 8: Valuation Style

**Weight:** 300 bps  
**Default:** Neutral

| Option  | Effect                                                                                                 |
| ------- | ------------------------------------------------------------------------------------------------------ |
| Value   | Prefer approved equities with lower valuations or stronger cash-flow yield.                            |
| Neutral | Do not favor value or growth valuation styles.                                                         |
| Growth  | Prefer approved equities with stronger revenue or earnings growth, while tolerating higher valuations. |

**Data required:** Approved fundamental and valuation feed.

### Piece 9: Fundamental Quality

**Weight:** 300 bps  
**Default:** Balanced

| Option        | Effect                                                                                              |
| ------------- | --------------------------------------------------------------------------------------------------- |
| Quality-first | Prefer profitability, stable earnings, stronger balance sheets, and lower financial risk.           |
| Balanced      | Apply a moderate quality filter.                                                                    |
| Speculative   | Allow lower-quality, higher-uncertainty assets to score more strongly within hard speculative caps. |

**Data required:** Approved fundamental feed.

### Piece 10: Volatility Preference

**Weight:** 300 bps  
**Default:** Neutral

| Option         | Effect                                                                  |
| -------------- | ----------------------------------------------------------------------- |
| Low volatility | Prefer assets with lower realized volatility and smaller drawdowns.     |
| Neutral        | Apply no broad volatility preference.                                   |
| High beta      | Prefer more volatile assets when other evidence and risk limits permit. |

### Piece 11: Company-Size Preference

**Weight:** 300 bps  
**Default:** Large-cap mix

| Option         | Effect                                               |
| -------------- | ---------------------------------------------------- |
| Mega-cap       | Prefer the largest approved companies and assets.    |
| Large-cap mix  | Apply a moderate size preference.                    |
| Smaller assets | Allow smaller approved assets to rank more strongly. |

**Data required:** Approved market-cap feed.

### Piece 12: Return Style

**Weight:** 300 bps  
**Default:** Balanced

| Option               | Effect                                                              |
| -------------------- | ------------------------------------------------------------------- |
| Income and stability | Prefer dividend, distribution, or stable-cash-flow characteristics. |
| Balanced             | Apply no strong income or capital-growth preference.                |
| Capital appreciation | Prefer price-growth potential over current income.                  |

**Data required:** Approved dividend and fundamental feed for equities.

### Piece 13: Mean-Reversion Preference

**Weight:** 300 bps  
**Default:** Moderate

| Option   | Effect                                                                       |
| -------- | ---------------------------------------------------------------------------- |
| Avoid    | Do not favor assets merely because they moved away from a historical mean.   |
| Moderate | Treat mean reversion as one supporting signal.                               |
| Strong   | More strongly favor qualified assets trading below validated rolling ranges. |

Mean reversion may not override liquidity, trend, quality, or drawdown controls.

### Piece 14: Breakout Preference

**Weight:** 300 bps  
**Default:** Require confirmation

| Option               | Effect                                                              |
| -------------------- | ------------------------------------------------------------------- |
| Ignore               | Do not use price breakouts as a positive signal.                    |
| Require confirmation | Favor breakouts only when supported by volume and persistence.      |
| Seek breakouts       | More strongly favor assets breaking above validated trading ranges. |

### Piece 15: Relative-Strength Preference

**Weight:** 300 bps  
**Default:** Neutral

| Option              | Effect                                                                             |
| ------------------- | ---------------------------------------------------------------------------------- |
| Accumulate laggards | Prefer qualified assets underperforming their peers when reversal evidence exists. |
| Neutral             | Apply no peer-relative performance preference.                                     |
| Prefer leaders      | Favor assets outperforming comparable approved assets.                             |

### Piece 16: Drawdown Reaction

**Weight:** 300 bps  
**Default:** Hold course

| Option              | Effect                                                                                |
| ------------------- | ------------------------------------------------------------------------------------- |
| Accumulate weakness | Permit adding to qualified assets during drawdowns when other evidence remains valid. |
| Hold course         | Avoid changing targets solely because of a drawdown.                                  |
| Reduce exposure     | Prefer lowering targets as drawdowns deepen.                                          |

### Piece 17: Winner Management

**Weight:** 300 bps  
**Default:** Hold winners

| Option         | Effect                                                                         |
| -------------- | ------------------------------------------------------------------------------ |
| Trim winners   | Prefer realizing gains and returning overweight positions toward target.       |
| Hold winners   | Maintain successful positions while they remain inside their bands.            |
| Add to winners | Allow positive momentum and conviction to increase targets within hard limits. |

### Piece 18: Correlation Preference

**Weight:** 300 bps  
**Default:** Neutral

| Option                   | Effect                                                                                  |
| ------------------------ | --------------------------------------------------------------------------------------- |
| Maximize diversification | Prefer combinations with lower measured correlations.                                   |
| Neutral                  | Apply normal correlation treatment.                                                     |
| Allow thematic clusters  | Permit multiple related assets when the brain and market evidence favor the same theme. |

## 5. Asset and sector affinity pieces

Pieces 19 through 34 share the same options:

| Option      | Effect                                                               |
| ----------- | -------------------------------------------------------------------- |
| Underweight | Negatively score active assets carrying the affinity's registry tag. |
| Neutral     | Apply no preference to that registry tag.                            |
| Overweight  | Positively score active assets carrying the affinity's registry tag. |

Underweight does not necessarily mean zero allocation. Overweight does not override per-asset or category caps.

|  ID | Affinity                          |  Weight | Default | Assets affected                         |
| --: | --------------------------------- | ------: | ------- | --------------------------------------- |
|  19 | Broad-market funds                | 150 bps | Neutral | Assets tagged `broad_market`.           |
|  20 | Technology                        | 150 bps | Neutral | Assets tagged `technology`.             |
|  21 | AI and semiconductors             | 150 bps | Neutral | Assets tagged `ai_semiconductor`.       |
|  22 | Financials                        | 150 bps | Neutral | Assets tagged `financials`.             |
|  23 | Healthcare                        | 150 bps | Neutral | Assets tagged `healthcare`.             |
|  24 | Consumer discretionary            | 150 bps | Neutral | Assets tagged `consumer_discretionary`. |
|  25 | Consumer staples                  | 150 bps | Neutral | Assets tagged `consumer_staples`.       |
|  26 | Industrials                       | 150 bps | Neutral | Assets tagged `industrials`.            |
|  27 | Energy                            | 150 bps | Neutral | Assets tagged `energy`.                 |
|  28 | Utilities                         | 150 bps | Neutral | Assets tagged `utilities`.              |
|  29 | Communications and media          | 150 bps | Neutral | Assets tagged `communications`.         |
|  30 | Real estate and real-world assets | 150 bps | Neutral | Assets tagged `real_estate_rwa`.        |
|  31 | Major crypto assets               | 150 bps | Neutral | Assets tagged `crypto_major`.           |
|  32 | DeFi and native protocols         | 150 bps | Neutral | Assets tagged `defi_native`.            |
|  33 | Tokenized commodities             | 150 bps | Neutral | Assets tagged `tokenized_commodity`.    |
|  34 | Meme and speculative assets       | 150 bps | Neutral | Assets tagged `meme_speculative`.       |

If no active asset has the relevant tag, the piece is shown as inactive for that cycle and contributes no allocation preference.

## 6. Decision-behavior pieces

### Piece 35: Macro Sensitivity

**Weight:** 125 bps  
**Default:** Moderate use

| Option       | Effect                                                                                       |
| ------------ | -------------------------------------------------------------------------------------------- |
| Ignore macro | Use asset-level information without macro preference adjustments.                            |
| Moderate use | Treat approved macro indicators as supporting evidence.                                      |
| Strong use   | Give approved macro regime indicators more importance in ranking assets and reserve posture. |

**Data required:** Approved macro data feed and canonical regime calculation.

### Piece 36: Corporate-Action Posture

**Weight:** 125 bps  
**Default:** Neutral

| Option          | Effect                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------ |
| Reduce exposure | Reduce desired exposure when a validated corporate action, trading halt, or data discontinuity raises uncertainty. |
| Neutral         | Apply standard corporate-action treatment.                                                                         |
| Accept exposure | Permit continued exposure when the action has been normalized and all required data remains valid.                 |

**Data required:** Robinhood corporate-action, multiplier, asset-status, and trading-halt data.

### Piece 37: Liquidity Preference

**Weight:** 125 bps  
**Default:** Balanced

| Option                  | Effect                                                                                      |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| Deep liquidity only     | Strongly prefer the most liquid approved assets and avoid assets near the liquidity floor.  |
| Balanced                | Use the standard liquidity preference.                                                      |
| Allow thinner liquidity | Permit thinner approved assets to rank higher, without crossing the hard liquidity minimum. |

### Piece 38: Trading-Cost Sensitivity

**Weight:** 125 bps  
**Default:** Balanced

| Option            | Effect                                                                                  |
| ----------------- | --------------------------------------------------------------------------------------- |
| Minimize turnover | Apply a stronger penalty to gas, spread, slippage, and target changes.                  |
| Balanced          | Use standard execution-cost penalties.                                                  |
| Prioritize signal | Accept higher costs when conviction is strong, while remaining inside hard cost limits. |

### Piece 39: Confidence Requirement

**Weight:** 125 bps  
**Default:** Normal confidence

| Option            | Effect                                                                              |
| ----------------- | ----------------------------------------------------------------------------------- |
| High confidence   | Require a higher validated confidence score before materially changing targets.     |
| Normal confidence | Use the standard confidence requirement.                                            |
| Exploratory       | Permit smaller exploratory positions at lower confidence within strict size limits. |

The exact confidence thresholds remain configurable protocol parameters.

### Piece 40: Profit-Taking Style

**Weight:** 125 bps  
**Default:** Balanced

| Option             | Effect                                                                       |
| ------------------ | ---------------------------------------------------------------------------- |
| Take profits early | Prefer reducing appreciated or overweight positions sooner.                  |
| Balanced           | Apply standard profit-taking behavior.                                       |
| Let winners run    | Allow appreciated positions to remain near the top of their permitted bands. |

### Piece 41: New-Position Threshold

**Weight:** 125 bps  
**Default:** Normal

| Option             | Effect                                                                 |
| ------------------ | ---------------------------------------------------------------------- |
| Very selective     | Require stronger evidence before adding an asset not currently held.   |
| Normal             | Use the standard new-position threshold.                               |
| Explore more names | Permit more small starter positions within the maximum-position limit. |

### Piece 42: Data Focus

**Weight:** 125 bps  
**Default:** Balanced data

| Option                 | Effect                                                                                                                                                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Market and technical   | Weight validated price, volatility, liquidity, trend, and positioning metrics at 70%; issuer fundamentals at 20%; macro and corporate-action data at 10%. |
| Balanced data          | Weight validated market metrics at 50%; issuer fundamentals at 35%; macro and corporate-action data at 15%.                                               |
| Fundamentals and macro | Weight validated market metrics at 30%; issuer fundamentals at 50%; macro and corporate-action data at 20%.                                               |

This controls the relative attention given to already-approved structured data. It does not authorize new sources, browsing, prose research, or unsupported claims. If a data group does not apply to an asset, its weight is redistributed proportionally across the valid groups.

## 7. Data dependencies

Some presets require data beyond price and liquidity.

| Data source                                                    | Presets requiring it                                                                               |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Price returns and rolling ranges                               | Holding horizon, trend, volatility, mean reversion, breakout, relative strength, drawdown, winners |
| Market capitalization                                          | Company-size preference                                                                            |
| SEC EDGAR issuer facts and deterministically derived ratios    | Valuation style, fundamental quality, return style, and data focus                                 |
| Dividend data                                                  | Return style                                                                                       |
| Correlations                                                   | Diversification and correlation preference                                                         |
| FRED macro indicators                                          | Macro sensitivity and data focus                                                                   |
| Robinhood corporate actions, multiplier, status, and halt data | Corporate-action posture and data focus                                                            |
| Liquidity, spread, slippage, and gas                           | Liquidity and trading-cost sensitivity                                                             |
| Cost basis and portfolio P&L                                   | Winner management and profit-taking                                                                |
| Asset Registry tags                                            | All asset and sector affinity pieces                                                               |

If required data is missing, stale, or invalid:

- The affected preset contributes zero for that cycle.
- The UI labels it "Inactive: required data unavailable."
- Ornith may not infer or invent the missing data.
- The rest of the brain continues operating.

## 8. Preset-change user experience

Before confirming a change, the owner sees:

```text
Piece 20: Technology

Current setting: Neutral
New setting: Overweight
Influence weight: 1.5%

Aggregate technology preference:
Before: +0.07
After:  +0.22

Effective: Next scheduled cycle

This preference steers Ornith but does not guarantee a technology purchase.
```

## 9. Locked MVP decisions

1. The defaults in this catalog are the launch defaults.
2. Directional moods use signed values `-2`, `-1`, `0`, `+1`, and `+2` before multiplication by the immutable piece weight. Parameter moods use explicit values recorded in the versioned preset registry.
3. Piece 39 uses minimum cycle-confidence thresholds of 7,500 bps for High confidence, 6,500 bps for Normal confidence, and 5,500 bps for Exploratory. Exploratory allocations are limited to 250 bps per new asset and 500 bps total.
4. Piece 42 is Data Focus and affects evidence weighting, so every piece affects allocation.
5. All MVP inputs are free structured sources or deterministic calculations:
   - Robinhood Stock Token APIs for canonical metadata, quotes, trading halts, and corporate actions.
   - Chainlink feeds on Robinhood Chain as execution and NAV price truth when supported.
   - Robinhood Chain RPC and approved on-chain venue reads for balances and liquidity.
   - SEC EDGAR structured filings for issuer fundamentals.
   - FRED for approved macro series.
   - Protocol-owned deterministic calculations for returns, volatility, drawdown, trend, correlation, valuation, quality, growth, dividends, spreads, and price impact.
6. A missing or stale source makes only its dependent effects inactive. Ornith cannot invent replacement data.
7. Ornith receives structured facts and derived metrics. It does not browse the web and no AI curates, summarizes, ranks, or selects its input data.
