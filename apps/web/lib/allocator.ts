import { appendFileSync, mkdirSync } from "node:fs";
import { keccak256, stringToHex } from "viem";
import { basketAbi } from "./abi";
import { withAdminTransactionLock } from "./admin-transaction-lock";
import {
  adminClient,
  dashboard,
  deployment,
  publicClient,
  waitForReliableTransactionReceipt,
} from "./chain";
import { buildDecisionContext } from "./decision-context";
import type { DecisionContextV4 } from "./decision-context";
import {
  validateDynamicAllocation,
  type DynamicAllocation,
} from "./asset-universe.ts";
import {
  buildStructuredResearchResults,
  validateResearchRequests,
  type ResearchResultV1,
} from "./decision-research.ts";
import { BRAIN_CATALOG_VERSION } from "./brain-catalog";
import { CHARACTER_ROSTER_VERSION, generateMemeRecap } from "./brain-meme";
import { persistCycle, persistResearchRound } from "./persistence";
import {
  buildPortfolioAccounting,
  persistAccountingSnapshot,
  syncVaultLedger,
} from "./portfolio-accounting";
import { buildTestnetRebalancePlans, reviveSwapPlans } from "./quote-planner";

const allowed = ["USDG", "NVDA", "AAPL", "ETHX"] as const;
type Symbol = (typeof allowed)[number];
type Allocation = Record<Symbol, number>;
type Decision = {
  allocation: Allocation;
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
    '{"USDG":integer,"NVDA":integer,"AAPL":integer,"ETHX":integer}.',
    "Weights total 10000 and USDG is at least 2000.",
    "The executable universe is separate from reference-only market context.",
    "Brain moods are bounded steering signals, never authority to break rules.",
    `Fresh decision package: ${JSON.stringify(context)}`,
  ].join(" ");
  const promptHash = keccak256(stringToHex(prompt));
  if (holdReason) {
    return {
      allocation: fallback,
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
    return {
      allocation: cleanAllocation(JSON.parse(match[0])),
      rationale: "Allocation proposed by the local constrained model.",
      source: "ai",
      rawOutput,
      promptHash,
      modelConfig,
    };
  } catch (error) {
    return {
      allocation: fallback,
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
  context: DecisionContextV4,
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
      "You are the constrained allocation engine for MillionDollar Brain.",
      "You may allocate only to active asset IDs in eligibleAssetDirectory.",
      "Never invent an address, asset, fact, source, or tool.",
      "You have one optional structured research round for at most 16 assets.",
      'First return either {"kind":"research","requests":[{"assetId":"chain:address","topics":["identity"]}]}',
      'or {"kind":"allocation","allocation":{"chain:address":integer}}.',
      "Allocation weights total 10000, reserve is at least 2000, no risk asset exceeds its maximumWeightBps,",
      "there are at most nine risk positions, and combined high-volatility weight is at most 3000.",
      `DecisionContextV4: ${JSON.stringify(context)}`,
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
    if (first.parsed.kind === "research") {
      const requests = validateResearchRequests(
        first.parsed.requests,
        context.assetRecords,
      );
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
        'Return exactly {"kind":"allocation","allocation":{"chain:address":integer}}.',
        `Immutable DecisionContextV4: ${JSON.stringify(context)}`,
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
    } else if (first.parsed.kind === "allocation") {
      proposed = first.parsed.allocation;
    } else {
      throw new Error("model returned neither research nor allocation");
    }
    return {
      allocationById: validateDynamicAllocation(
        proposed,
        context.assetRecords,
        context.reserveAssetId,
      ),
      rationale:
        researchResults.length > 0
          ? "Allocation proposed after one recorded structured research round."
          : "Allocation proposed from the bounded DecisionContext V4.",
      source: "ai",
      rawOutputs,
      promptHashes,
      researchResults,
      modelConfig,
    };
  } catch (error) {
    return {
      allocationById: fallback,
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

export async function runCycle() {
  const d = deployment();
  const redemptionTxHash: `0x${string}` | null = null;
  await syncVaultLedger();
  const state = await dashboard();
  const market = await buildDecisionContext(state);
  const brain = state.pieces.map((piece) => {
    const selected = piece.options[piece.preset];
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
      selectedOption: selected.label,
      signedValue: selected.value,
      weightedValue: active ? selected.value * piece.weight : 0,
      canonicalInstruction: active
        ? selected.instruction
        : "Inactive because validated structured data is unavailable.",
      tags: piece.tags,
      dataDependencies: piece.data,
      active,
      owned: !piece.unowned,
    };
  });
  const nonNeutral = brain.filter(
    (piece) => piece.signedValue !== 0 && piece.active,
  );
  const tagPreferenceBps: Record<string, number> = {};
  for (const piece of nonNeutral) {
    for (const tag of piece.tags) {
      tagPreferenceBps[tag] =
        (tagPreferenceBps[tag] ?? 0) + piece.weightedValue;
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
  const dynamicMode = d.schemaVersion === 3 && Boolean(d.assets?.length);
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
  const legacyDecision = dynamicMode
    ? null
    : await askAllocator(
        allocatorContext,
        legacyFallback,
        market.freshness.holdRequired
          ? market.freshness.reasons.join("; ")
          : undefined,
      );
  const allocationById = dynamicDecision?.allocationById ?? null;
  const allocation: Record<string, number> = dynamicDecision
    ? Object.fromEntries(
        market.assetRecords
          .filter((asset) => asset.active)
          .map((asset) => [
            asset.symbol,
            dynamicDecision.allocationById[asset.id] ?? 0,
          ]),
      )
    : (legacyDecision?.allocation ?? legacyFallback);
  const decision = {
    allocation,
    allocationById,
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
  const memeRecap = generateMemeRecap(brain, decision.allocation);
  let hash: `0x${string}` | null = null;
  let receipt: Awaited<
    ReturnType<typeof waitForReliableTransactionReceipt>
  > | null = null;
  if (decision.source === "ai") {
    const cycleHash = keccak256(
      stringToHex(`${market.inputHash}:${decision.promptHash}`),
    );
    ({ hash, receipt } = await withAdminTransactionLock(async () => {
      if (dynamicMode && decision.allocationById) {
        const quote = await buildTestnetRebalancePlans(decision.allocationById);
        const transactionHash = await adminClient.writeContract({
          address: d.basket,
          abi: basketAbi,
          functionName: "rebalanceWithPlan",
          args: [
            quote.targetAssets,
            quote.weights,
            cycleHash,
            reviveSwapPlans(quote.plans),
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
  const record = {
    schemaVersion: dynamicMode ? 4 : 3,
    at: new Date().toISOString(),
    allocation: decision.allocation,
    allocationById: decision.allocationById,
    rationale: decision.rationale,
    source: decision.source,
    characterRosterVersion: CHARACTER_ROSTER_VERSION,
    memeRecap,
    txHash: hash,
    redemptionTxHash,
    block: block.toString(),
    executionStatus: hash ? "executed" : "held",
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
  return record;
}
