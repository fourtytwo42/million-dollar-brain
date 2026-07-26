export type BrainOption = {
  label: string;
  instruction: string;
  value: -1 | 0 | 1;
};

export type BrainPieceDefinition = {
  id: number;
  affinity: string;
  category: "Mandate" | "Strategy" | "Affinity" | "Decision";
  weight: number;
  options: readonly [BrainOption, BrainOption, BrainOption];
  data: readonly string[];
  tags?: readonly string[];
};

const option = (
  label: string,
  instruction: string,
  value: -1 | 0 | 1,
): BrainOption => ({ label, instruction, value });

const directional = (
  negative: [string, string],
  neutral: [string, string],
  positive: [string, string],
): readonly [BrainOption, BrainOption, BrainOption] => [
  option(negative[0], negative[1], -1),
  option(neutral[0], neutral[1], 0),
  option(positive[0], positive[1], 1),
];

const affinityPiece = (
  id: number,
  affinity: string,
  tags: string[],
): BrainPieceDefinition => ({
  id,
  affinity,
  category: "Affinity",
  weight: 150,
  tags,
  data: ["asset_registry"],
  options: directional(
    ["Underweight", `Negatively score approved assets tagged ${tags.join(", ")}.`],
    ["Neutral", `Apply no preference to assets tagged ${tags.join(", ")}.`],
    ["Overweight", `Positively score approved assets tagged ${tags.join(", ")}.`],
  ),
});

export const BRAIN_CATALOG_VERSION = 2;

export const BRAIN_CATALOG: readonly BrainPieceDefinition[] = [
  {
    id: 1, affinity: "Capital Objective", category: "Mandate", weight: 500, data: ["market_metrics"],
    options: directional(
      ["Preserve", "Favor reserve, broad assets, lower volatility, and smaller target changes."],
      ["Balanced growth", "Balance capital stability and appreciation."],
      ["Maximum growth", "Favor growth and higher-beta assets inside hard exposure limits."],
    ),
  },
  {
    id: 2, affinity: "Equity Versus Crypto", category: "Mandate", weight: 500, data: ["asset_registry"],
    options: directional(
      ["Equity-led", "Prefer approved tokenized equities over approved crypto assets."],
      ["Balanced mix", "Apply no broad equity-versus-crypto preference."],
      ["Crypto-led", "Prefer approved crypto assets inside the crypto exposure cap."],
    ),
  },
  {
    id: 3, affinity: "Diversification", category: "Mandate", weight: 500, data: ["correlation"],
    options: directional(
      ["Broad", "Prefer more positions, smaller weights, and lower portfolio correlation."],
      ["Balanced", "Use standard position-count and concentration preferences."],
      ["Focused", "Prefer fewer high-conviction positions inside per-asset caps."],
    ),
  },
  {
    id: 4, affinity: "Holding Horizon", category: "Mandate", weight: 500, data: ["returns"],
    options: directional(
      ["Tactical", "Emphasize one-hour and 24-hour conditions."],
      ["Multi-day", "Balance 24-hour and seven-day evidence."],
      ["Patient", "Emphasize durable evidence and penalize unnecessary turnover."],
    ),
  },
  {
    id: 5, affinity: "Stable Reserve Preference", category: "Mandate", weight: 500, data: ["liquidity"],
    options: directional(
      ["Minimum permitted", "Operate near the hard USDG reserve floor."],
      ["Balanced reserve", "Maintain a moderate USDG buffer above the hard floor."],
      ["High reserve", "Hold additional USDG and reduce risk-asset deployment."],
    ),
  },
  {
    id: 6, affinity: "Rebalance Responsiveness", category: "Mandate", weight: 500, data: ["market_metrics"],
    options: directional(
      ["Patient", "Require stronger evidence before changing targets."],
      ["Normal", "Use standard target-change sensitivity."],
      ["Responsive", "React more quickly to validated new evidence inside turnover limits."],
    ),
  },
  {
    id: 7, affinity: "Trend Response", category: "Strategy", weight: 300, data: ["returns"],
    options: directional(
      ["Fade trends", "Prefer qualified assets that weakened relative to recent trends."],
      ["Neutral", "Apply no overall trend-following preference."],
      ["Follow trends", "Prefer assets with positive confirmed trend strength."],
    ),
  },
  {
    id: 8, affinity: "Valuation Style", category: "Strategy", weight: 300, data: ["fundamentals"],
    options: directional(
      ["Value", "Prefer approved equities with lower valuations or stronger cash-flow yield."],
      ["Neutral", "Apply no value-versus-growth valuation preference."],
      ["Growth", "Prefer stronger revenue or earnings growth while tolerating higher valuation."],
    ),
  },
  {
    id: 9, affinity: "Fundamental Quality", category: "Strategy", weight: 300, data: ["fundamentals"],
    options: directional(
      ["Quality-first", "Prefer profitability, stable earnings, and stronger balance sheets."],
      ["Balanced", "Apply a moderate fundamental quality filter."],
      ["Speculative", "Allow higher-uncertainty approved assets inside speculative caps."],
    ),
  },
  {
    id: 10, affinity: "Volatility Preference", category: "Strategy", weight: 300, data: ["volatility"],
    options: directional(
      ["Low volatility", "Prefer lower realized volatility and smaller drawdowns."],
      ["Neutral", "Apply no broad volatility preference."],
      ["High beta", "Prefer higher-volatility assets when other evidence permits."],
    ),
  },
  {
    id: 11, affinity: "Company-Size Preference", category: "Strategy", weight: 300, data: ["market_cap"],
    options: directional(
      ["Mega-cap", "Prefer the largest approved companies and assets."],
      ["Large-cap mix", "Apply a moderate size preference."],
      ["Smaller assets", "Allow smaller approved assets to rank more strongly."],
    ),
  },
  {
    id: 12, affinity: "Return Style", category: "Strategy", weight: 300, data: ["fundamentals", "dividends"],
    options: directional(
      ["Income and stability", "Prefer dividend, distribution, or stable-cash-flow characteristics."],
      ["Balanced", "Apply no strong income-versus-growth preference."],
      ["Capital appreciation", "Prefer price-growth potential over current income."],
    ),
  },
  {
    id: 13, affinity: "Mean-Reversion Preference", category: "Strategy", weight: 300, data: ["returns"],
    options: directional(
      ["Avoid", "Do not favor assets merely because they moved away from a historical mean."],
      ["Moderate", "Use validated mean reversion as one supporting signal."],
      ["Strong", "Favor qualified assets trading below validated rolling ranges."],
    ),
  },
  {
    id: 14, affinity: "Breakout Preference", category: "Strategy", weight: 300, data: ["returns", "liquidity"],
    options: directional(
      ["Ignore", "Do not use price breakouts as a positive signal."],
      ["Require confirmation", "Favor breakouts only with volume and persistence confirmation."],
      ["Seek breakouts", "Favor assets breaking above validated trading ranges."],
    ),
  },
  {
    id: 15, affinity: "Relative-Strength Preference", category: "Strategy", weight: 300, data: ["returns"],
    options: directional(
      ["Accumulate laggards", "Prefer qualified peer laggards when reversal evidence exists."],
      ["Neutral", "Apply no peer-relative performance preference."],
      ["Prefer leaders", "Favor assets outperforming comparable approved assets."],
    ),
  },
  {
    id: 16, affinity: "Drawdown Reaction", category: "Strategy", weight: 300, data: ["drawdown"],
    options: directional(
      ["Accumulate weakness", "Permit adding during drawdowns when other evidence remains valid."],
      ["Hold course", "Avoid changing targets solely because of a drawdown."],
      ["Reduce exposure", "Prefer lowering targets as drawdowns deepen."],
    ),
  },
  {
    id: 17, affinity: "Winner Management", category: "Strategy", weight: 300, data: ["portfolio_pnl"],
    options: directional(
      ["Trim winners", "Prefer returning appreciated or overweight positions toward target."],
      ["Hold winners", "Maintain successful positions while they remain inside their bands."],
      ["Add to winners", "Allow momentum and conviction to raise targets inside hard limits."],
    ),
  },
  {
    id: 18, affinity: "Correlation Preference", category: "Strategy", weight: 300, data: ["correlation"],
    options: directional(
      ["Maximize diversification", "Prefer combinations with lower measured correlations."],
      ["Neutral", "Apply standard correlation treatment."],
      ["Allow thematic clusters", "Permit related assets when evidence favors the same theme."],
    ),
  },
  affinityPiece(19, "Broad-market Funds", ["broad_market"]),
  affinityPiece(20, "Technology", ["technology"]),
  affinityPiece(21, "AI and Semiconductors", ["ai_semiconductor"]),
  affinityPiece(22, "Financials", ["financials"]),
  affinityPiece(23, "Healthcare", ["healthcare"]),
  affinityPiece(24, "Consumer Discretionary", ["consumer_discretionary"]),
  affinityPiece(25, "Consumer Staples", ["consumer_staples"]),
  affinityPiece(26, "Industrials", ["industrials"]),
  affinityPiece(27, "Energy", ["energy"]),
  affinityPiece(28, "Utilities", ["utilities"]),
  affinityPiece(29, "Communications and Media", ["communications"]),
  affinityPiece(30, "Real Estate and Real-World Assets", ["real_estate_rwa"]),
  affinityPiece(31, "Major Crypto Assets", ["crypto_major"]),
  affinityPiece(32, "DeFi and Native Protocols", ["defi_native"]),
  affinityPiece(33, "Tokenized Commodities", ["tokenized_commodity"]),
  affinityPiece(34, "Meme and Speculative Assets", ["meme_speculative"]),
  {
    id: 35, affinity: "Macro Sensitivity", category: "Decision", weight: 125, data: ["macro"],
    options: directional(
      ["Ignore macro", "Use asset-level information without macro preference adjustments."],
      ["Moderate use", "Use approved macro regime indicators as supporting evidence."],
      ["Strong use", "Give approved macro regime indicators more ranking influence."],
    ),
  },
  {
    id: 36, affinity: "Corporate-Action Posture", category: "Decision", weight: 125, data: ["corporate_actions"],
    options: directional(
      ["Reduce exposure", "Reduce targets when validated actions, halts, or discontinuities raise uncertainty."],
      ["Neutral", "Apply standard corporate-action treatment."],
      ["Accept exposure", "Permit exposure after actions normalize and required data remains valid."],
    ),
  },
  {
    id: 37, affinity: "Liquidity Preference", category: "Decision", weight: 125, data: ["liquidity"],
    options: directional(
      ["Deep liquidity only", "Strongly prefer the most liquid approved assets."],
      ["Balanced", "Use the standard liquidity preference."],
      ["Allow thinner liquidity", "Allow thinner approved assets above the hard liquidity minimum."],
    ),
  },
  {
    id: 38, affinity: "Trading-Cost Sensitivity", category: "Decision", weight: 125, data: ["execution_cost"],
    options: directional(
      ["Minimize turnover", "Apply stronger gas, spread, slippage, and target-change penalties."],
      ["Balanced", "Use standard execution-cost penalties."],
      ["Prioritize signal", "Accept higher costs for strong conviction inside hard cost limits."],
    ),
  },
  {
    id: 39, affinity: "Confidence Requirement", category: "Decision", weight: 125, data: ["confidence"],
    options: directional(
      ["High confidence", "Require at least 7500 bps confidence for material target changes."],
      ["Normal confidence", "Require at least 6500 bps confidence for material target changes."],
      ["Exploratory", "Permit small exploratory positions at 5500 bps confidence."],
    ),
  },
  {
    id: 40, affinity: "Profit-Taking Style", category: "Decision", weight: 125, data: ["portfolio_pnl"],
    options: directional(
      ["Take profits early", "Reduce appreciated or overweight positions sooner."],
      ["Balanced", "Apply standard profit-taking behavior."],
      ["Let winners run", "Allow appreciated positions near the top of permitted bands."],
    ),
  },
  {
    id: 41, affinity: "New-Position Threshold", category: "Decision", weight: 125, data: ["confidence"],
    options: directional(
      ["Very selective", "Require stronger evidence before adding an asset not currently held."],
      ["Normal", "Use the standard new-position threshold."],
      ["Explore more names", "Permit more small starter positions inside position limits."],
    ),
  },
  {
    id: 42, affinity: "Data Focus", category: "Decision", weight: 125, data: ["market_metrics", "fundamentals", "macro"],
    options: directional(
      ["Market and technical", "Weight market metrics 70%, fundamentals 20%, and macro/action data 10%."],
      ["Balanced data", "Weight market metrics 50%, fundamentals 35%, and macro/action data 15%."],
      ["Fundamentals and macro", "Weight market metrics 30%, fundamentals 50%, and macro/action data 20%."],
    ),
  },
] as const;

export function brainDefinition(pieceId: number) {
  const definition = BRAIN_CATALOG[pieceId - 1];
  if (!definition || definition.id !== pieceId) throw new Error(`Unknown brain piece ${pieceId}`);
  return definition;
}
