import { keccak256, toHex } from "viem";

export const BRAIN_CONTROL_SCHEMA_VERSION = 1;
export const BRAIN_CONTROL_CATALOG_VERSION = 1;
export const BRAIN_CONTROL_SCALAR_SLOTS = 12;
export const BRAIN_CONTROL_ASSET_SLOTS = 4;

export type ControlOption = {
  label: string;
  meaning: string;
};

export type BrainControlDefinition = {
  key: string;
  label: string;
  kind: "choice" | "multi" | "attention";
  options?: readonly ControlOption[];
  maximum?: number;
  maxSelections?: number;
};

export type BrainControlPieceSpec = {
  id: number;
  summary: string;
  controls: readonly BrainControlDefinition[];
  defaults: readonly number[];
  assetTag?: string;
  assetLabel?: string;
  bespoke?: string;
};

export type BrainControlBundle = {
  schemaVersion: 1;
  values: number[];
  assetIds: number[];
};

const option = (label: string, meaning: string): ControlOption => ({
  label,
  meaning,
});

const choice = (
  key: string,
  label: string,
  labels: readonly string[],
  meanings?: readonly string[],
): BrainControlDefinition => ({
  key,
  label,
  kind: "choice",
  options: labels.map((name, index) =>
    option(name, meanings?.[index] ?? `${label}: ${name}.`),
  ),
});

const multi = (
  key: string,
  label: string,
  labels: readonly string[],
  maxSelections: number,
): BrainControlDefinition => ({
  key,
  label,
  kind: "multi",
  options: labels.map((name) => option(name, `Include ${name}.`)),
  maximum: (1 << labels.length) - 1,
  maxSelections,
});

const scalar = (
  key: string,
  label: string,
  maximum: number,
): BrainControlDefinition => ({ key, label, kind: "attention", maximum });

const directive = choice(
  "asset_directive",
  "Direct order",
  [
    "No direct order",
    "Eligible",
    "Preferred",
    "Spotlight",
    "Core candidate",
    "Reduce",
    "No new buys",
    "Exit / disable",
  ],
  [
    "Let the other controls decide.",
    "Allow the selected qualified asset to compete normally.",
    "Give the selected qualified asset a weighted preference.",
    "Give the selected qualified asset a strong weighted preference.",
    "Treat the selected qualified asset as a core candidate inside hard caps.",
    "Cap the selected asset at half its current portfolio weight.",
    "Do not increase the selected asset above its current weight.",
    "Force the selected asset target to zero.",
  ],
);

const sectorStatus = choice("sector_status", "Desk status", [
  "Off",
  "Watch",
  "Normal",
  "Overweight",
  "Feast",
]);
const sectorExposure = choice("sector_exposure", "Preferred sleeve", [
  "0%",
  "5%",
  "10%",
  "15%",
  "Protocol maximum",
]);
const champion = choice("champion", "Desk champion", [
  "Automatic",
  "Favorite 1",
  "Favorite 2",
  "Favorite 3",
]);

const mandate: BrainControlPieceSpec[] = [
  {
    id: 1,
    summary:
      "Sets the portfolio's overall mission, risk appetite, and loss budget.",
    controls: [
      choice("mission", "Mission", [
        "Protect the bag",
        "Compound responsibly",
        "Number go up",
        "Moon with paperwork",
      ]),
      choice("risk", "Risk outfit", [
        "Cardigan",
        "Business casual",
        "Leather jacket",
        "No helmet",
      ]),
      choice("drawdown", "Loss budget", ["5%", "10%", "15%", "20%"]),
      choice("profit", "Profit priority", [
        "Capital stability",
        "Balanced total return",
        "Appreciation",
      ]),
    ],
    defaults: [1, 1, 1, 1],
  },
  {
    id: 2,
    summary: "Balances qualified equity and crypto exposure.",
    controls: [
      choice("class_tilt", "Asset-class tilt", [
        "Equity-led",
        "Balanced",
        "Crypto-led",
      ]),
      choice("crypto_budget", "Crypto budget", [
        "0%",
        "10%",
        "20%",
        "Protocol maximum",
      ]),
      choice("rotation", "Rotation instinct", [
        "Follow stronger class",
        "Fade stronger class",
        "Ignore rotation",
      ]),
      choice("class_veto", "Class veto", [
        "None",
        "No new equity buys",
        "No new crypto buys",
      ]),
    ],
    defaults: [1, 1, 0, 0],
  },
  {
    id: 3,
    summary:
      "Controls position count, concentration, and correlation tolerance.",
    controls: [
      choice("positions", "Desired risk positions", ["2", "4", "6", "9"]),
      choice("max_position", "Preferred maximum", [
        "8%",
        "12%",
        "16%",
        "Hard maximum",
      ]),
      choice("correlation", "Correlation allergy", [
        "None",
        "Mild",
        "Strong",
        "Octopus intervention",
      ]),
      choice("method", "Diversification method", [
        "Equal-ish",
        "Risk-balanced",
        "Conviction-weighted",
        "Sector-spread",
      ]),
      choice("required_mix", "Required mix", [
        "None",
        "Two asset classes",
        "Three sectors",
        "Defensive sleeve",
      ]),
    ],
    defaults: [2, 2, 2, 1, 1],
  },
  {
    id: 4,
    summary:
      "Sets the base review cadence and the time horizon Ornith should optimize.",
    controls: [
      choice("cadence", "Review cadence", [
        "Touch grass · 24h",
        "Long lunch · 6h",
        "Committee meeting · 4h",
        "Default timeline · 1h",
        "Doomscroll · 30m",
        "Refresh goblin · 15m",
      ]),
      choice("horizon", "Decision horizon", [
        "Intraday",
        "Multi-day",
        "Multi-week",
        "Regime",
      ]),
      choice("evidence", "Evidence horizon", [
        "Short",
        "Balanced",
        "Medium",
        "Long",
      ]),
      choice("thesis_age", "Minimum thesis age", [
        "One cycle",
        "4h",
        "24h",
        "7d",
      ]),
    ],
    defaults: [3, 1, 1, 1],
  },
  {
    id: 5,
    summary:
      "Controls USDG reserve targets and when dry powder may be deployed.",
    controls: [
      choice("reserve", "USDG reserve", ["20%", "25%", "30%", "40%", "50%"]),
      choice("deploy_trigger", "Deploy trigger", [
        "Always evaluate",
        "Confirmed opportunity",
        "Broad drawdown",
        "Panic discount",
      ]),
      choice("deploy_amount", "Deploy amount", [
        "Nibble",
        "Standard",
        "Double scoop",
        "To target",
      ]),
      choice("replenish", "Refill method", [
        "Trim winners",
        "Trim weakest",
        "Proportional",
        "New flows only",
      ]),
    ],
    defaults: [1, 1, 1, 2],
  },
  {
    id: 6,
    summary: "Allows bounded panic reviews without bypassing trade cooldowns.",
    controls: [
      choice("adaptive", "Adaptive cadence", [
        "Off",
        "Volatility only",
        "Drawdown only",
        "Volatility + drawdown",
      ]),
      choice("panic_cadence", "Panic review", ["15m", "30m", "1h"]),
      choice("panic_duration", "Panic duration", [
        "One review",
        "2h",
        "6h",
        "Until normal",
      ]),
      choice("sensitivity", "Target sensitivity", [
        "Sleepy",
        "Normal",
        "Caffeinated",
        "Vibrating",
      ]),
    ],
    defaults: [3, 1, 1, 1],
  },
];

const strategyRows: Array<{
  id: number;
  summary: string;
  controls: BrainControlDefinition[];
  defaults: number[];
}> = [
  {
    id: 7,
    summary:
      "Chooses trend windows, confirmation, and failed-breakout behavior.",
    controls: [
      multi(
        "windows",
        "Trend windows",
        ["1h", "4h", "24h", "7d", "30d", "90d"],
        3,
      ),
      multi(
        "signals",
        "Signals",
        ["Price trend", "Relative strength", "Volume", "Breakout", "MA slope"],
        3,
      ),
      choice("style", "Trend style", [
        "Fade",
        "Confirm then follow",
        "Chase within limits",
      ]),
      choice("failure", "Failed breakout", ["Hold", "Reduce", "Exit"]),
    ],
    defaults: [12, 3, 1, 1],
  },
  {
    id: 8,
    summary:
      "Sets valuation lenses, discount demands, and value-trap defenses.",
    controls: [
      choice("lens", "Valuation lens", [
        "Earnings",
        "Sales",
        "Cash flow",
        "Book",
        "Blended",
      ]),
      choice("discount", "Discount demand", [
        "None",
        "Modest",
        "Large",
        "Clearance aisle",
      ]),
      choice("growth", "Growth tolerance", ["Low", "Balanced", "Pay up"]),
      choice("trap", "Value-trap defense", [
        "Ignore",
        "Require quality",
        "Require improving trend",
      ]),
    ],
    defaults: [4, 1, 1, 1],
  },
  {
    id: 9,
    summary:
      "Requires selected fundamental evidence before rewarding an asset.",
    controls: [
      multi(
        "checklist",
        "Quality checklist",
        [
          "Profitability",
          "Balance sheet",
          "Cash flow",
          "Earnings stability",
          "Dilution",
        ],
        4,
      ),
      choice("passes", "Minimum passes", [
        "One",
        "Two",
        "Three",
        "All selected",
      ]),
      choice("deterioration", "Deterioration response", [
        "Watch",
        "No new buys",
        "Reduce",
        "Exit",
      ]),
      choice("missing", "Missing fundamentals", [
        "Neutral",
        "Penalize",
        "No positive score",
      ]),
    ],
    defaults: [7, 1, 2, 1],
  },
  {
    id: 10,
    summary:
      "Controls volatility appetite, drawdown response, and high-volatility budget.",
    controls: [
      choice("appetite", "Volatility appetite", [
        "Avoid",
        "Harvest modestly",
        "Embrace",
        "Feast",
      ]),
      choice("window", "Measurement window", ["24h", "7d", "30d", "Blended"]),
      choice("drawdown", "Drawdown response", [
        "Buy",
        "Hold",
        "Reduce",
        "Exit",
      ]),
      choice("budget", "High-volatility budget", [
        "10%",
        "20%",
        "Protocol maximum",
      ]),
    ],
    defaults: [1, 3, 2, 1],
  },
  {
    id: 11,
    summary: "Chooses company-size preference while allowing liquidity to win.",
    controls: [
      choice("size", "Size preference", [
        "Mega",
        "Large",
        "Mid",
        "No preference",
      ]),
      choice("floor", "Preferred floor", ["$100M", "$1B", "$10B", "$100B"]),
      choice("liquidity", "Liquidity beats size", [
        "Never",
        "When close",
        "Always",
      ]),
      choice("largest", "Largest-position treatment", [
        "Standard",
        "Reduced",
        "Minimum",
      ]),
    ],
    defaults: [1, 1, 2, 0],
  },
  {
    id: 12,
    summary: "Balances income, total return, and appreciation.",
    controls: [
      choice("style", "Return style", [
        "Income",
        "Total return",
        "Appreciation",
      ]),
      choice("quality", "Yield quality", [
        "Raw yield",
        "Covered yield",
        "Dividend growth",
        "Stability",
      ]),
      choice("distribution", "Distributions", [
        "Reinvest",
        "Reserve",
        "Rebalance",
      ]),
      choice("trap", "Yield trap", ["Ignore yield", "Reduce", "Exit"]),
    ],
    defaults: [1, 3, 2, 1],
  },
  {
    id: 13,
    summary: "Defines mean-reversion entries and snapback exits.",
    controls: [
      choice("window", "Mean window", ["24h", "7d", "30d", "Blended"]),
      choice("distance", "Entry distance", [
        "Small",
        "Medium",
        "Large",
        "Extreme",
      ]),
      choice("confirmation", "Confirmation", [
        "None",
        "Liquidity",
        "Stabilization",
        "Both",
      ]),
      choice("snapback", "Snapback exit", ["Hold thesis", "Trim", "Close"]),
    ],
    defaults: [1, 1, 3, 1],
  },
  {
    id: 14,
    summary:
      "Defines breakout windows, confirmation, entry strength, and failure response.",
    controls: [
      choice("window", "Breakout window", ["4h", "24h", "7d", "30d"]),
      choice("confirmation", "Confirmation", [
        "Price",
        "Volume",
        "Breadth",
        "All three",
      ]),
      choice("entry", "Entry response", [
        "Watch",
        "Nibble",
        "Standard",
        "Strong preference",
      ]),
      choice("failure", "Failure response", ["Hold", "Reduce", "Exit"]),
    ],
    defaults: [1, 1, 2, 1],
  },
  {
    id: 15,
    summary:
      "Compares leadership against selected reference assets and benchmarks.",
    controls: [
      multi(
        "references",
        "Compare against",
        ["Basket", "Sector", "SPY", "QQQ", "SOXX", "ETH", "USDG"],
        3,
      ),
      choice("window", "Leadership window", ["24h", "7d", "30d", "Blended"]),
      choice("leader", "Leader treatment", [
        "Watch",
        "Prefer",
        "Spotlight",
        "Core candidate",
      ]),
      choice("fallen", "Fallen star", ["Forgive once", "Reduce", "Exit"]),
    ],
    defaults: [3, 1, 1, 1],
  },
  {
    id: 16,
    summary:
      "Controls what qualifies as a dip and how aggressively it may be bought.",
    controls: [
      choice("definition", "Dip definition", [
        "24h pullback",
        "7d drawdown",
        "30d drawdown",
        "Off high",
      ]),
      choice("targets", "Allowed targets", [
        "Current holdings",
        "Qualified favorites",
        "Sector leaders",
        "All qualified",
      ]),
      choice("size", "Bite size", ["Nibble", "Standard", "Double scoop"]),
      choice("knife", "Falling-knife rule", [
        "None",
        "Stabilization",
        "Reversal required",
      ]),
      choice("average", "Average-down limit", [
        "Never",
        "Once",
        "Twice",
        "To risk cap",
      ]),
    ],
    defaults: [1, 0, 1, 1, 1],
  },
  {
    id: 17,
    summary: "Determines how winners fund, run, or trim.",
    controls: [
      choice("winner", "Winner definition", [
        "+5%",
        "+10%",
        "+20%",
        "Top decile",
      ]),
      choice("response", "Winner response", [
        "Let run",
        "To target",
        "Trim excess",
        "Lock profit",
      ]),
      choice("add", "Add to winner", ["Never", "Confirmed", "Within target"]),
      choice("fund", "Winner funds losers", [
        "Never",
        "Proportional",
        "Conviction-led",
      ]),
    ],
    defaults: [1, 1, 1, 1],
  },
  {
    id: 18,
    summary: "Controls cluster tolerance and diversifier preference.",
    controls: [
      choice("window", "Correlation window", ["7d", "30d", "90d", "Blended"]),
      choice("tolerance", "Cluster tolerance", ["Low", "Balanced", "High"]),
      choice("cluster", "Cluster treatment", [
        "Cap group",
        "Best member",
        "Accept thesis cluster",
      ]),
      choice("diversifier", "Diversifier preference", [
        "None",
        "Moderate",
        "Strong",
      ]),
    ],
    defaults: [1, 1, 1, 2],
  },
];

const sectorRows = [
  [19, "Broad market", "broad_market", ["Narrow", "Normal", "Broad"], 1],
  [20, "Technology", "technology", ["Quality", "Balanced", "Growth"], 1],
  [
    21,
    "AI and semiconductors",
    "ai_semiconductor",
    ["Designers", "Foundries", "Equipment", "Infrastructure", "Full stack"],
    4,
  ],
  [
    22,
    "Financials",
    "financials",
    ["Falling rates", "Neutral", "Rising rates"],
    1,
  ],
  [
    23,
    "Healthcare",
    "healthcare",
    ["Avoid catalysts", "Measured", "Embrace catalysts"],
    1,
  ],
  [
    24,
    "Consumer discretionary",
    "consumer_discretionary",
    ["Spending", "Employment", "Sentiment", "Blended"],
    3,
  ],
  [
    25,
    "Consumer staples",
    "consumer_staples",
    ["Always defensive", "Risk-off", "Drawdown", "Off"],
    1,
  ],
  [
    26,
    "Industrials",
    "industrials",
    ["Early cycle", "Mid cycle", "Late cycle", "All-weather"],
    3,
  ],
  [
    27,
    "Energy",
    "energy",
    ["Avoid commodity beta", "Balanced", "Embrace commodity beta"],
    1,
  ],
  [
    28,
    "Utilities",
    "utilities",
    ["Defensive", "Yield", "Growth infrastructure", "Blended"],
    3,
  ],
  [
    29,
    "Communications and media",
    "communications",
    ["Newest signal", "Longest window", "Majority", "Confidence-weighted"],
    3,
  ],
  [
    30,
    "Real estate and RWA",
    "real_estate_rwa",
    ["Income", "Balanced", "Appreciation"],
    1,
  ],
  [
    31,
    "Major crypto",
    "crypto_major",
    ["BTC-led", "ETH-led", "Broad", "Defensive"],
    2,
  ],
  [
    32,
    "DeFi",
    "defi_native",
    ["Fees", "Users", "TVL quality", "Governance risk", "Blended"],
    4,
  ],
  [
    33,
    "Tokenized commodities",
    "tokenized_commodity",
    ["Metals", "Energy", "Agriculture", "Diversified"],
    3,
  ],
  [
    34,
    "Meme and speculative",
    "meme_speculative",
    ["0%", "2%", "5%", "Protocol cap"],
    1,
  ],
] as const;

const sectors: BrainControlPieceSpec[] = sectorRows.map(
  ([id, affinity, assetTag, bespokeOptions, bespokeDefault]) => ({
    id,
    summary: `Controls the ${affinity} desk and its qualified registry assets.`,
    assetTag,
    assetLabel: "Favorites and direct-order target",
    controls: [
      sectorStatus,
      sectorExposure,
      choice("desk_lens", "Desk lens", bespokeOptions),
      choice("selection_lens", "Selection method", [
        "Fundamentals",
        "Momentum",
        "Valuation",
        "Blended",
      ]),
      directive,
      champion,
    ],
    defaults: [id >= 32 ? 1 : 2, id >= 32 ? 1 : 2, bespokeDefault, 3, 0, 0],
  }),
);

const decisions: BrainControlPieceSpec[] = [
  {
    id: 35,
    summary: "Chooses macro evidence and deterministic risk-regime reactions.",
    controls: [
      multi(
        "groups",
        "Macro groups",
        [
          "Rates",
          "Curve",
          "Inflation",
          "Employment",
          "Liquidity",
          "Risk regime",
        ],
        4,
      ),
      choice("weight", "Macro weight", [
        "Ignore",
        "Supporting",
        "Strong",
        "Regime boss",
      ]),
      choice("risk_on", "Risk-on action", [
        "Deploy",
        "Hold",
        "Raise reserve",
        "Reduce risk",
      ]),
      choice("neutral", "Neutral action", [
        "Deploy",
        "Hold",
        "Raise reserve",
        "Reduce risk",
      ]),
      choice("risk_off", "Risk-off action", [
        "Deploy",
        "Hold",
        "Raise reserve",
        "Reduce risk",
      ]),
      choice("stale", "Stale macro", [
        "Omit",
        "Lower confidence",
        "Hold if required",
      ]),
    ],
    defaults: [45, 1, 0, 1, 2, 0],
  },
  {
    id: 36,
    summary:
      "Controls structured corporate-event posture before and after events.",
    controls: [
      multi(
        "events",
        "Event types",
        [
          "Earnings",
          "Dividends",
          "Splits",
          "Offerings",
          "Mergers",
          "Guidance",
          "Regulatory",
        ],
        5,
      ),
      choice("before", "Before event", [
        "Ignore",
        "No new buys",
        "Reduce",
        "Exit",
      ]),
      choice("wait", "After-event wait", [
        "None",
        "One session",
        "Two sessions",
        "One week",
      ]),
      choice("surprise", "Surprise response", [
        "Hold",
        "Re-score",
        "Reduce",
        "Exit",
      ]),
    ],
    defaults: [121, 1, 1, 1],
  },
  {
    id: 37,
    summary:
      "Sets preferred depth, impact, spread, and deterioration response.",
    controls: [
      choice("depth", "Minimum depth", ["$250K", "$500K", "$1M", "$5M"]),
      choice("impact", "Preferred impact", ["0.25%", "0.5%", "0.75%", "1%"]),
      choice("spread", "Spread tolerance", [
        "Tight",
        "Normal",
        "Protocol maximum",
      ]),
      choice("deterioration", "Deterioration", [
        "Watch",
        "No new buys",
        "Reduce",
        "Exit",
      ]),
    ],
    defaults: [1, 1, 1, 2],
  },
  {
    id: 38,
    summary:
      "Controls trade cooldown, drift, turnover, and execution-cost attitude.",
    controls: [
      choice("cooldown", "Trade cooldown", ["15m", "30m", "1h", "4h", "24h"]),
      choice("drift", "Minimum drift", ["0.5%", "1%", "2%", "3%", "5%"]),
      choice("turnover", "Desired turnover cap", [
        "5%",
        "10%",
        "20%",
        "Protocol maximum",
      ]),
      choice("attitude", "Execution attitude", [
        "Penny-pincher",
        "Balanced",
        "Signal-first",
      ]),
      choice("dust", "Dust handling", [
        "Leave as USDG",
        "Fold into largest trade",
      ]),
    ],
    defaults: [2, 2, 1, 1, 0],
  },
  {
    id: 39,
    summary:
      "Sets evidence requirements, conflict handling, and research capacity.",
    controls: [
      multi(
        "evidence",
        "Evidence checklist",
        [
          "Price",
          "Liquidity",
          "Fundamentals",
          "Valuation",
          "Macro",
          "Correlation",
          "Outcomes",
          "Corporate events",
        ],
        6,
      ),
      choice("minimum", "Minimum satisfied", [
        "One",
        "Half",
        "Majority",
        "All",
      ]),
      choice("conflict", "Source conflict", [
        "Safer value",
        "Lower confidence",
        "Omit field",
        "Hold",
      ]),
      choice("immature", "Immature metric", [
        "Omit",
        "Penalize",
        "No positive score",
      ]),
      choice("research", "Research assets", ["Off", "1", "2", "4"]),
    ],
    defaults: [103, 2, 1, 0, 2],
  },
  {
    id: 40,
    summary:
      "Defines profit triggers, trimming, reserve capture, and re-entry.",
    controls: [
      choice("trigger", "Profit trigger", [
        "+5%",
        "+10%",
        "+20%",
        "+30%",
        "Trailing drawdown",
      ]),
      choice("action", "Action", [
        "Hold",
        "To target",
        "Fixed trim",
        "Raise reserve",
      ]),
      choice("trim", "Fixed trim", ["10%", "25%", "50%"]),
      choice("reentry", "Re-entry", [
        "Never",
        "After cooldown",
        "After new high",
        "Renewed evidence",
      ]),
    ],
    defaults: [2, 1, 1, 3],
  },
  {
    id: 41,
    summary:
      "Controls confidence, starter size, trial period, and failed first dates.",
    controls: [
      choice("confidence", "New-position confidence", [
        "Standard",
        "High",
        "Extremely skeptical",
      ]),
      choice("starter", "Starter size", ["1%", "2%", "5%", "Target"]),
      choice("signals", "Confirmation count", ["One", "Two", "Three"]),
      choice("trial", "Trial period", ["One cycle", "4h", "24h", "7d"]),
      choice("failure", "Failure response", ["Hold", "Reduce", "Exit"]),
    ],
    defaults: [1, 1, 1, 2, 2],
  },
  {
    id: 42,
    summary:
      "Allocates optional context attention without hiding mandatory safety data.",
    controls: [
      scalar("technical", "Price and technical", 100),
      scalar("fundamentals", "Fundamentals", 100),
      scalar("valuation", "Valuation", 100),
      scalar("macro", "Macro", 100),
      scalar("liquidity", "Liquidity and execution", 100),
      scalar("portfolio", "Portfolio history", 100),
      scalar("outcomes", "Decision outcomes", 100),
      scalar("events", "Corporate events", 100),
      choice("appetite", "Context appetite", ["Compact", "Balanced", "Full"]),
      multi(
        "windows",
        "History windows",
        ["1h", "4h", "24h", "7d", "30d", "90d", "Since entry"],
        4,
      ),
      choice("truncation", "Truncation priority", [
        "Freshest",
        "Holdings",
        "Risks",
        "Balanced",
      ]),
      choice("detail", "Optional dossiers", [
        "Holdings",
        "Holdings + favorites",
        "Top 32",
        "Top 64",
      ]),
    ],
    defaults: [20, 15, 10, 10, 15, 10, 10, 10, 1, 92, 3, 3],
  },
];

export const BRAIN_CONTROL_CATALOG: readonly BrainControlPieceSpec[] = [
  ...mandate,
  ...strategyRows,
  ...sectors,
  ...decisions,
];

if (
  BRAIN_CONTROL_CATALOG.length !== 42 ||
  BRAIN_CONTROL_CATALOG.some((piece, index) => piece.id !== index + 1)
) {
  throw new Error("Control Catalog v1 must contain canonical IDs 1 through 42");
}

export function controlSpec(pieceId: number): BrainControlPieceSpec {
  const piece = BRAIN_CONTROL_CATALOG[pieceId - 1];
  if (!piece || piece.id !== pieceId)
    throw new Error(`Unknown control piece ${pieceId}`);
  return piece;
}

export function defaultControlBundle(pieceId: number): BrainControlBundle {
  const spec = controlSpec(pieceId);
  return {
    schemaVersion: 1,
    values: [...spec.defaults],
    assetIds: [0, 0, 0, 0],
  };
}

export function migrateLegacyPreset(
  pieceId: number,
  preset: number,
): BrainControlBundle {
  const bundle = defaultControlBundle(pieceId);
  const boundedPreset = Math.max(0, Math.min(4, Math.trunc(preset)));
  if (pieceId === 42) {
    bundle.values =
      boundedPreset <= 1
        ? [60, 8, 5, 5, 8, 5, 5, 4, 0, 15, 0, 1]
        : boundedPreset >= 3
          ? [15, 25, 15, 20, 10, 5, 5, 5, 2, 120, 2, 3]
          : [...controlSpec(42).defaults];
    return bundle;
  }
  const first = controlSpec(pieceId).controls[0];
  if (first.kind === "multi") {
    const optionCount = first.options?.length ?? 1;
    bundle.values[0] =
      boundedPreset < 2
        ? 1
        : boundedPreset > 2
          ? 1 << Math.max(0, optionCount - 1)
          : 1 << Math.floor(Math.max(0, optionCount - 1) / 2);
    return bundle;
  }
  const maximum =
    first.kind === "attention"
      ? (first.maximum ?? 0)
      : Math.max(0, (first.options?.length ?? 1) - 1);
  bundle.values[0] = Math.round((boundedPreset / 4) * maximum);
  return bundle;
}

export function scalarMaximums(pieceId: number): number[] {
  return controlSpec(pieceId).controls.map((control) =>
    control.kind === "multi" || control.kind === "attention"
      ? (control.maximum ?? 0)
      : Math.max(0, (control.options?.length ?? 1) - 1),
  );
}

export function packScalars(values: readonly number[]): `0x${string}` {
  if (values.length > BRAIN_CONTROL_SCALAR_SLOTS)
    throw new Error("Too many scalar values");
  let packed = 0n;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? 0;
    if (!Number.isInteger(value) || value < 0 || value > 65_535)
      throw new Error(`Invalid scalar ${index}`);
    packed |= BigInt(value) << BigInt(index * 16);
  }
  return `0x${packed.toString(16).padStart(64, "0")}`;
}

export function unpackScalars(pack: `0x${string}`, count = 12): number[] {
  const packed = BigInt(pack);
  return Array.from({ length: count }, (_, index) =>
    Number((packed >> BigInt(index * 16)) & 0xffffn),
  );
}

export function packAssetIds(values: readonly number[]): `0x${string}` {
  if (values.length > BRAIN_CONTROL_ASSET_SLOTS)
    throw new Error("Too many asset IDs");
  let packed = 0n;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index] ?? 0;
    if (!Number.isInteger(value) || value < 0 || value > 0xffff_ffff)
      throw new Error(`Invalid asset ID ${index}`);
    packed |= BigInt(value) << BigInt(index * 32);
  }
  return `0x${packed.toString(16).padStart(64, "0")}`;
}

export function unpackAssetIds(pack: `0x${string}`): number[] {
  const packed = BigInt(pack);
  return Array.from({ length: 4 }, (_, index) =>
    Number((packed >> BigInt(index * 32)) & 0xffff_ffffn),
  );
}

export function controlCatalogHash(): `0x${string}` {
  return keccak256(
    toHex(
      JSON.stringify({
        version: BRAIN_CONTROL_CATALOG_VERSION,
        pieces: BRAIN_CONTROL_CATALOG,
      }),
    ),
  );
}

export function validateControlBundle(
  pieceId: number,
  bundle: BrainControlBundle,
): string[] {
  const spec = controlSpec(pieceId);
  const errors: string[] = [];
  if (bundle.schemaVersion !== 1) errors.push("Unsupported control schema.");
  if (bundle.values.length !== spec.controls.length)
    errors.push("The control value count is incorrect.");
  const maximums = scalarMaximums(pieceId);
  spec.controls.forEach((control, index) => {
    const value = bundle.values[index];
    if (!Number.isInteger(value) || value < 0 || value > maximums[index])
      errors.push(`${control.label} is outside its allowed range.`);
    if (
      control.kind === "multi" &&
      control.maxSelections != null &&
      popcount(value ?? 0) > control.maxSelections
    )
      errors.push(
        `${control.label} allows at most ${control.maxSelections} choices.`,
      );
  });
  if (
    pieceId === 42 &&
    bundle.values.slice(0, 8).reduce((sum, value) => sum + value, 0) !== 100
  )
    errors.push("Data attention must total exactly 100 points.");
  if (bundle.assetIds.length !== 4)
    errors.push("The asset selection must contain four slots.");
  const favorites = bundle.assetIds.slice(0, 3).filter(Boolean);
  if (new Set(favorites).size !== favorites.length)
    errors.push("Favorite assets cannot be repeated.");
  if (!spec.assetTag && bundle.assetIds.some(Boolean))
    errors.push("This braincell does not accept asset selections.");
  if (spec.assetTag) {
    const directiveValue = bundle.values[4] ?? 0;
    if ((directiveValue === 0) !== ((bundle.assetIds[3] ?? 0) === 0))
      errors.push("Choose a direct-order target or clear the direct order.");
  }
  return errors;
}

export function summarizeControlBundle(
  pieceId: number,
  bundle: BrainControlBundle,
): string {
  const spec = controlSpec(pieceId);
  const parts = spec.controls.slice(0, 3).map((control, index) => {
    const value = bundle.values[index] ?? 0;
    if (control.kind === "attention") return `${control.label} ${value}%`;
    if (control.kind === "multi") {
      const selected =
        control.options
          ?.filter((_, optionIndex) => (value & (1 << optionIndex)) !== 0)
          .map((entry) => entry.label) ?? [];
      return `${control.label}: ${selected.join(", ") || "none"}`;
    }
    return `${control.label}: ${control.options?.[value]?.label ?? "unknown"}`;
  });
  return parts.join(" · ");
}

function popcount(value: number): number {
  let count = 0;
  let remaining = value >>> 0;
  while (remaining > 0) {
    count += remaining & 1;
    remaining >>>= 1;
  }
  return count;
}
