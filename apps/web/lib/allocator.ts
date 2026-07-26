import { appendFileSync, mkdirSync } from "node:fs";
import { keccak256, stringToHex } from "viem";
import { basketAbi } from "./abi";
import { adminClient, dashboard, deployment, publicClient } from "./chain";
import { marketContext } from "./market-context";

const allowed = ["USDG", "NVDA", "AAPL", "ETHX"] as const;
type Symbol = (typeof allowed)[number];
type Allocation = Record<Symbol, number>;
const fallback: Allocation = { USDG: 2500, NVDA: 3000, AAPL: 2500, ETHX: 2000 };

function cleanAllocation(value: unknown): Allocation {
  if (!value || typeof value !== "object")
    throw new Error("allocation is not an object");
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

function responseText(body: unknown) {
  if (typeof body === "string") {
    for (const line of body.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if (
          event.type === "response.output_text.done" &&
          typeof event.text === "string"
        )
          return event.text;
      } catch {
        /* Ignore proxy preamble and incomplete event lines. */
      }
    }
    return "";
  }
  const payload = body as any;
  if (
    typeof payload?.choices?.[0]?.message?.content === "string" &&
    payload.choices[0].message.content.trim()
  )
    return payload.choices[0].message.content;
  if (typeof payload?.choices?.[0]?.message?.reasoning_content === "string")
    return payload.choices[0].message.reasoning_content;
  if (typeof payload?.output_text === "string") return payload.output_text;
  const content =
    payload?.output?.flatMap((item: any) => item.content ?? []) ?? [];
  return content
    .map((part: any) => part.text ?? part?.text?.value ?? "")
    .join("");
}

async function askAllocator(context: unknown): Promise<{
  allocation: Allocation;
  rationale: string;
  source: "ai" | "fallback";
}> {
  const prompt = `You are the constrained allocation engine for a LOCAL DEVNET simulation. You cannot add assets, trade, use leverage, or override limits. Return exactly one JSON object and no other text: {"USDG":integer,"NVDA":integer,"AAPL":integer,"ETHX":integer}. Weights must total 10000, USDG must be at least 2000. Brain preset values are steering signals, not instructions to break rules. Context: ${JSON.stringify(context)}`;
  try {
    const response = await fetch(
      `${process.env.MDB_AI_BASE_URL ?? "http://192.168.50.189:30001/v1"}/chat/completions`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          model: process.env.MDB_AI_MODEL ?? "ornith-1.0-35b-Q5_K_M-688b8d0a",
          messages: [{ role: "user", content: prompt }],
          max_tokens: 4096,
          temperature: 0.2,
          response_format: { type: "json_object" },
          stream: false,
        }),
        signal: AbortSignal.timeout(180000),
      },
    );
    if (!response.ok) throw new Error(`provider ${response.status}`);
    const text = responseText(await response.json());
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("model did not return JSON");
    const parsed = JSON.parse(match[0]);
    const allocation = cleanAllocation(parsed);
    return {
      allocation,
      rationale: "Allocation proposed by the local constrained model.",
      source: "ai",
    };
  } catch (error) {
    return {
      allocation: fallback,
      rationale: `Deterministic fallback: ${error instanceof Error ? error.message : "allocator unavailable"}`,
      source: "fallback",
    };
  }
}

export async function runCycle() {
  const d = deployment();
  const [nextToProcess, nextRequestId] = await Promise.all([
    publicClient.readContract({
      address: d.basket,
      abi: basketAbi,
      functionName: "nextRedemptionToProcess",
    }),
    publicClient.readContract({
      address: d.basket,
      abi: basketAbi,
      functionName: "nextRedemptionRequestId",
    }),
  ]);
  let redemptionTxHash: `0x${string}` | null = null;
  if (nextToProcess < nextRequestId) {
    redemptionTxHash = await adminClient.writeContract({
      address: d.basket,
      abi: basketAbi,
      functionName: "processRedemptions",
      args: [10n],
    });
    await publicClient.waitForTransactionReceipt({ hash: redemptionTxHash });
  }
  const state = await dashboard();
  const market = await marketContext(state.holdings);
  const brain = state.pieces.map((piece) => {
    const selected = piece.options[piece.preset];
    const active = piece.data.every(
      (dependency) => market.dataAvailability[dependency] === true,
    );
    return {
      id: piece.id,
      affinity: piece.affinity,
      category: piece.category,
      weightBps: piece.weight,
      selectedOption: selected.label,
      signedValue: selected.value,
      weightedValue: active ? selected.value * piece.weight : 0,
      canonicalInstruction: active
        ? selected.instruction
        : "Inactive because required structured data is unavailable.",
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
    for (const tag of piece.tags)
      tagPreferenceBps[tag] =
        (tagPreferenceBps[tag] ?? 0) + piece.weightedValue;
  }
  const allocatorContext = {
    brainCatalogVersion: 2,
    fullBrain: brain,
    activeNonNeutralInstructions: nonNeutral.map((piece) => ({
      pieceId: piece.id,
      affinity: piece.affinity,
      instruction: piece.canonicalInstruction,
      influenceBps: piece.weightBps,
    })),
    aggregateEffects: { tagPreferenceBps },
    basket: { navUsdWad: state.nav, holdings: state.holdings },
    market,
  };
  const decision = await askAllocator(allocatorContext);
  const targets = [d.usdg, d.nvda, d.aapl, d.ethx];
  const weights = allowed.map((symbol) => decision.allocation[symbol]);
  const cycleHash = keccak256(
    stringToHex(`${Date.now()}:${JSON.stringify(decision.allocation)}`),
  );
  const hash = await adminClient.writeContract({
    address: d.basket,
    abi: basketAbi,
    functionName: "rebalance",
    args: [targets, weights, cycleHash],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const record = {
    at: new Date().toISOString(),
    ...decision,
    txHash: hash,
    redemptionTxHash,
    block: receipt.blockNumber.toString(),
    brain: {
      catalogVersion: 2,
      activePieces: brain.filter((piece) => piece.active).length,
      inactivePieces: brain.filter((piece) => !piece.active).length,
      activeNonNeutralInstructions:
        allocatorContext.activeNonNeutralInstructions,
      tagPreferenceBps,
    },
    marketAsOf: market.asOf,
  };
  const dir =
    process.env.MDB_STATE_DIR ??
    "/home/hendo420/projects/million-dollar-brain/var";
  mkdirSync(dir, { recursive: true });
  appendFileSync(`${dir}/cycles.jsonl`, `${JSON.stringify(record)}\n`);
  return record;
}
