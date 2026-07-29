import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { networkConfig, type MdbNetworkMode } from "./network";

export type CanaryActivationStateV1 = {
  schemaVersion: 1;
  stage:
    | "development"
    | "testnet"
    | "paused-canary"
    | "user-actions"
    | "automation"
    | "emergency";
  buysEnabled: boolean;
  sellsEnabled: boolean;
  rebalancesEnabled: boolean;
  brainPurchasesEnabled: boolean;
};

export type AssetQualificationWindowV2 = {
  schemaVersion: 2;
  requiredHours: 48;
  requiresTwoMarketSessions: true;
  qualifiedAssets: number;
  candidateAssets: number;
  passed: boolean;
  observedAt: string | null;
};

export type EnvironmentEvidenceV1 = {
  schemaVersion: 1;
  environment: MdbNetworkMode;
  releaseSha: string;
  manifestHash: string | null;
  databaseSchema: 5;
};

export type ReleaseCandidateV1 = EnvironmentEvidenceV1 & {
  createdAt: string;
  webBuildHash: string;
  contractBytecodeHashes: Record<string, string>;
  sourceEnvironmentAcceptance: string | null;
};

export type PromotionReceiptV1 = {
  schemaVersion: 1;
  from: MdbNetworkMode;
  to: MdbNetworkMode;
  gitSha: string;
  releaseCandidateHash: string;
  promotedAt: string;
  broadcast: false;
};

export type AssetQualificationEvidenceV3 = {
  schemaVersion: 3;
  symbol: string;
  required: boolean;
  included: boolean;
  qualificationWindowPassed: boolean;
  qualificationStartedAt: string | null;
  latestSuccessfulCheckAt: string | null;
  resetReason: string | null;
  regularMarketSessions: string[];
  feedState: Record<string, unknown> | null;
  liquidityEvidence: Record<string, unknown> | null;
  evidenceHash: string;
};

export type MainnetReadinessV1 = {
  schemaVersion: 1;
  ready: boolean;
  requiredSymbols: readonly ["AAPL", "NVDA", "SPY", "WETH"];
  optionalSymbols: readonly ["MSFT", "QQQ", "SOXX"];
  qualifiedLaunchSet: string[];
  missingRequired: string[];
  observedAt: string;
};

export type MainnetCandidateManifestV1 = {
  schemaVersion: 1;
  chainId: 4663;
  gitSha: string;
  createdAt: string;
  broadcastPermitted: false;
  activationState: "paused-canary";
  readyToBroadcast: boolean;
  signed: boolean;
  qualifiedLaunchSet: string[];
  candidateManifestHash: string;
  evidence: Record<string, boolean>;
};

type ActivationInput = Omit<CanaryActivationStateV1, "schemaVersion" | "stage">;

function fileHash(path: string) {
  if (!existsSync(path)) return null;
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function activationStage(
  mode: MdbNetworkMode,
  activation: ActivationInput,
): CanaryActivationStateV1["stage"] {
  if (mode === "local") return "development";
  if (mode === "testnet") return "testnet";
  if (
    !activation.buysEnabled &&
    !activation.sellsEnabled &&
    !activation.rebalancesEnabled &&
    !activation.brainPurchasesEnabled
  )
    return "paused-canary";
  if (
    activation.buysEnabled &&
    activation.sellsEnabled &&
    !activation.rebalancesEnabled
  )
    return "user-actions";
  if (
    activation.buysEnabled &&
    activation.sellsEnabled &&
    activation.rebalancesEnabled &&
    activation.brainPurchasesEnabled
  )
    return "automation";
  return "emergency";
}

function qualification(): AssetQualificationWindowV2 | null {
  const path =
    process.env.MDB_MAINNET_SHADOW_STATE ??
    "/home/hendo420/projects/million-dollar-brain/var/mainnet-shadow/state.json";
  if (!existsSync(path)) return null;
  try {
    const state = JSON.parse(readFileSync(path, "utf8"));
    const rows = Array.isArray(state.qualification) ? state.qualification : [];
    return {
      schemaVersion: 2,
      requiredHours: 48,
      requiresTwoMarketSessions: true,
      qualifiedAssets: rows.filter(
        (row: { qualificationWindowPassed?: boolean }) =>
          row.qualificationWindowPassed,
      ).length,
      candidateAssets: rows.length,
      passed:
        state.readiness?.ready === true ||
        state.gates?.qualificationWindowPassed === true,
      observedAt: state.at ?? null,
    };
  } catch {
    return null;
  }
}

export function releaseStatus(activation: ActivationInput) {
  const releaseSha = process.env.MDB_RELEASE_SHA ?? "unrecorded";
  return {
    environment: networkConfig.mode,
    releaseSha,
    deploymentManifestHash: fileHash(networkConfig.deploymentFile),
    activation: {
      schemaVersion: 1 as const,
      stage: activationStage(networkConfig.mode, activation),
      ...activation,
    },
    qualification: qualification(),
    executionEnabled:
      activation.buysEnabled ||
      activation.sellsEnabled ||
      activation.rebalancesEnabled ||
      activation.brainPurchasesEnabled,
  };
}
