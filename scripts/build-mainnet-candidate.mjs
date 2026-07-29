import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  contractBytecodeHashes,
  directoryHash,
  sha256,
} from "./lib/release-artifacts.mjs";
import {
  MAINNET_CORE_SYMBOLS,
  MAINNET_OPTIONAL_SYMBOLS,
} from "./lib/mainnet-readiness.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const statePath =
  process.env.MDB_MAINNET_SHADOW_STATE ??
  resolve(repoRoot, "var/mainnet-shadow/state.json");
const stableOutput = resolve(
  repoRoot,
  "var/mainnet-readiness/mainnet-candidate-v3.json",
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
if (state.schemaVersion !== 3 || state.chainId !== 4663)
  throw new Error("Decision-ready mainnet shadow schema v3 is required");
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
  fork?.schemaVersion === 3 &&
  fork?.chainId === 4663 &&
  fork?.canonicalAssets === true &&
  fork?.activationState === "paused-canary";

const includedSymbols = state.readiness?.includedSymbols ?? [];
const candidateAssets = [
  state.assets.find((asset) => asset.symbol === "USDG"),
  ...includedSymbols.map((symbol) =>
    state.assets.find((asset) => asset.symbol === symbol),
  ),
].filter(Boolean);
const assetPolicy = Object.fromEntries(
  includedSymbols.map((symbol) => [
    symbol,
    {
      kind:
        symbol === "WETH"
          ? "CRYPTO"
          : ["SPY", "QQQ", "SOXX"].includes(symbol)
            ? "ETF"
            : "STOCK",
      riskClass: symbol === "WETH" ? "HIGH_VOLATILITY" : "STANDARD",
      maximumWeightBps: 2_000,
      qualificationEvidenceHash:
        state.qualification.find((row) => row.symbol === symbol)
          ?.evidenceHash ?? null,
    },
  ]),
);
const feeds = Object.fromEntries(
  state.feedEvidence
    .filter((feed) => includedSymbols.includes(feed.symbol))
    .map((feed) => [
      feed.symbol,
      {
        address: feed.feed,
        decimals: feed.decimals,
        marketHours: feed.marketHours,
        sourceHash: feed.catalogSourceHash,
      },
    ]),
);
const venues = Object.fromEntries(
  state.quoteEvidence
    .filter((quote) => includedSymbols.includes(quote.symbol))
    .map((quote) => [
      quote.symbol,
      {
        target: quote.impactBuy?.target ?? null,
        allowanceTarget: quote.impactBuy?.allowanceTarget ?? null,
        selector: quote.impactBuy?.selector ?? null,
        buyEvidenceHash: quote.impactBuy?.sourceHash ?? null,
        sellEvidenceHash: quote.impactSell?.sourceHash ?? null,
      },
    ]),
);
const operatorAddress =
  process.env.MDB_DEPLOYER_ADDRESS ??
  (existsSync("/etc/mdb/keys/mainnet-operator.address")
    ? readFileSync("/etc/mdb/keys/mainnet-operator.address", "utf8").trim()
    : null);
const quoteAuthorizerAddress =
  process.env.MDB_QUOTE_AUTHORIZER ??
  (existsSync("/etc/mdb/keys/mainnet-quote-authorizer.address")
    ? readFileSync(
        "/etc/mdb/keys/mainnet-quote-authorizer.address",
        "utf8",
      ).trim()
    : null);
const buildExists = existsSync(resolve(repoRoot, "apps/web/.next/BUILD_ID"));
const payload = {
  schemaVersion: 1,
  manifestSchemaVersion: 3,
  environment: "robinhood-mainnet-candidate",
  chainId: 4663,
  gitSha,
  createdAt: new Date().toISOString(),
  broadcastPermitted: false,
  activationState: "paused-canary",
  canonicalAssets: true,
  requiredSymbols: [...MAINNET_CORE_SYMBOLS],
  optionalSymbols: [...MAINNET_OPTIONAL_SYMBOLS],
  includedSymbols,
  assets: candidateAssets,
  assetPolicy,
  oracleMappings: feeds,
  venueMappings: venues,
  qualificationEvidenceHash: state.sourceHash,
  chainlinkCatalogHash: state.chainlinkCatalogHash,
  bytecodeHashes: contractBytecodeHashes(repoRoot),
  webBuildId: buildExists
    ? readFileSync(resolve(repoRoot, "apps/web/.next/BUILD_ID"), "utf8").trim()
    : null,
  webBuildHash: buildExists
    ? directoryHash(resolve(repoRoot, "apps/web/.next"))
    : null,
  operatorAddress,
  quoteAuthorizerAddress,
  evidence: {
    clean,
    pushed,
    shadowReady: state.readyToBuildCandidate === true,
    coreQualificationPassed: state.readiness?.coreQualificationPassed === true,
    acceptancePassed,
    forkPassed,
    noMainnetManifest: !existsSync(
      resolve(repoRoot, "packages/contracts/deployments/mainnet-v3.json"),
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
  `var/releases/${gitSha}/mainnet-candidate-v3.json`,
);
for (const output of [stableOutput, shaOutput]) {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o640,
  });
}
console.log(stableOutput);
