import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  contractBytecodeHashes,
  directoryHash,
  sha256,
} from "./lib/release-artifacts.mjs";
import {
  MAINNET_PRIORITY_SYMBOLS,
  MAINNET_TVL_CAP_USD_WAD,
  MAINNET_WATCHLIST_SYMBOLS,
  summarizeMainnetReadiness,
} from "./lib/mainnet-readiness.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const statePath =
  process.env.MDB_MAINNET_SHADOW_STATE ??
  resolve(repoRoot, "var/mainnet-shadow/state.json");
const stableOutput = resolve(
  repoRoot,
  "var/mainnet-readiness/mainnet-candidate-v5.json",
);
const run = (command, args, options = {}) =>
  execFileSync(command, args, {
    cwd: repoRoot,
    encoding: "utf8",
    ...options,
  }).trim();
const optionalJson = (...paths) => {
  const path = paths.find((candidate) => existsSync(candidate));
  return path ? JSON.parse(readFileSync(path, "utf8")) : null;
};
const allTrue = (value) =>
  value &&
  Object.values(value).length > 0 &&
  Object.values(value).every(Boolean);

const gitSha = run("git", ["rev-parse", "HEAD"]);
const sourceReleaseSha = process.env.MDB_RELEASE_SHA ?? gitSha;
if (sourceReleaseSha !== gitSha) {
  throw new Error(
    "The candidate must be built from the checked-out release SHA",
  );
}
const pushed = gitSha === run("git", ["rev-parse", "@{u}"]);
const clean = run("git", ["status", "--porcelain"]) === "";
const releaseDir = resolve(repoRoot, `var/releases/${sourceReleaseSha}`);
const state = JSON.parse(readFileSync(statePath, "utf8"));
if (state.schemaVersion !== 5 || state.chainId !== 4663) {
  throw new Error("DEX-native mainnet shadow schema v5 is required");
}
if (state.qualificationRuleVersion !== 4) {
  throw new Error("Qualification rule v4 evidence is required");
}
if (state.broadcastPermitted !== false) {
  throw new Error("Shadow evidence unexpectedly permits broadcast");
}
const shadowAgeMs = Date.now() - Date.parse(state.completedAt);
const shadowEvidenceFresh =
  Number.isFinite(shadowAgeMs) &&
  shadowAgeMs >= 0 &&
  shadowAgeMs <= 90 * 60_000;

const acceptance = optionalJson(
  resolve(releaseDir, "testnet-acceptance.json"),
  resolve(repoRoot, "var/testnet-readiness/v3-2h-acceptance.json"),
);
const fork = optionalJson(
  resolve(releaseDir, "mainnet-fork.json"),
  resolve(repoRoot, "var/mainnet-shadow/fork-deployment.json"),
);
const rpcFailover = optionalJson(
  resolve(releaseDir, "mainnet-rpc-failover.json"),
  resolve(repoRoot, "var/mainnet-readiness/mainnet-rpc-failover.json"),
);
const activationApprovals = optionalJson(
  resolve(releaseDir, "activation-approvals.json"),
);
const canaryEvidence = optionalJson(resolve(releaseDir, "mainnet-canary.json"));
const buildEvidence = optionalJson(resolve(releaseDir, "build.json"));

const acceptancePassed =
  acceptance?.gitSha === sourceReleaseSha &&
  acceptance?.durationHours >= 2 &&
  acceptance?.protocolFailures === 0 &&
  acceptance?.atomicBuys === true &&
  acceptance?.atomicSells === true &&
  acceptance?.autonomousCycles === true &&
  acceptance?.signed === true;
const forkChecks = fork?.checks ?? {};
const forkPassed =
  fork?.schemaVersion === 5 &&
  fork?.chainId === 4663 &&
  fork?.gitSha === sourceReleaseSha &&
  fork?.canonicalAssets === true &&
  fork?.activationState === "paused-canary" &&
  fork?.signed === true &&
  allTrue(forkChecks);
const rpcFailoverPassed =
  rpcFailover?.schemaVersion === 1 &&
  rpcFailover?.gitSha === sourceReleaseSha &&
  rpcFailover?.chainId === 4663 &&
  rpcFailover?.health?.status === "ok" &&
  rpcFailover?.health?.primary?.chainId === 4663 &&
  rpcFailover?.health?.secondary?.chainId === 4663 &&
  allTrue(rpcFailover?.failureModeTests);

const preliminarySymbols = state.deploymentReadiness?.preliminarySymbols ?? [];
const preliminaryRiskAssets = preliminarySymbols
  .map((symbol) => state.assets.find((asset) => asset.symbol === symbol))
  .filter(Boolean)
  .sort((left, right) =>
    left.address.toLowerCase().localeCompare(right.address.toLowerCase()),
  )
  .map((asset, index) => ({ ...asset, registryAssetId: index + 2 }));
const preliminarySet = new Set(preliminarySymbols);
const activationReadiness = summarizeMainnetReadiness(
  state.qualification.filter((asset) => preliminarySet.has(asset.symbol)),
);
const launchWitnessSymbols = activationReadiness.includedSymbols;
const reserve = state.assets.find((asset) => asset.symbol === "USDG");
const activatedSymbols = reserve ? ["USDG"] : [];
const candidateAssets = [
  reserve ? { ...reserve, registryAssetId: 1 } : null,
  ...preliminaryRiskAssets,
].filter(Boolean);
const registryAssetIds = Object.fromEntries(
  candidateAssets.map((asset) => [asset.symbol, asset.registryAssetId]),
);
const qualificationProgress = Object.fromEntries(
  preliminarySymbols.map((symbol) => {
    const row = state.qualification.find((asset) => asset.symbol === symbol);
    return [
      symbol,
      {
        qualificationHours: row?.qualificationHours ?? 0,
        regularMarketSessions: row?.regularMarketSessions ?? 0,
        qualificationWindowPassed: row?.qualificationWindowPassed === true,
        qualificationStartedAt: row?.qualificationStartedAt ?? null,
        latestSuccessfulCheckAt: row?.latestSuccessfulCheckAt ?? null,
        resetReason: row?.resetReason ?? null,
        evidenceHash: row?.evidenceHash ?? null,
      },
    ];
  }),
);
const assetPolicy = Object.fromEntries(
  preliminarySymbols.map((symbol) => {
    const row = state.qualification.find((asset) => asset.symbol === symbol);
    return [
      symbol,
      {
        registryAssetId: registryAssetIds[symbol],
        kind: row?.kind?.toUpperCase() ?? "TOKEN",
        riskClass: row?.riskClass?.toUpperCase() ?? "HIGH_VOLATILITY",
        maximumWeightBps: row?.maximumWeightBps ?? 2_000,
        safeTwoSidedCapacityUsdWad: row?.safeTwoSidedCapacityUsdWad ?? "0",
        maximumExposureUsdWad: row?.maximumExposureUsdWad ?? "0",
        creatorApproved: false,
        creatorCapUsdWad: row?.maximumExposureUsdWad ?? "0",
        active: false,
        qualificationEvidenceHash: row?.evidenceHash ?? null,
      },
    ];
  }),
);
const venueMappings = Object.fromEntries(
  state.capacityEvidence
    .filter((evidence) => preliminarySet.has(evidence.symbol))
    .map((evidence) => {
      const selected = [...evidence.probes]
        .reverse()
        .find((probe) => probe.passed);
      const buyPools = selected?.buy?.pools ?? [];
      const directPool = buyPools.at(-1) ?? null;
      const bridgePool = buyPools.length > 1 ? buyPools[0] : null;
      return [
        evidence.symbol,
        {
          factory: selected?.buy?.factory ?? null,
          router: selected?.buy?.router ?? null,
          quoter: selected?.buy?.quoter ?? null,
          directPool: directPool?.address ?? null,
          bridgePool: bridgePool?.address ?? null,
          minimumDirectLiquidity: directPool?.harmonicMeanLiquidity ?? "0",
          minimumBridgeLiquidity: bridgePool?.harmonicMeanLiquidity ?? "0",
          buyPools,
          sellPools: selected?.sell?.pools ?? [],
          shortTwapSeconds: 1_800,
          longTwapSeconds: 14_400,
          safeTwoSidedCapacityUsdWad: evidence.safeTwoSidedCapacityUsdWad,
          buyEvidenceHash: selected?.buy?.sourceHash ?? null,
          sellEvidenceHash: selected?.sell?.sourceHash ?? null,
        },
      ];
    }),
);
const operatorAddress =
  process.env.MDB_DEPLOYER_ADDRESS ??
  (existsSync("/etc/mdb/keys/mainnet-operator.address")
    ? readFileSync("/etc/mdb/keys/mainnet-operator.address", "utf8").trim()
    : null);
const buildExists = existsSync(resolve(repoRoot, "apps/web/.next/BUILD_ID"));
const signingKeystore =
  process.env.MDB_RELEASE_SIGNER_KEYSTORE ??
  "/etc/mdb/keys/mainnet-operator.json";
const signingPassword =
  process.env.MDB_RELEASE_SIGNER_PASSWORD_FILE ??
  "/etc/mdb/keys/mainnet-operator.password";
const signerConfigured =
  existsSync(signingKeystore) && existsSync(signingPassword);
const currentBytecodeHashes = contractBytecodeHashes(repoRoot);
const currentWebBuildHash = buildExists
  ? directoryHash(resolve(repoRoot, "apps/web/.next"))
  : null;
const exactBuildEvidencePassed =
  buildEvidence?.schemaVersion === 1 &&
  buildEvidence?.gitSha === sourceReleaseSha &&
  buildEvidence?.signed === true &&
  buildEvidence?.webBuildHash === currentWebBuildHash &&
  JSON.stringify(buildEvidence?.contractBytecodeHashes) ===
    JSON.stringify(currentBytecodeHashes);
const mainnetManifestPath = resolve(
  repoRoot,
  "packages/contracts/deployments/mainnet-v5.json",
);
const mainnetManifest = optionalJson(mainnetManifestPath);
const noUnexpectedMainnetManifest =
  !mainnetManifest ||
  (mainnetManifest.schemaVersion === 5 &&
    mainnetManifest.gitSha === sourceReleaseSha &&
    mainnetManifest.activationState === "paused-canary" &&
    mainnetManifest.activatedRiskAssetCount === 0 &&
    mainnetManifest.buysEnabled === false &&
    mainnetManifest.sellsEnabled === false &&
    mainnetManifest.rebalancesEnabled === false &&
    mainnetManifest.brainPurchasesEnabled === false);
const deploymentGates = {
  clean,
  pushed,
  shadowInspectionPassed: state.readyToBuildCandidate === true,
  shadowEvidenceFresh,
  preliminaryUniverseReady:
    state.deploymentReadiness?.pausedShadowReady === true,
  exactCommitAcceptancePassed: acceptancePassed,
  forkRehearsalPassed: forkPassed,
  rpcFailoverPassed,
  riskAuthorityConfigured: Boolean(operatorAddress),
  releaseSignerConfigured: signerConfigured,
  exactBuildEvidencePassed,
  noUnexpectedMainnetManifest,
};
const externalActivationApprovalsPassed =
  activationApprovals?.schemaVersion === 1 &&
  activationApprovals?.gitSha === sourceReleaseSha &&
  activationApprovals?.signed === true &&
  allTrue(activationApprovals?.gates);
const canaryVerified =
  canaryEvidence?.schemaVersion === 1 &&
  canaryEvidence?.gitSha === sourceReleaseSha &&
  canaryEvidence?.activationState === "paused-canary" &&
  canaryEvidence?.signed === true &&
  allTrue(canaryEvidence?.checks);
const activationGates = {
  pausedDeploymentReady: allTrue(deploymentGates),
  qualificationWindowPassed: activationReadiness.coreQualificationPassed,
  launchWitnessValid:
    launchWitnessSymbols.length >= 4 &&
    launchWitnessSymbols.length <= 9 &&
    activationReadiness.aggregateRiskCapacityBps >= 8_000,
  externalApprovalsPassed: externalActivationApprovalsPassed,
  pausedCanaryVerified: canaryVerified,
};

const payload = {
  schemaVersion: 2,
  manifestSchemaVersion: 5,
  environment: "robinhood-mainnet-candidate",
  chainId: 4663,
  gitSha: sourceReleaseSha,
  createdAt: new Date().toISOString(),
  broadcastPermitted: false,
  activationState: "paused-canary",
  canonicalAssets: true,
  prioritySymbols: [...MAINNET_PRIORITY_SYMBOLS],
  watchlistSymbols: [...MAINNET_WATCHLIST_SYMBOLS],
  preliminarySymbols,
  launchWitnessSymbols,
  activatedSymbols,
  includedSymbols: preliminarySymbols,
  tvlCapUsdWad: MAINNET_TVL_CAP_USD_WAD.toString(),
  reserveSymbol: "USDG",
  nativeEthEntryEnabled: false,
  assets: candidateAssets,
  registryAssetIds,
  qualificationProgress,
  assetPolicy,
  creatorRiskPolicy: {
    initialAuthority: operatorAddress,
    role: "RISK_ADMIN_ROLE",
    increaseDelaySeconds: 172_800,
    reductionsImmediate: true,
    twoStepAuthorityTransfer: true,
    initialApprovedSymbols: ["USDG"],
    launchWitnessAssetIds: launchWitnessSymbols.map(
      (symbol) =>
        `4663:${preliminaryRiskAssets
          .find((asset) => asset.symbol === symbol)
          ?.address.toLowerCase()}`,
    ),
  },
  venueMappings,
  qualificationEvidenceHash: state.sourceHash,
  bytecodeHashes: currentBytecodeHashes,
  webBuildId: buildExists
    ? readFileSync(resolve(repoRoot, "apps/web/.next/BUILD_ID"), "utf8").trim()
    : null,
  webBuildHash: currentWebBuildHash,
  operatorAddress,
  executionAuthority: "self-hosted-uniswap-structured-routes",
  deploymentGates,
  activationGates,
  pausedDeploymentReady: allTrue(deploymentGates),
  activationReady: allTrue(activationGates),
  acceptanceHash: acceptance ? sha256(JSON.stringify(acceptance)) : null,
  forkHash: fork ? sha256(JSON.stringify(fork)) : null,
  rpcFailoverHash: rpcFailover ? sha256(JSON.stringify(rpcFailover)) : null,
  activationApprovalsHash: activationApprovals
    ? sha256(JSON.stringify(activationApprovals))
    : null,
  canaryEvidenceHash: canaryEvidence
    ? sha256(JSON.stringify(canaryEvidence))
    : null,
  buildEvidenceHash: buildEvidence
    ? sha256(JSON.stringify(buildEvidence))
    : null,
};
payload.readyToBroadcast = false;
payload.reportHash = sha256(JSON.stringify(payload));

let signature = null;
if (signerConfigured) {
  signature = run("cast", [
    "wallet",
    "sign",
    "--keystore",
    signingKeystore,
    "--password-file",
    signingPassword,
    `0x${payload.reportHash}`,
  ]);
}
const report = {
  ...payload,
  signature: signature || null,
  signed: Boolean(signature),
};
report.pausedDeploymentReady = report.pausedDeploymentReady && report.signed;
report.activationGates.pausedDeploymentReady = report.pausedDeploymentReady;
report.activationReady =
  report.pausedDeploymentReady && allTrue(report.activationGates);

const shaOutput = resolve(releaseDir, "mainnet-candidate-v5.json");
for (const output of [stableOutput, shaOutput]) {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o640,
  });
}
console.log(stableOutput);
