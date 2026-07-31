import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { keccak256, stringToHex } from "viem";
import { basketAbi } from "./abi";
import { withAdminTransactionLock } from "./admin-transaction-lock";
import {
  adminClient,
  dashboard,
  deployment,
  deploymentAssets,
  publicClient,
  waitForReliableTransactionReceipt,
} from "./chain";
import { buildDecisionContext } from "./decision-context";
import type {
  AllocationConfidenceReasonV1,
  DecisionContextV7,
} from "./decision-context";
import {
  constrainDynamicAllocationProposal,
  normalizeDynamicAllocationProposal,
  type DynamicAllocation,
} from "./asset-universe.ts";
import {
  buildStructuredResearchResults,
  validateResearchRequests,
  type ResearchResultV1,
} from "./decision-research.ts";
import { BRAIN_CATALOG_VERSION } from "./brain-catalog";
import {
  CHARACTER_ROSTER_VERSION,
  generateMemeRecap,
  validateAiBrainPulse,
} from "./brain-meme";
import { persistCycle, persistResearchRound } from "./persistence";
import {
  buildPortfolioAccounting,
  persistAccountingSnapshot,
  syncVaultLedger,
} from "./portfolio-accounting";
import { buildDexRebalancePlans, reviveDexSwapPlans } from "./quote-planner";
import { collectOfficialMarketData } from "./market-history";
import { syncLocalMarketPrices } from "./market-price-sync";
import { networkConfig } from "./network";
import {
  applyEvidenceAwareAllocationPolicy,
  compileBrainV1,
  evaluateBrainEligibility,
  type AllocationPolicyEvidenceV1,
} from "./compiled-brain";
import { summarizeControlBundle } from "./brain-controls";
import { stableDecisionJson } from "./decision-math";

const allowed = ["USDG", "NVDA", "AAPL", "ETHX"] as const;
type Symbol = (typeof allowed)[number];
type Allocation = Record<Symbol, number>;
type Decision = {
  allocation: Allocation;
  brainPulse: string | null;
  rationale: string;
  source: "ai" | "fallback";
  rawOutput: string;
  promptHash: string;
  modelConfig: {
    provider: string;
    model: string;
    temperature: number;
    maximumOutputTokens: number;
    stateless: true;
  };
};

export type DynamicDecision = {
  allocationById: DynamicAllocation;
  rawAllocationById: DynamicAllocation;
  brainPulse: string | null;
  confidenceByAssetId: Record<
    string,
    {
      confidence: "low" | "medium" | "high";
      reasonCodes: AllocationConfidenceReasonV1[];
    }
  >;
  allocationPolicy: AllocationPolicyEvidenceV1 | null;
  rationale: string;
  source: "ai" | "fallback";
  rawOutputs: string[];
  promptHashes: string[];
  researchResults: ResearchResultV1[];
  modelConfig: {
    provider: string;
    model: string;
    temperature: number;
    maximumOutputTokens: number;
    maximumInputTokens: number;
    stateless: true;
  };
};

function cleanAllocation(value: unknown): Allocation {
  if (!value || typeof value !== "object") {
    throw new Error("allocation is not an object");
  }
  const source = value as Record<string, unknown>;
  const allocation = Object.fromEntries(
    allowed.map((symbol) => [symbol, Number(source[symbol])]),
  ) as Allocation;
  const valid =
    allowed.every(
      (symbol) =>
        Number.isInteger(allocation[symbol]) && allocation[symbol] >= 0,
    ) &&
    allocation.USDG >= 2000 &&
    Object.values(allocation).reduce((a, b) => a + b, 0) === 10000;
  if (!valid) throw new Error("allocation violates deterministic limits");
  return allocation;
}

function holdAllocation(
  weights: Record<string, number>,
  previous: Record<string, number> | null,
): Allocation {
  try {
    if (previous) return cleanAllocation(previous);
  } catch {
    // A legacy target may not satisfy the current deterministic policy.
  }
  const risk = allowed
    .filter((symbol) => symbol !== "USDG")
    .reduce((sum, symbol) => sum + Math.max(0, weights[symbol] ?? 0), 0);
  const reserve = 10_000 - risk;
  if (reserve >= 2_000) {
    return {
      USDG: reserve,
      NVDA: Math.max(0, weights.NVDA ?? 0),
      AAPL: Math.max(0, weights.AAPL ?? 0),
      ETHX: Math.max(0, weights.ETHX ?? 0),
    };
  }
  return { USDG: 2_000, NVDA: 3_500, AAPL: 0, ETHX: 4_500 };
}

function responseText(body: unknown) {
  if (typeof body === "string") return body;
  const payload = body as {
    choices?: {
      message?: { content?: string; reasoning_content?: string };
    }[];
    output_text?: string;
  };
  return (
    payload.choices?.[0]?.message?.content ??
    payload.choices?.[0]?.message?.reasoning_content ??
    payload.output_text ??
    ""
  );
}

async function askAllocator(
  context: unknown,
  fallback: Allocation,
  holdReason?: string,
): Promise<Decision> {
  const provider =
    process.env.MDB_AI_BASE_URL ?? "http://192.168.50.189:30001/v1";
  const model = process.env.MDB_AI_MODEL ?? "ornith-1.0-35b-Q5_K_M-688b8d0a";
  const modelConfig = {
    provider,
    model,
    temperature: 0.2,
    maximumOutputTokens: 4_096,
    stateless: true as const,
  };
  const prompt = [
    "You are the constrained allocation engine for a LOCAL DEVNET simulation.",
    "You cannot add assets, browse, call tools, trade, use leverage, or override limits.",
    "Return exactly one JSON object and no other text:",
    '{"USDG":integer,"NVDA":integer,"AAPL":integer,"ETHX":integer,"brainPulse":"one short sentence in the 42 Braincells meme voice explaining this decision"}.',
    "Weights total 10000 and USDG is at least 2000.",
    "The executable universe is separate from reference-only market context.",
    "Brain moods are bounded steering signals, never authority to break rules.",
    `Fresh decision package: ${JSON.stringify(context)}`,
  ].join(" ");
  const promptHash = keccak256(stringToHex(prompt));
  if (holdReason) {
    return {
      allocation: fallback,
      brainPulse: null,
      rationale: `Deterministic hold: ${holdReason}`,
      source: "fallback",
      rawOutput: "",
      promptHash,
      modelConfig,
    };
  }
  try {
    if (Math.ceil(prompt.length / 4) > 32_000) {
      throw new Error("bounded prompt exceeds 32K input-token estimate");
    }
    const response = await fetch(`${provider}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        max_tokens: modelConfig.maximumOutputTokens,
        temperature: modelConfig.temperature,
        response_format: { type: "json_object" },
        stream: false,
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (!response.ok) throw new Error(`provider ${response.status}`);
    const rawOutput = responseText(await response.json());
    const match = rawOutput.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("model did not return JSON");
    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    const brainPulse = validateAiBrainPulse(parsed.brainPulse);
    if (!brainPulse) throw new Error("model returned an invalid Brain Pulse");
    return {
      allocation: cleanAllocation(parsed),
      brainPulse,
      rationale: "Allocation proposed by the local constrained model.",
      source: "ai",
      rawOutput,
      promptHash,
      modelConfig,
    };
  } catch (error) {
    return {
      allocation: fallback,
      brainPulse: null,
      rationale: `Deterministic hold: ${error instanceof Error ? error.message : "allocator unavailable"}`,
      source: "fallback",
      rawOutput: "",
      promptHash,
      modelConfig,
    };
  }
}

async function requestModelJson(
  provider: string,
  model: string,
  prompt: string,
  maximumOutputTokens: number,
) {
  if (Math.ceil(prompt.length / 4) > 96_000) {
    throw new Error("bounded prompt exceeds 96K input-token estimate");
  }
  const response = await fetch(`${provider}/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maximumOutputTokens,
      temperature: 0.2,
      response_format: { type: "json_object" },
      stream: false,
    }),
    signal: AbortSignal.timeout(240_000),
  });
  if (!response.ok) throw new Error(`provider ${response.status}`);
  const rawOutput = responseText(await response.json());
  const match = rawOutput.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("model did not return JSON");
  return { rawOutput, parsed: JSON.parse(match[0]) as Record<string, unknown> };
}

export async function runDynamicResearchAllocator(
  context: DecisionContextV7,
  fallback: DynamicAllocation,
): Promise<DynamicDecision> {
  const provider =
    process.env.MDB_AI_BASE_URL ?? "http://192.168.50.189:30001/v1";
  const model = process.env.MDB_AI_MODEL ?? "ornith-1.0-35b-Q5_K_M-688b8d0a";
  const modelConfig = {
    provider,
    model,
    temperature: 0.2,
    maximumOutputTokens: 8_192,
    maximumInputTokens: 96_000,
    stateless: true as const,
  };
  const rawOutputs: string[] = [];
  const promptHashes: string[] = [];
  const researchResults: ResearchResultV1[] = [];
  try {
    if (context.freshness.holdRequired) {
      throw new Error(context.freshness.reasons.join("; "));
    }
    const basePrompt = [
      "You are the constrained allocation engine for 42 Braincells.",
      "You may allocate only to active asset IDs in eligibleAssetDirectory.",
      "Never invent an address, asset, fact, source, or tool.",
      `You have one optional structured research round for at most ${context.researchPolicy.maximumAssets} registered assets.`,
      'First return either {"kind":"research","requests":[{"assetId":"chain:address","topics":["identity"]}]}',
      'or {"kind":"allocation","allocation":{"chain:address":integer},"brainPulse":"one short decision sentence"}.',
      `Allocation weights total 10000. Reserve minimum is ${context.compiledBrain.reserveMinimumBps}.`,
      `Use at most ${context.compiledBrain.preferredPositionCount} risk positions; this is a maximum, never a target.`,
      `Combined high-volatility weight is at most ${context.compiledBrain.highVolatilityMaximumBps}; each asset also has maximumWeightBps.`,
      "Missing evidence is uncertainty, never a neutral score or zero return. Prefer USDG over mechanically equal weighting when assets cannot be distinguished.",
      "DEX TWAP, time-weighted liquidity, and exact-size capacity are the only authoritative pricing and admission evidence. External research cannot authorize a trade.",
      "Respect every exit, reduce, no-new-buy, and protocol restriction.",
      'Every final allocation response must include "brainPulse": one vivid, understandable sentence of 12 to 180 characters in the 42 Braincells meme voice. It must explain the decision without URLs, guarantees, or invented facts.',
      'An allocation response may include "confidenceByAssetId" with low, medium, or high confidence and reasonCodes from brain_preference, momentum, fundamentals, valuation, diversification, existing_position, low_evidence.',
      `DecisionContextV7: ${JSON.stringify(context)}`,
    ].join(" ");
    promptHashes.push(keccak256(stringToHex(basePrompt)));
    const first = await requestModelJson(
      provider,
      model,
      basePrompt,
      modelConfig.maximumOutputTokens,
    );
    rawOutputs.push(first.rawOutput);
    let proposed: unknown;
    let confidenceSourceRaw: unknown;
    let brainPulse: string | null = null;
    if (first.parsed.kind === "research") {
      const requests = validateResearchRequests(
        first.parsed.requests,
        context.assetRecords,
      );
      if (requests.length > context.researchPolicy.maximumAssets) {
        throw new Error(
          `research request exceeds the compiled limit of ${context.researchPolicy.maximumAssets}`,
        );
      }
      const results = buildStructuredResearchResults(
        requests,
        context.assetRecords,
        context.eligibleAssetDirectory,
        context.assets as unknown as ({
          id: string;
        } & Record<string, unknown>)[],
      );
      researchResults.push(...results);
      const researchHash = keccak256(
        stringToHex(JSON.stringify({ requests, results })),
      );
      await persistResearchRound(
        context.inputHash,
        requests,
        results,
        researchHash,
      );
      const finalPrompt = [
        "Return the final constrained allocation now.",
        "No more research is allowed.",
        'Return exactly {"kind":"allocation","allocation":{"chain:address":integer},"brainPulse":"one short decision sentence","confidenceByAssetId":{"chain:address":{"confidence":"low|medium|high","reasonCodes":["allowed_reason"]}}}.',
        `Immutable DecisionContextV7: ${JSON.stringify(context)}`,
        `Recorded structured research: ${JSON.stringify(results)}`,
      ].join(" ");
      promptHashes.push(keccak256(stringToHex(finalPrompt)));
      const second = await requestModelJson(
        provider,
        model,
        finalPrompt,
        modelConfig.maximumOutputTokens,
      );
      rawOutputs.push(second.rawOutput);
      if (second.parsed.kind !== "allocation") {
        throw new Error("second model pass did not return an allocation");
      }
      proposed = second.parsed.allocation;
      confidenceSourceRaw = second.parsed.confidenceByAssetId;
      brainPulse = validateAiBrainPulse(second.parsed.brainPulse);
    } else if (first.parsed.kind === "allocation") {
      proposed = first.parsed.allocation;
      confidenceSourceRaw = first.parsed.confidenceByAssetId;
      brainPulse = validateAiBrainPulse(first.parsed.brainPulse);
    } else {
      throw new Error("model returned neither research nor allocation");
    }
    if (!brainPulse) throw new Error("model returned an invalid Brain Pulse");
    let rawAllocationById: DynamicAllocation;
    let allocationById: DynamicAllocation;
    try {
      rawAllocationById = normalizeDynamicAllocationProposal(
        proposed,
        context.assetRecords,
        context.reserveAssetId,
      );
      allocationById = constrainDynamicAllocationProposal(
        proposed,
        context.assetRecords,
        context.reserveAssetId,
      );
    } catch (error) {
      if (
        !(error instanceof Error) ||
        error.message !== "weights must total 10000"
      ) {
        throw error;
      }
      const correctionPrompt = [
        "Correct the allocation arithmetic from your immediately previous response.",
        "No research, new thesis, new asset, or explanation is allowed.",
        "Return exactly one JSON object with kind allocation, integer weights totaling exactly 10000, a valid brainPulse, and optional confidenceByAssetId.",
        `Reserve weight must be at least ${context.compiledBrain.reserveMinimumBps}; use at most ${context.compiledBrain.preferredPositionCount} risk positions; every asset must respect maximumWeightBps.`,
        "Omitted active asset IDs count as zero.",
        `Eligible assets: ${JSON.stringify(context.eligibleAssetDirectory)}`,
        `Previous response: ${rawOutputs.at(-1) ?? ""}`,
      ].join(" ");
      promptHashes.push(keccak256(stringToHex(correctionPrompt)));
      const corrected = await requestModelJson(
        provider,
        model,
        correctionPrompt,
        modelConfig.maximumOutputTokens,
      );
      rawOutputs.push(corrected.rawOutput);
      if (corrected.parsed.kind !== "allocation") {
        throw new Error("arithmetic correction did not return an allocation");
      }
      proposed = corrected.parsed.allocation;
      confidenceSourceRaw = corrected.parsed.confidenceByAssetId;
      brainPulse = validateAiBrainPulse(corrected.parsed.brainPulse);
      if (!brainPulse) {
        throw new Error("arithmetic correction returned an invalid Brain Pulse");
      }
      rawAllocationById = normalizeDynamicAllocationProposal(
        proposed,
        context.assetRecords,
        context.reserveAssetId,
      );
      allocationById = constrainDynamicAllocationProposal(
        proposed,
        context.assetRecords,
        context.reserveAssetId,
      );
    }
    const confidenceSource =
      (confidenceSourceRaw as Record<string, unknown> | undefined) ?? {};
    const allowedReasons = new Set<AllocationConfidenceReasonV1>([
      "brain_preference",
      "momentum",
      "fundamentals",
      "valuation",
      "diversification",
      "existing_position",
      "low_evidence",
    ]);
    const confidenceByAssetId = Object.fromEntries(
      Object.entries(allocationById)
        .filter(([id, weight]) => id !== context.reserveAssetId && weight > 0)
        .map(([id]) => {
          const row = confidenceSource[id] as
            { confidence?: unknown; reasonCodes?: unknown } | undefined;
          const evidence = context.assetEvidence[id];
          const confidence: "low" | "medium" | "high" =
            row?.confidence === "high" ||
            row?.confidence === "medium" ||
            row?.confidence === "low"
              ? row.confidence
              : evidence?.tier === "complete"
                ? "medium"
                : "low";
          const reasonCodes = Array.isArray(row?.reasonCodes)
            ? row.reasonCodes.filter(
                (reason): reason is AllocationConfidenceReasonV1 =>
                  typeof reason === "string" &&
                  allowedReasons.has(reason as AllocationConfidenceReasonV1),
              )
            : [];
          if (
            evidence?.tier === "price_only" &&
            !reasonCodes.includes("low_evidence")
          ) {
            reasonCodes.push("low_evidence");
          }
          return [id, { confidence, reasonCodes: reasonCodes.slice(0, 4) }];
        }),
    );
    return {
      allocationById,
      rawAllocationById: { ...rawAllocationById },
      brainPulse,
      confidenceByAssetId,
      allocationPolicy: null,
      rationale:
        researchResults.length > 0
          ? "Allocation proposed after one recorded structured research round."
          : "Allocation proposed from the bounded DecisionContext V7.",
      source: "ai",
      rawOutputs,
      promptHashes,
      researchResults,
      modelConfig,
    };
  } catch (error) {
    return {
      allocationById: fallback,
      rawAllocationById: { ...fallback },
      brainPulse: null,
      confidenceByAssetId: {},
      allocationPolicy: null,
      rationale: `Deterministic hold: ${error instanceof Error ? error.message : "allocator unavailable"}`,
      source: "fallback",
      rawOutputs,
      promptHashes,
      researchResults,
      modelConfig,
    };
  }
}

function serializable<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_, item) =>
      typeof item === "bigint" ? item.toString() : item,
    ),
  ) as T;
}

type EligibilityState = {
  lastReviewAtMs: number | null;
  lastTradeAtMs: number | null;
};

function eligibilityPaths() {
  const dir =
    process.env.MDB_STATE_DIR ??
    "/home/hendo420/projects/million-dollar-brain/var";
  mkdirSync(dir, { recursive: true });
  return {
    state: `${dir}/control-eligibility.json`,
    evidence: `${dir}/control-eligibility.jsonl`,
  };
}

function loadEligibilityState(): EligibilityState {
  const paths = eligibilityPaths();
  if (!existsSync(paths.state))
    return { lastReviewAtMs: null, lastTradeAtMs: null };
  try {
    return JSON.parse(readFileSync(paths.state, "utf8")) as EligibilityState;
  } catch {
    return { lastReviewAtMs: null, lastTradeAtMs: null };
  }
}

function saveEligibilityState(
  state: EligibilityState,
  evidence: Record<string, unknown>,
) {
  const paths = eligibilityPaths();
  writeFileSync(paths.state, `${JSON.stringify(state)}\n`, { mode: 0o600 });
  appendFileSync(
    paths.evidence,
    `${JSON.stringify({ at: new Date().toISOString(), ...evidence })}\n`,
  );
}

export async function runCycle() {
  const d = deployment();
  const redemptionTxHash: `0x${string}` | null = null;
  if ((d.schemaVersion ?? 0) >= 3 && networkConfig.mode === "testnet") {
    await collectOfficialMarketData();
    await syncLocalMarketPrices();
  }
  await syncVaultLedger();
  const state = await dashboard();
  const baseMarket = await buildDecisionContext(state);
  const manifestAssets = deploymentAssets(d);
  const compiledBrain = compileBrainV1(
    state.pieces.map((piece) => ({
      id: piece.id,
      weightBps: piece.weight,
      bundle: piece.controlBundle,
    })),
    baseMarket.assetRecords.map((asset, index) => {
      const manifest = manifestAssets.find(
        (candidate) => candidate.id === asset.id,
      );
      return {
        id: asset.id,
        controlId: manifest?.controlId ?? index + 1,
        symbol: asset.symbol,
        kind: asset.kind,
        riskClass: asset.riskClass,
        active: asset.active,
        tags: manifest?.tags ?? asset.tags,
        currentWeightBps: state.currentWeightsBps[asset.symbol] ?? 0,
      };
    }),
  );
  const assetEvidence = Object.fromEntries(
    baseMarket.eligibleAssetDirectory.map((asset) => [
      asset.id,
      asset.evidence ?? {
        tier: "price_only" as const,
        coverageScoreBps: 0,
        sampleCount: 0,
        spanMinutes: 0,
        availableFields: [],
        unavailableReasons: [
          "only fresh on-chain valuation is currently available",
        ],
      },
    ]),
  );
  const assetCapacityPolicy = Object.fromEntries(
    baseMarket.assetRecords.map((asset) => {
      const qualification =
        asset.qualification &&
        "schemaVersion" in asset.qualification &&
        asset.qualification.schemaVersion === 3
          ? asset.qualification
          : null;
      const currentValue = BigInt(state.holdingValues[asset.symbol] ?? "0");
      const maximumExposure = BigInt(
        qualification?.maximumExposureUsdWad ?? "0",
      );
      return [
        asset.id,
        {
          safeTwoSidedCapacityUsdWad:
            qualification?.safeTwoSidedCapacityUsdWad ?? "0",
          maximumExposureUsdWad: qualification?.maximumExposureUsdWad ?? "0",
          capacityUtilizationBps:
            maximumExposure > 0n
              ? Number((currentValue * 10_000n) / maximumExposure)
              : null,
          shortTwapValid: qualification?.dexSafety.shortTwapValid ?? false,
          longTwapValid: qualification?.dexSafety.longTwapValid ?? false,
          timeWeightedLiquidityValid:
            qualification?.dexSafety.timeWeightedLiquidityValid ?? false,
          qualificationHours: qualification?.qualificationHours ?? 0,
          regularMarketSessions: qualification?.regularMarketSessions ?? 0,
          mature:
            qualification !== null &&
            qualification.qualificationHours >= 48 &&
            qualification.dexSafety.shortTwapValid &&
            qualification.dexSafety.longTwapValid &&
            qualification.dexSafety.timeWeightedLiquidityValid,
        },
      ];
    }),
  );
  const market: DecisionContextV7 = {
    ...baseMarket,
    schemaVersion: 7,
    pricingAuthority: "dex_twap",
    settlementAsset: "USDG",
    nativeEthEntryEnabled: false,
    controlCatalog: {
      schemaVersion: 1,
      catalogVersion: 1,
      catalogHash: state.controlCatalog.catalogHash,
      bundles: state.pieces.map((piece) => ({
        pieceId: piece.id,
        bundleHash: piece.controlBundleHash,
        selectionVersion: piece.controlSelectionVersion,
        values: piece.controlBundle.values,
        assetIds: piece.controlBundle.assetIds,
      })),
    },
    compiledBrain,
    assetEvidence,
    allocationPolicy: {
      preferredPositionMaximum: compiledBrain.preferredPositionCount,
      positionCountIsMaximum: true,
      missingEvidenceIsUncertainty: true,
    },
    assetCapacityPolicy,
    researchPolicy: {
      ...baseMarket.researchPolicy,
      maximumAssets: compiledBrain.researchAssetLimit,
    },
    inputHash: keccak256(
      stringToHex(
        stableDecisionJson({
          baseInputHash: baseMarket.inputHash,
          controlCatalogHash: state.controlCatalog.catalogHash,
          compiledBrain,
          assetEvidence,
          assetCapacityPolicy,
        }),
      ),
    ),
  };
  const eligibilityState = loadEligibilityState();
  const eligibility = evaluateBrainEligibility(compiledBrain, {
    nowMs: Date.now(),
    lastReviewAtMs: eligibilityState.lastReviewAtMs,
    lastTradeAtMs: null,
    currentDriftBps: 10_000,
    basketVolatility24hBps: null,
    rollingVolatility80thBps: null,
    navDrawdownFromSevenDayHighBps: null,
    fresh: !market.freshness.holdRequired,
    paused: !state.activation.rebalancesEnabled,
    cycleRunning: false,
  });
  if (state.activation.controlBundlesEnabled && !eligibility.eligible) {
    saveEligibilityState(eligibilityState, {
      status: "skipped",
      inputHash: market.inputHash,
      eligibility,
    });
    return {
      schemaVersion: 7,
      at: new Date().toISOString(),
      source: "scheduler",
      executionStatus: "skipped",
      rationale: eligibility.reasons.join(" "),
      eligibility,
    };
  }
  if (state.activation.controlBundlesEnabled) {
    saveEligibilityState(eligibilityState, {
      status: "review_started",
      inputHash: market.inputHash,
      eligibility,
    });
  }
  const brain = state.pieces.map((piece) => {
    const active = piece.data.every(
      (dependency) => market.dataAvailability[dependency] === true,
    );
    return {
      id: piece.id,
      character: piece.name,
      crew: piece.crew,
      tagline: piece.tagline,
      affinity: piece.affinity,
      category: piece.category,
      weightBps: piece.weight,
      selectedOption: summarizeControlBundle(piece.id, piece.controlBundle),
      signedValue: 0 as const,
      weightedValue: 0,
      canonicalInstruction: active
        ? compiledBrain.pieceSummaries[piece.id - 1].summary
        : "Inactive because validated structured data is unavailable.",
      tags: piece.tags,
      dataDependencies: piece.data,
      active,
      owned: !piece.unowned,
    };
  });
  const nonNeutral = brain.filter((piece) => piece.active);
  const tagPreferenceBps: Record<string, number> = {};
  for (const piece of nonNeutral) {
    for (const tag of piece.tags) {
      tagPreferenceBps[tag] =
        (tagPreferenceBps[tag] ?? 0) +
        (compiledBrain.sectorPreferences[tag] ?? 0);
    }
  }
  const allocatorContext = {
    brainCatalogVersion: BRAIN_CATALOG_VERSION,
    fullBrain: brain,
    activeNonNeutralInstructions: nonNeutral.map((piece) => ({
      pieceId: piece.id,
      character: piece.character,
      affinity: piece.affinity,
      mood: piece.selectedOption,
      intensity: piece.signedValue,
      instruction: piece.canonicalInstruction,
      influenceBps: piece.weightBps,
    })),
    aggregateEffects: { tagPreferenceBps },
    decisionContext: market,
  };
  const dynamicMode = (d.schemaVersion ?? 0) >= 3 && Boolean(d.assets?.length);
  const dynamicFallback = Object.fromEntries(
    market.assetRecords
      .filter((asset) => asset.active)
      .map((asset) => [asset.id, state.currentWeightsBps[asset.symbol] ?? 0]),
  );
  const dynamicFallbackTotal = Object.values(dynamicFallback).reduce(
    (sum, weight) => sum + weight,
    0,
  );
  if (dynamicMode && dynamicFallbackTotal !== 10_000) {
    for (const id of Object.keys(dynamicFallback)) dynamicFallback[id] = 0;
    dynamicFallback[market.reserveAssetId] = 10_000;
  }
  const legacyFallback = holdAllocation(
    state.currentWeightsBps,
    market.previousTarget,
  );
  const dynamicDecision = dynamicMode
    ? await runDynamicResearchAllocator(market, dynamicFallback)
    : null;
  if (dynamicDecision?.source === "ai") {
    const policyResult = applyEvidenceAwareAllocationPolicy(
      dynamicDecision.allocationById,
      compiledBrain,
      market.reserveAssetId,
      Object.fromEntries(
        Object.entries(market.assetEvidence).map(([id, evidence]) => [
          id,
          {
            tier: evidence.tier,
            coverageScoreBps: evidence.coverageScoreBps,
            liquidityScoreBps:
              market.eligibleAssetDirectory.find((asset) => asset.id === id)
                ?.liquidityScoreBps ?? null,
          },
        ]),
      ),
    );
    dynamicDecision.allocationById = policyResult.allocation;
    dynamicDecision.allocationPolicy = policyResult.policy;
  }
  const legacyDecision = dynamicMode
    ? null
    : await askAllocator(
        allocatorContext,
        legacyFallback,
        market.freshness.holdRequired
          ? market.freshness.reasons.join("; ")
          : undefined,
      );
  let allocationById = dynamicDecision?.allocationById ?? null;
  let rawAllocationById = dynamicDecision?.rawAllocationById ?? allocationById;
  let allocationPolicy = dynamicDecision?.allocationPolicy ?? null;
  let confidenceByAssetId = dynamicDecision?.confidenceByAssetId ?? {};
  let allocation: Record<string, number> = dynamicDecision
    ? Object.fromEntries(
        market.assetRecords
          .filter((asset) => asset.active)
          .map((asset) => [
            asset.symbol,
            dynamicDecision.allocationById[asset.id] ?? 0,
          ]),
      )
    : (legacyDecision?.allocation ?? legacyFallback);
  if (!dynamicMode && legacyDecision?.source === "ai") {
    const idBySymbol = new Map(
      market.assetRecords.map((asset) => [asset.symbol, asset.id]),
    );
    const symbolById = new Map(
      market.assetRecords.map((asset) => [asset.id, asset.symbol]),
    );
    const byId = Object.fromEntries(
      Object.entries(allocation).map(([symbol, weight]) => [
        idBySymbol.get(symbol) ?? symbol,
        weight,
      ]),
    );
    rawAllocationById = { ...byId };
    const policyResult = applyEvidenceAwareAllocationPolicy(
      byId,
      compiledBrain,
      market.reserveAssetId,
      Object.fromEntries(
        Object.entries(market.assetEvidence).map(([id, evidence]) => [
          id,
          {
            tier: evidence.tier,
            coverageScoreBps: evidence.coverageScoreBps,
            liquidityScoreBps:
              market.eligibleAssetDirectory.find((asset) => asset.id === id)
                ?.liquidityScoreBps ?? null,
          },
        ]),
      ),
    );
    allocationById = policyResult.allocation;
    allocationPolicy = policyResult.policy;
    confidenceByAssetId = Object.fromEntries(
      Object.entries(policyResult.allocation)
        .filter(([id, weight]) => id !== market.reserveAssetId && weight > 0)
        .map(([id]) => {
          const evidence = market.assetEvidence[id];
          return [
            id,
            {
              confidence:
                evidence?.tier === "complete"
                  ? ("medium" as const)
                  : ("low" as const),
              reasonCodes:
                evidence?.tier === "price_only"
                  ? (["low_evidence"] as AllocationConfidenceReasonV1[])
                  : ([] as AllocationConfidenceReasonV1[]),
            },
          ];
        }),
    );
    allocation = Object.fromEntries(
      Object.entries(policyResult.allocation).map(([id, weight]) => [
        symbolById.get(id) ?? id,
        weight,
      ]),
    );
  }
  const decision = {
    allocation,
    allocationById,
    rawAllocationById,
    brainPulse:
      dynamicDecision?.brainPulse ?? legacyDecision?.brainPulse ?? null,
    confidenceByAssetId,
    allocationPolicy,
    rationale:
      dynamicDecision?.rationale ??
      legacyDecision?.rationale ??
      "Deterministic hold.",
    source:
      dynamicDecision?.source ??
      legacyDecision?.source ??
      ("fallback" as const),
    rawOutput:
      dynamicDecision?.rawOutputs.join("\n\n") ??
      legacyDecision?.rawOutput ??
      "",
    promptHash:
      dynamicDecision?.promptHashes.at(-1) ??
      legacyDecision?.promptHash ??
      market.inputHash,
    promptHashes: dynamicDecision?.promptHashes ?? [
      legacyDecision?.promptHash ?? market.inputHash,
    ],
    researchResults: dynamicDecision?.researchResults ?? [],
    modelConfig: dynamicDecision?.modelConfig ??
      legacyDecision?.modelConfig ?? {
        provider: "none",
        model: "deterministic-hold",
        temperature: 0,
        maximumOutputTokens: 0,
        stateless: true as const,
      },
  };
  let hash: `0x${string}` | null = null;
  let receipt: Awaited<
    ReturnType<typeof waitForReliableTransactionReceipt>
  > | null = null;
  const proposedDriftBps = Math.max(
    0,
    ...Object.entries(decision.allocation).map(([symbol, weight]) =>
      Math.abs(weight - (state.currentWeightsBps[symbol] ?? 0)),
    ),
  );
  const cooldownUntil =
    (eligibilityState.lastTradeAtMs ?? 0) +
    compiledBrain.cooldownMinutes * 60_000;
  const executionGateReasons: string[] = [];
  if (proposedDriftBps < compiledBrain.minimumDriftBps)
    executionGateReasons.push(
      `Proposed drift ${proposedDriftBps} bps is below the ${compiledBrain.minimumDriftBps} bps threshold.`,
    );
  if (Date.now() < cooldownUntil)
    executionGateReasons.push("The selected trade cooldown is still active.");
  if (decision.source === "ai" && executionGateReasons.length === 0) {
    if (dynamicMode && networkConfig.mode === "testnet") {
      await collectOfficialMarketData();
      await syncLocalMarketPrices();
    }
    const cycleHash = keccak256(
      stringToHex(`${market.inputHash}:${decision.promptHash}`),
    );
    ({ hash, receipt } = await withAdminTransactionLock(async () => {
      if (dynamicMode && decision.allocationById) {
        const quote = await buildDexRebalancePlans(decision.allocationById);
        const transactionHash = await adminClient.writeContract({
          address: d.basket,
          abi: basketAbi,
          functionName: "rebalanceWithDexPlan",
          gas: networkConfig.mode === "testnet" ? 8_000_000n : undefined,
          args: [
            quote.targetAssets,
            quote.weights,
            cycleHash,
            reviveDexSwapPlans(quote.plans),
          ],
        });
        return {
          hash: transactionHash,
          receipt: await waitForReliableTransactionReceipt(transactionHash),
        };
      }
      const targets = [d.usdg, d.nvda, d.aapl, d.ethx];
      const weights = allowed.map((symbol) => decision.allocation[symbol]);
      const transactionHash = await adminClient.writeContract({
        address: d.basket,
        abi: basketAbi,
        functionName: "rebalance",
        args: [targets, weights, cycleHash],
      });
      return {
        hash: transactionHash,
        receipt: await waitForReliableTransactionReceipt(transactionHash),
      };
    }));
    eligibilityState.lastTradeAtMs = Date.now();
    saveEligibilityState(eligibilityState, {
      status: "trade_executed",
      inputHash: market.inputHash,
      transactionHash: hash,
      proposedDriftBps,
      cooldownMinutes: compiledBrain.cooldownMinutes,
    });
  }
  const stateAfter = await dashboard();
  await syncVaultLedger();
  const accountingAfter = await buildPortfolioAccounting(stateAfter);
  const block = receipt?.blockNumber ?? (await publicClient.getBlockNumber());
  const recordedSymbols = [
    ...new Set([
      ...Object.keys(state.holdings),
      ...Object.keys(stateAfter.holdings),
    ]),
  ];
  const tradeOutcomes = Object.fromEntries(
    recordedSymbols.map((symbol) => [
      symbol,
      {
        beforeUnitsWad: state.holdings[symbol] ?? "0",
        afterUnitsWad: stateAfter.holdings[symbol] ?? "0",
        deltaUnitsWad: (
          BigInt(stateAfter.holdings[symbol] ?? "0") -
          BigInt(state.holdings[symbol] ?? "0")
        ).toString(),
      },
    ]),
  );
  const reserveSymbol =
    d.assets?.find((asset) => asset.kind === "reserve")?.symbol ?? "USDG";
  const memeRecap = generateMemeRecap(
    brain,
    decision.allocation,
    decision.source === "ai" ? decision.brainPulse : null,
    state.pieces.map((piece) => ({
      pieceId: piece.id,
      personaPack: piece.personaPack,
    })),
    Boolean(hash),
  );
  const record = {
    schemaVersion: market.schemaVersion,
    at: new Date().toISOString(),
    allocation: decision.allocation,
    allocationById: decision.allocationById,
    rawAllocationById: decision.rawAllocationById,
    constrainedAllocationById: decision.allocationById,
    assetEvidence: market.assetEvidence,
    confidenceByAssetId: decision.confidenceByAssetId,
    allocationPolicy: decision.allocationPolicy,
    allocationWarnings: decision.allocationPolicy?.warnings ?? [],
    rationale: decision.rationale,
    source: decision.source,
    characterRosterVersion: CHARACTER_ROSTER_VERSION,
    memeRecap,
    txHash: hash,
    redemptionTxHash,
    block: block.toString(),
    executionStatus: hash ? "executed" : "held",
    eligibility,
    executionGate: {
      proposedDriftBps,
      minimumDriftBps: compiledBrain.minimumDriftBps,
      cooldownMinutes: compiledBrain.cooldownMinutes,
      reasons: executionGateReasons,
    },
    inputHash: market.inputHash,
    promptHash: decision.promptHash,
    promptHashes: decision.promptHashes,
    researchResults: decision.researchResults,
    modelConfig: decision.modelConfig,
    sourceManifest: market.sourceManifest,
    contextFreshness: market.freshness,
    decisionContext: market,
    portfolioBefore: market.portfolio,
    portfolioAfter: {
      observedAt: new Date().toISOString(),
      navUsdWad: stateAfter.nav,
      navPerShareWad: stateAfter.navPerShare,
      supplyWad: stateAfter.supply,
      reserveUsdWad: stateAfter.holdings[reserveSymbol] ?? "0",
      holdings: stateAfter.holdings,
      holdingValuesUsdWad: stateAfter.holdingValues,
      weightsBps: stateAfter.currentWeightsBps,
    },
    tradeOutcomes,
    brain: {
      catalogVersion: BRAIN_CATALOG_VERSION,
      controlCatalogVersion: 1,
      compiledBrain,
      activePieces: brain.filter((piece) => piece.active).length,
      inactivePieces: brain.filter((piece) => !piece.active).length,
      activeNonNeutralInstructions:
        allocatorContext.activeNonNeutralInstructions,
      tagPreferenceBps,
    },
    marketAsOf: market.generatedAt,
    accountingAfter,
  };
  const dir =
    process.env.MDB_STATE_DIR ??
    "/home/hendo420/projects/million-dollar-brain/var";
  mkdirSync(dir, { recursive: true });
  appendFileSync(`${dir}/cycles.jsonl`, `${JSON.stringify(record)}\n`);
  await persistCycle({
    inputHash: market.inputHash,
    promptHash: decision.promptHash,
    modelConfig: decision.modelConfig,
    rawOutput: decision.rawOutput,
    validatedAllocation: decision.allocation,
    decisionContext: market,
    portfolioAfter: record.portfolioAfter,
    txHash: hash ?? "",
    receipt: serializable(receipt ?? { status: "held", block }),
  });
  await persistAccountingSnapshot(accountingAfter, stateAfter.blockNumber);
  if (state.activation.controlBundlesEnabled) {
    eligibilityState.lastReviewAtMs = Date.now();
    saveEligibilityState(eligibilityState, {
      status: "review_completed",
      inputHash: market.inputHash,
      source: decision.source,
      executionStatus: record.executionStatus,
      transactionHash: hash,
    });
  }
  return record;
}
