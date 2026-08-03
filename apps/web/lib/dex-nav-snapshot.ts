import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { parseAbi } from "viem";
import { dashboard, deployment, deploymentAssets, publicClient } from "./chain";
import { DATA_AVAILABILITY } from "./market-context";
import {
  latestMarketFeatures,
  marketDataHealth,
  REFERENCE_UNIVERSE,
} from "./market-history";
import { localPriceSyncHealth } from "./market-price-sync";
import { persistDexNavSnapshot } from "./persistence";
import { buildPortfolioAccounting } from "./portfolio-accounting";
import { releaseStatus } from "./release-status";
import { rpcFailoverHealth } from "./rpc-health";
import { readCycleHistory } from "./status-history";
import { deriveSnapshotState } from "./dex-snapshot-state";

export type DexSnapshotState = "live" | "stale" | "degraded" | "unavailable";

export type DexNavSnapshotV1 = {
  schemaVersion: 1;
  observedAt: string;
  blockNumber: string;
  chainTimestamp: number;
  lastSuccessfulAt: string;
  state: DexSnapshotState;
  reasonCodes: string[];
  releaseSha: string;
  snapshotHash: string;
  data: Record<string, unknown>;
};

export type DexSnapshotStatusResponse = Record<string, unknown> & {
  dexSnapshot: Omit<DexNavSnapshotV1, "data">;
};

type SnapshotAttemptV1 = {
  schemaVersion: 1;
  attemptedAt: string;
  succeeded: boolean;
  error: string | null;
};

const quoteEvidenceAbi = parseAbi([
  "function quoteEvidence(address token) view returns (uint256 priceWad,uint256 computedAt,uint256 lastPoolActivityAt,bool activityFresh,bool valid)",
]);

const stateDirectory =
  process.env.MDB_STATE_DIR ??
  "/home/hendo420/projects/million-dollar-brain/var";
const snapshotFile = `${stateDirectory}/dex-nav-snapshot-v1.json`;
const attemptFile = `${stateDirectory}/dex-nav-snapshot-attempt-v1.json`;
const staleAfterSeconds = Number(
  process.env.MDB_DEX_SNAPSHOT_STALE_SECONDS ?? "45",
);

function atomicWrite(file: string, value: unknown) {
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(value)}\n`, { mode: 0o600 });
  renameSync(temporary, file);
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

async function dexEvidence() {
  const d = deployment();
  const assets = deploymentAssets(d).filter((asset) => asset.active !== false);
  return Object.fromEntries(
    await Promise.all(
      assets.map(async (asset) => {
        if (asset.kind === "reserve") {
          const now = Math.floor(Date.now() / 1_000);
          return [
            asset.symbol,
            {
              priceUsdWad: "1000000000000000000",
              computedAt: now,
              lastPoolActivityAt: now,
              activityFresh: true,
              valid: true,
            },
          ] as const;
        }
        try {
          const result = await publicClient.readContract({
            address: d.dexValuationAdapter!,
            abi: quoteEvidenceAbi,
            functionName: "quoteEvidence",
            args: [asset.address],
          });
          return [
            asset.symbol,
            {
              priceUsdWad: result[0].toString(),
              computedAt: Number(result[1]),
              lastPoolActivityAt: Number(result[2]),
              activityFresh: result[3],
              valid: result[4],
            },
          ] as const;
        } catch (error) {
          return [
            asset.symbol,
            {
              priceUsdWad: "0",
              computedAt: 0,
              lastPoolActivityAt: 0,
              activityFresh: false,
              valid: false,
              error:
                error instanceof Error
                  ? error.message
                  : "quote evidence unavailable",
            },
          ] as const;
        }
      }),
    ),
  );
}

async function buildPublicStatus() {
  const history = readCycleHistory(50);
  const [current, marketData, features, priceSync, rpcHealth, evidence] =
    await Promise.all([
      dashboard(),
      marketDataHealth(),
      latestMarketFeatures(),
      localPriceSyncHealth(),
      rpcFailoverHealth(),
      dexEvidence(),
    ]);
  const portfolioAccounting = await buildPortfolioAccounting(current);
  const latestPrice = BigInt(current.navPerShare);
  const cutoff = Date.now() - 24 * 60 * 60 * 1_000;
  const prior = history.find(
    (cycle) =>
      Date.parse(cycle.at) <= cutoff &&
      typeof cycle?.portfolioAfter?.navPerShareWad === "string",
  );
  const priorPrice = prior ? BigInt(prior.portfolioAfter.navPerShareWad) : null;
  const navChange24hBps =
    priorPrice && priorPrice > 0n
      ? Number(((latestPrice - priorPrice) * 10_000n) / priorPrice)
      : null;
  return {
    ...current,
    shares: "0",
    walletUsdg: "0",
    redemption: { pendingRequestId: "0" },
    rewards: { pending: "0" },
    release: releaseStatus(current.activation),
    navChange24hBps,
    dataAvailability:
      history[0]?.decisionContext?.dataAvailability ?? DATA_AVAILABILITY,
    marketData,
    marketFeatures: features,
    portfolioAccounting,
    performanceHistory: [],
    priceSync,
    rpcHealth,
    rpcFailover: rpcHealth,
    dexEvidence: evidence,
    benchmarks: REFERENCE_UNIVERSE.map((symbol) => ({
      symbol,
      executable: false,
      features: features[symbol] ?? null,
    })),
    latestOutcome: history[0]?.decisionContext?.decisionOutcomes ?? null,
    latestCycle: history[0] ?? null,
    cycleHistory: [],
  };
}

export async function refreshDexNavSnapshot(): Promise<DexNavSnapshotV1> {
  const attemptedAt = new Date().toISOString();
  try {
    const data = await buildPublicStatus();
    const observedAt = new Date().toISOString();
    const unsigned = {
      schemaVersion: 1 as const,
      observedAt,
      blockNumber: String(data.blockNumber),
      chainTimestamp: Number(data.oracle.chainTimestamp),
      lastSuccessfulAt: observedAt,
      state: "live" as const,
      reasonCodes: [] as string[],
      releaseSha: process.env.MDB_RELEASE_SHA ?? "unrecorded",
      data,
    };
    const snapshotHash = `0x${createHash("sha256")
      .update(JSON.stringify(unsigned))
      .digest("hex")}`;
    const snapshot = { ...unsigned, snapshotHash };
    atomicWrite(snapshotFile, snapshot);
    atomicWrite(attemptFile, {
      schemaVersion: 1,
      attemptedAt,
      succeeded: true,
      error: null,
    } satisfies SnapshotAttemptV1);
    await persistDexNavSnapshot({
      snapshotHash,
      observedAt,
      blockNumber: snapshot.blockNumber,
      state: snapshot.state,
      snapshot,
      releaseSha: snapshot.releaseSha,
    }).catch(() => null);
    return snapshot;
  } catch (error) {
    atomicWrite(attemptFile, {
      schemaVersion: 1,
      attemptedAt,
      succeeded: false,
      error: error instanceof Error ? error.message : "snapshot refresh failed",
    } satisfies SnapshotAttemptV1);
    throw error;
  }
}

export function loadDexNavSnapshot(): DexNavSnapshotV1 | null {
  const snapshot = readJson<DexNavSnapshotV1>(snapshotFile);
  if (!snapshot) return null;
  const attempt = readJson<SnapshotAttemptV1>(attemptFile);
  const { state, reasonCodes } = deriveSnapshotState({
    observedAt: snapshot.observedAt,
    now: Date.now(),
    staleAfterSeconds,
    attempt,
  });
  return { ...snapshot, state, reasonCodes };
}

export function snapshotStatusResponse(): DexSnapshotStatusResponse | null {
  const snapshot = loadDexNavSnapshot();
  if (!snapshot) return null;
  return {
    ...snapshot.data,
    dexSnapshot: {
      schemaVersion: snapshot.schemaVersion,
      observedAt: snapshot.observedAt,
      blockNumber: snapshot.blockNumber,
      chainTimestamp: snapshot.chainTimestamp,
      lastSuccessfulAt: snapshot.lastSuccessfulAt,
      state: snapshot.state,
      reasonCodes: snapshot.reasonCodes,
      releaseSha: snapshot.releaseSha,
      snapshotHash: snapshot.snapshotHash,
    },
  };
}
