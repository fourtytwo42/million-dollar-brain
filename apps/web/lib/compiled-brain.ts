import {
  BRAIN_CONTROL_CATALOG_VERSION,
  BRAIN_CONTROL_SCHEMA_VERSION,
  controlSpec,
  summarizeControlBundle,
  type BrainControlBundle,
} from "./brain-controls.ts";

export type CompilableAsset = {
  id: string;
  controlId: number;
  symbol: string;
  kind: string;
  riskClass: string;
  active: boolean;
  tags: string[];
  currentWeightBps: number;
};

export type CompilablePiece = {
  id: number;
  weightBps: number;
  bundle: BrainControlBundle;
};

export type AssetDirectiveKind =
  | "none"
  | "eligible"
  | "preferred"
  | "spotlight"
  | "core_candidate"
  | "reduce"
  | "no_new_buys"
  | "exit";

export type CompiledAssetDirective = {
  assetId: string;
  controlId: number;
  symbol: string;
  riskClass: string;
  directive: AssetDirectiveKind;
  maximumTargetBps: number;
  preferenceScore: number;
  sources: number[];
  reasons: string[];
};

export type CompiledBrainV1 = {
  schemaVersion: 1;
  catalogVersion: 1;
  reserveMinimumBps: number;
  preferredPositionCount: number;
  preferredMaximumPositionBps: number;
  highVolatilityMaximumBps: number;
  baseCadenceMinutes: 15 | 30 | 60 | 240 | 360 | 1440;
  adaptiveCadence: "off" | "volatility" | "drawdown" | "both";
  panicCadenceMinutes: 15 | 30 | 60;
  cooldownMinutes: 15 | 30 | 60 | 240 | 1440;
  minimumDriftBps: 50 | 100 | 200 | 300 | 500;
  researchAssetLimit: 0 | 1 | 2 | 4;
  dataAttention: Record<string, number>;
  historyWindows: string[];
  assetDirectives: Record<string, CompiledAssetDirective>;
  sectorPreferences: Record<string, number>;
  pieceSummaries: { pieceId: number; summary: string; settings: string }[];
  conflicts: string[];
  inactiveEffects: string[];
};

export type EligibilityInput = {
  nowMs: number;
  lastReviewAtMs: number | null;
  lastTradeAtMs: number | null;
  currentDriftBps: number;
  basketVolatility24hBps: number | null;
  rollingVolatility80thBps: number | null;
  navDrawdownFromSevenDayHighBps: number | null;
  fresh: boolean;
  paused: boolean;
  cycleRunning: boolean;
};

export type BrainEligibilityV1 = {
  eligible: boolean;
  baseCadenceMinutes: number;
  effectiveCadenceMinutes: number;
  panicState: "none" | "volatility" | "drawdown" | "both";
  nextEligibleAtMs: number;
  reasons: string[];
};

const directiveNames: AssetDirectiveKind[] = [
  "none",
  "eligible",
  "preferred",
  "spotlight",
  "core_candidate",
  "reduce",
  "no_new_buys",
  "exit",
];
const directiveSeverity: Record<AssetDirectiveKind, number> = {
  none: 0,
  eligible: 1,
  preferred: 2,
  spotlight: 3,
  core_candidate: 4,
  reduce: 5,
  no_new_buys: 6,
  exit: 7,
};
const preferenceMultipliers = [0, 0, 1, 2, 3, 0, 0, 0];
const cadenceMinutes = [1440, 360, 240, 60, 30, 15] as const;
const panicMinutes = [15, 30, 60] as const;
const cooldownMinutes = [15, 30, 60, 240, 1440] as const;
const driftBps = [50, 100, 200, 300, 500] as const;
const reserveBps = [2000, 2500, 3000, 4000, 5000] as const;
const positions = [2, 4, 6, 9] as const;
const preferredMaximum = [800, 1200, 1600, 2000] as const;
const highVolatilityMaximum = [1000, 2000, 3000] as const;
const researchLimits = [0, 1, 2, 4] as const;
const attentionKeys = [
  "technical",
  "fundamentals",
  "valuation",
  "macro",
  "liquidity",
  "portfolio",
  "outcomes",
  "events",
] as const;
const historyWindowLabels = [
  "1h",
  "4h",
  "24h",
  "7d",
  "30d",
  "90d",
  "since_entry",
];

function byId(pieces: readonly CompilablePiece[], id: number) {
  const piece = pieces.find((candidate) => candidate.id === id);
  if (!piece) throw new Error(`Missing control bundle for piece ${id}`);
  return piece;
}

function selectedBits(mask: number, labels: readonly string[]) {
  return labels.filter((_, index) => (mask & (1 << index)) !== 0);
}

function capForDirective(
  directive: AssetDirectiveKind,
  currentWeightBps: number,
) {
  if (directive === "exit") return 0;
  if (directive === "no_new_buys") return currentWeightBps;
  if (directive === "reduce") return Math.floor(currentWeightBps / 2);
  return 10_000;
}

function applyDirective(
  target: CompiledAssetDirective,
  next: AssetDirectiveKind,
  pieceId: number,
  influenceBps: number,
) {
  target.sources.push(pieceId);
  target.reasons.push(`${controlSpec(pieceId).summary} (${next}).`);
  target.preferenceScore +=
    (preferenceMultipliers[directiveNames.indexOf(next)] ?? 0) * influenceBps;
  if (directiveSeverity[next] > directiveSeverity[target.directive]) {
    target.directive = next;
    target.maximumTargetBps = capForDirective(next, target.maximumTargetBps);
  }
}

export function compileBrainV1(
  pieces: readonly CompilablePiece[],
  assets: readonly CompilableAsset[],
): CompiledBrainV1 {
  if (pieces.length !== 42)
    throw new Error("CompiledBrainV1 requires 42 pieces");
  const assetByControlId = new Map(
    assets.map((asset) => [asset.controlId, asset]),
  );
  const assetDirectives: Record<string, CompiledAssetDirective> =
    Object.fromEntries(
      assets.map((asset) => [
        asset.id,
        {
          assetId: asset.id,
          controlId: asset.controlId,
          symbol: asset.symbol,
          riskClass: asset.riskClass,
          directive: "none" as AssetDirectiveKind,
          maximumTargetBps: 10_000,
          preferenceScore: 0,
          sources: [] as number[],
          reasons: [] as string[],
        },
      ]),
    );
  const sectorPreferences: Record<string, number> = {};
  const conflicts: string[] = [];
  const inactiveEffects: string[] = [];

  for (let pieceId = 19; pieceId <= 34; pieceId += 1) {
    const piece = byId(pieces, pieceId);
    const spec = controlSpec(pieceId);
    const status = piece.bundle.values[0] ?? 0;
    const exposure = piece.bundle.values[1] ?? 0;
    sectorPreferences[spec.assetTag ?? `piece_${pieceId}`] =
      status * piece.weightBps + exposure * Math.floor(piece.weightBps / 2);
    for (const controlId of piece.bundle.assetIds.slice(0, 3).filter(Boolean)) {
      const asset = assetByControlId.get(controlId);
      if (!asset || !asset.active) {
        inactiveEffects.push(
          `Piece ${pieceId} favorite ${controlId} is inactive.`,
        );
        continue;
      }
      assetDirectives[asset.id].preferenceScore += piece.weightBps;
      assetDirectives[asset.id].sources.push(pieceId);
    }
    const targetId = piece.bundle.assetIds[3] ?? 0;
    const directive = directiveNames[piece.bundle.values[4] ?? 0] ?? "none";
    if (directive !== "none" && targetId === 0) {
      inactiveEffects.push(`Piece ${pieceId} has no direct-order target.`);
      continue;
    }
    if (targetId !== 0) {
      const asset = assetByControlId.get(targetId);
      if (!asset || !asset.active) {
        inactiveEffects.push(
          `Piece ${pieceId} target ${targetId} is inactive.`,
        );
      } else {
        const target = assetDirectives[asset.id];
        const previous = target.directive;
        const currentWeight = asset.currentWeightBps;
        applyDirective(target, directive, pieceId, piece.weightBps);
        target.maximumTargetBps = Math.min(
          target.maximumTargetBps,
          capForDirective(directive, currentWeight),
        );
        if (
          (directiveSeverity[directive] >= directiveSeverity.reduce &&
            directiveSeverity[previous] > 0 &&
            directiveSeverity[previous] < directiveSeverity.reduce) ||
          (directiveSeverity[previous] >= directiveSeverity.reduce &&
            directiveSeverity[directive] > 0 &&
            directiveSeverity[directive] < directiveSeverity.reduce)
        ) {
          conflicts.push(
            `${asset.symbol}: restrictive control beats the positive directive from Piece ${pieceId}.`,
          );
        }
      }
    }
  }

  const classVeto = byId(pieces, 2).bundle.values[3] ?? 0;
  if (classVeto !== 0) {
    for (const asset of assets.filter((candidate) =>
      classVeto === 1
        ? candidate.kind === "stock" || candidate.kind === "etf"
        : candidate.kind === "crypto",
    )) {
      const target = assetDirectives[asset.id];
      target.directive = "no_new_buys";
      target.maximumTargetBps = Math.min(
        target.maximumTargetBps,
        asset.currentWeightBps,
      );
      target.sources.push(2);
      target.reasons.push("Piece 2 class veto.");
    }
  }

  const piece42 = byId(pieces, 42).bundle.values;
  const dataAttention = Object.fromEntries(
    attentionKeys.map((key, index) => [key, piece42[index] ?? 0]),
  );
  const compiled: CompiledBrainV1 = {
    schemaVersion: BRAIN_CONTROL_SCHEMA_VERSION,
    catalogVersion: BRAIN_CONTROL_CATALOG_VERSION,
    reserveMinimumBps:
      reserveBps[byId(pieces, 5).bundle.values[0] ?? 0] ?? 2000,
    preferredPositionCount:
      positions[byId(pieces, 3).bundle.values[0] ?? 0] ?? 6,
    preferredMaximumPositionBps:
      preferredMaximum[byId(pieces, 3).bundle.values[1] ?? 0] ?? 1600,
    highVolatilityMaximumBps:
      highVolatilityMaximum[byId(pieces, 10).bundle.values[3] ?? 0] ?? 2000,
    baseCadenceMinutes:
      cadenceMinutes[byId(pieces, 4).bundle.values[0] ?? 0] ?? 60,
    adaptiveCadence: (["off", "volatility", "drawdown", "both"] as const)[
      byId(pieces, 6).bundle.values[0] ?? 0
    ],
    panicCadenceMinutes:
      panicMinutes[byId(pieces, 6).bundle.values[1] ?? 0] ?? 30,
    cooldownMinutes:
      cooldownMinutes[byId(pieces, 38).bundle.values[0] ?? 0] ?? 60,
    minimumDriftBps: driftBps[byId(pieces, 38).bundle.values[1] ?? 0] ?? 200,
    researchAssetLimit:
      researchLimits[byId(pieces, 39).bundle.values[4] ?? 0] ?? 0,
    dataAttention,
    historyWindows: selectedBits(piece42[9] ?? 0, historyWindowLabels),
    assetDirectives,
    sectorPreferences,
    pieceSummaries: pieces.map((piece) => ({
      pieceId: piece.id,
      summary: controlSpec(piece.id).summary,
      settings: summarizeControlBundle(piece.id, piece.bundle),
    })),
    conflicts,
    inactiveEffects,
  };
  return compiled;
}

export function evaluateBrainEligibility(
  compiled: CompiledBrainV1,
  input: EligibilityInput,
): BrainEligibilityV1 {
  const volatilityPanic =
    compiled.adaptiveCadence !== "off" &&
    compiled.adaptiveCadence !== "drawdown" &&
    input.basketVolatility24hBps != null &&
    input.rollingVolatility80thBps != null &&
    input.basketVolatility24hBps > input.rollingVolatility80thBps;
  const drawdownPanic =
    compiled.adaptiveCadence !== "off" &&
    compiled.adaptiveCadence !== "volatility" &&
    (input.navDrawdownFromSevenDayHighBps ?? 0) >= 500;
  const panicState =
    volatilityPanic && drawdownPanic
      ? "both"
      : volatilityPanic
        ? "volatility"
        : drawdownPanic
          ? "drawdown"
          : "none";
  const effectiveCadenceMinutes =
    panicState === "none"
      ? compiled.baseCadenceMinutes
      : Math.min(compiled.baseCadenceMinutes, compiled.panicCadenceMinutes);
  const nextReviewAt =
    (input.lastReviewAtMs ?? 0) + effectiveCadenceMinutes * 60_000;
  const nextTradeAt =
    (input.lastTradeAtMs ?? 0) + compiled.cooldownMinutes * 60_000;
  const reasons: string[] = [];
  if (input.cycleRunning) reasons.push("Another cycle is active.");
  if (input.paused) reasons.push("Rebalancing is paused.");
  if (!input.fresh) reasons.push("Required data is stale.");
  if (input.nowMs < nextReviewAt)
    reasons.push("Review cadence has not elapsed.");
  if (input.nowMs < nextTradeAt)
    reasons.push("Trade cooldown has not elapsed.");
  if (input.currentDriftBps < compiled.minimumDriftBps)
    reasons.push("Portfolio drift is below the selected threshold.");
  return {
    eligible: reasons.length === 0,
    baseCadenceMinutes: compiled.baseCadenceMinutes,
    effectiveCadenceMinutes,
    panicState,
    nextEligibleAtMs: Math.max(nextReviewAt, nextTradeAt),
    reasons,
  };
}

export function applyCompiledRestrictions(
  proposed: Record<string, number>,
  compiled: CompiledBrainV1,
  reserveAssetId: string,
) {
  const result = Object.fromEntries(
    Object.keys(compiled.assetDirectives).map((id) => [
      id,
      Math.max(0, Math.trunc(proposed[id] ?? 0)),
    ]),
  );
  let released = 0;
  for (const [id, directive] of Object.entries(compiled.assetDirectives)) {
    const capped = Math.min(result[id] ?? 0, directive.maximumTargetBps);
    released += (result[id] ?? 0) - capped;
    result[id] = capped;
  }
  const highVolatilityIds = Object.entries(compiled.assetDirectives)
    .filter(([, directive]) => directive.riskClass === "high_volatility")
    .map(([id]) => id);
  const highVolatilityTotal = highVolatilityIds.reduce(
    (sum, id) => sum + (result[id] ?? 0),
    0,
  );
  if (highVolatilityTotal > compiled.highVolatilityMaximumBps) {
    let excess = highVolatilityTotal - compiled.highVolatilityMaximumBps;
    for (const id of highVolatilityIds.sort(
      (a, b) => (result[b] ?? 0) - (result[a] ?? 0),
    )) {
      const take = Math.min(excess, result[id] ?? 0);
      result[id] -= take;
      released += take;
      excess -= take;
      if (excess === 0) break;
    }
  }
  result[reserveAssetId] = (result[reserveAssetId] ?? 0) + released;
  const total = Object.values(result).reduce((sum, weight) => sum + weight, 0);
  result[reserveAssetId] = (result[reserveAssetId] ?? 0) + (10_000 - total);
  if ((result[reserveAssetId] ?? 0) < compiled.reserveMinimumBps) {
    let needed = compiled.reserveMinimumBps - (result[reserveAssetId] ?? 0);
    const reducible = Object.keys(result)
      .filter((id) => id !== reserveAssetId)
      .sort((a, b) => (result[b] ?? 0) - (result[a] ?? 0));
    for (const id of reducible) {
      const take = Math.min(needed, result[id] ?? 0);
      result[id] -= take;
      result[reserveAssetId] += take;
      needed -= take;
      if (needed === 0) break;
    }
  }
  return result;
}
