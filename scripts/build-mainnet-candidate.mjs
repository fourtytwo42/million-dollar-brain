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
const optionalJson = (path) =>
  existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : null;

const gitSha = run("git", ["rev-parse", "HEAD"]);
const pushed = gitSha === run("git", ["rev-parse", "@{u}"]);
const clean = run("git", ["status", "--porcelain"]) === "";
const state = JSON.parse(readFileSync(statePath, "utf8"));
if (state.schemaVersion !== 5 || state.chainId !== 4663)
  throw new Error("DEX-native mainnet shadow schema v5 is required");
if (state.broadcastPermitted !== false)
  throw new Error("Shadow evidence unexpectedly permits broadcast");

const acceptancePath = resolve(
  repoRoot,
  "var/testnet-readiness/v3-2h-acceptance.json",
);
const forkPath = resolve(repoRoot, "var/mainnet-shadow/fork-deployment.json");
const acceptance = optionalJson(acceptancePath);
const fork = optionalJson(forkPath);
const acceptancePassed =
  acceptance?.gitSha === gitSha &&
  acceptance?.durationHours >= 2 &&
  acceptance?.protocolFailures === 0 &&
  acceptance?.atomicBuys === true &&
  acceptance?.atomicSells === true &&
  acceptance?.autonomousCycles === true;
const forkPassed =
  fork?.schemaVersion === 5 &&
  fork?.chainId === 4663 &&
  fork?.canonicalAssets === true &&
  fork?.activationState === "paused-canary";

const includedSymbols = state.readiness?.includedSymbols ?? [];
const includedRiskAssets = includedSymbols
  .map((symbol) => state.assets.find((asset) => asset.symbol === symbol))
  .filter(Boolean)
  .sort((left, right) =>
    left.address.toLowerCase().localeCompare(right.address.toLowerCase()),
  )
  .map((asset, index) => ({ ...asset, registryAssetId: index + 2 }));
const candidateAssets = [
  {
    ...state.assets.find((asset) => asset.symbol === "USDG"),
    registryAssetId: 1,
  },
  ...includedRiskAssets,
].filter((asset) => asset.address);
const registryAssetIds = Object.fromEntries(
  candidateAssets.map((asset) => [asset.symbol, asset.registryAssetId]),
);
const assetPolicy = Object.fromEntries(
  includedSymbols.map((symbol) => [
    symbol,
    {
      registryAssetId: registryAssetIds[symbol],
      kind:
        state.qualification
          .find((row) => row.symbol === symbol)
          ?.kind?.toUpperCase() ?? "TOKEN",
      riskClass:
        state.qualification
          .find((row) => row.symbol === symbol)
          ?.riskClass?.toUpperCase() ?? "HIGH_VOLATILITY",
      maximumWeightBps:
        state.qualification.find((row) => row.symbol === symbol)
          ?.maximumWeightBps ?? 2_000,
      safeTwoSidedCapacityUsdWad:
        state.qualification.find((row) => row.symbol === symbol)
          ?.safeTwoSidedCapacityUsdWad ?? "0",
      maximumExposureUsdWad:
        state.qualification.find((row) => row.symbol === symbol)
          ?.maximumExposureUsdWad ?? "0",
      creatorApproved: true,
      creatorCapUsdWad:
        state.qualification.find((row) => row.symbol === symbol)
          ?.maximumExposureUsdWad ?? "0",
      qualificationEvidenceHash:
        state.qualification.find((row) => row.symbol === symbol)
          ?.evidenceHash ?? null,
    },
  ]),
);
const venues = Object.fromEntries(
  state.capacityEvidence
    .filter((evidence) => includedSymbols.includes(evidence.symbol))
    .map((evidence) => {
      const selected = [...evidence.probes]
        .reverse()
        .find((probe) => probe.passed);
      return [
        evidence.symbol,
        {
          factory: selected?.buy?.factory ?? null,
          router: selected?.buy?.router ?? null,
          quoter: selected?.buy?.quoter ?? null,
          buyPools: selected?.buy?.pools ?? [],
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
const payload = {
  schemaVersion: 1,
  manifestSchemaVersion: 5,
  environment: "robinhood-mainnet-candidate",
  chainId: 4663,
  gitSha,
  createdAt: new Date().toISOString(),
  broadcastPermitted: false,
  activationState: "paused-canary",
  canonicalAssets: true,
  prioritySymbols: [...MAINNET_PRIORITY_SYMBOLS],
  watchlistSymbols: [...MAINNET_WATCHLIST_SYMBOLS],
  includedSymbols,
  tvlCapUsdWad: MAINNET_TVL_CAP_USD_WAD.toString(),
  reserveSymbol: "USDG",
  nativeEthEntryEnabled: false,
  assets: candidateAssets,
  registryAssetIds,
  assetPolicy,
  creatorRiskPolicy: {
    initialAuthority: operatorAddress,
    role: "RISK_ADMIN_ROLE",
    increaseDelaySeconds: 172_800,
    reductionsImmediate: true,
    twoStepAuthorityTransfer: true,
    launchWitnessAssetIds: includedRiskAssets.map(
      (asset) => `${state.chainId}:${asset.address.toLowerCase()}`,
    ),
  },
  venueMappings: venues,
  qualificationEvidenceHash: state.sourceHash,
  bytecodeHashes: contractBytecodeHashes(repoRoot),
  webBuildId: buildExists
    ? readFileSync(resolve(repoRoot, "apps/web/.next/BUILD_ID"), "utf8").trim()
    : null,
  webBuildHash: buildExists
    ? directoryHash(resolve(repoRoot, "apps/web/.next"))
    : null,
  operatorAddress,
  executionAuthority: "self-hosted-uniswap-structured-routes",
  evidence: {
    clean,
    pushed,
    shadowReady: state.readyToBuildCandidate === true,
    coreQualificationPassed: state.readiness?.coreQualificationPassed === true,
    acceptancePassed,
    forkPassed,
    riskAuthorityConfigured: Boolean(operatorAddress),
    launchWitnessValid:
      includedRiskAssets.length >= 4 &&
      includedRiskAssets.length <= 9 &&
      state.readiness?.aggregateRiskCapacityBps >= 8_000,
    noMainnetManifest:
      !existsSync(
        resolve(repoRoot, "packages/contracts/deployments/mainnet-v4.json"),
      ) &&
      !existsSync(
        resolve(repoRoot, "packages/contracts/deployments/mainnet-v5.json"),
      ),
  },
  acceptanceHash: acceptance ? sha256(JSON.stringify(acceptance)) : null,
  forkHash: fork ? sha256(JSON.stringify(fork)) : null,
};
payload.readyToBroadcast = Object.values(payload.evidence).every(Boolean);
payload.reportHash = sha256(JSON.stringify(payload));

const signingKeystore =
  process.env.MDB_RELEASE_SIGNER_KEYSTORE ??
  "/etc/mdb/keys/mainnet-operator.json";
const signingPassword =
  process.env.MDB_RELEASE_SIGNER_PASSWORD_FILE ??
  "/etc/mdb/keys/mainnet-operator.password";
let signature = null;
if (existsSync(signingKeystore) && existsSync(signingPassword)) {
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
report.readyToBroadcast = report.readyToBroadcast && report.signed;

const shaOutput = resolve(
  repoRoot,
  `var/releases/${gitSha}/mainnet-candidate-v5.json`,
);
for (const output of [stableOutput, shaOutput]) {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o640,
  });
}
console.log(stableOutput);
