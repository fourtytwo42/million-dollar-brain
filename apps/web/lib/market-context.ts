export {
  buildDecisionContext as marketContext,
  type AssetDossierV2,
  type CycleOutcomeV1,
  type DecisionContextV2,
  type MarketRegimeV1,
  type PortfolioSnapshotV2,
} from "./decision-context";

// A missing field is unavailable. Nothing is optimistically marked true.
export const DATA_AVAILABILITY: Record<string, boolean> = {
  asset_registry: false,
  market_metrics: false,
  returns: false,
  volatility: false,
  drawdown: false,
  liquidity: false,
  execution_cost: false,
  correlation: false,
  market_cap: false,
  corporate_actions: false,
  confidence: false,
  portfolio_pnl: false,
  fundamentals: false,
  dividends: false,
  macro: false,
};
