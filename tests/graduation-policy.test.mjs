import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) =>
  readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const networks = JSON.parse(read("config/networks.json"));

test("runtime state, database, and deployment manifests are isolated", () => {
  const rows = [networks.local, networks.testnet, networks.mainnet];
  assert.equal(new Set(rows.map((row) => row.stateDir)).size, 3);
  assert.equal(new Set(rows.map((row) => row.databaseName)).size, 3);
  assert.equal(new Set(rows.map((row) => row.deploymentFile)).size, 3);
  assert.match(networks.local.deploymentFile, /local-v3\.json$/);
  assert.match(networks.testnet.deploymentFile, /testnet-v3\.json$/);
  assert.match(networks.mainnet.deploymentFile, /mainnet-v5\.json$/);
});

test("mainnet policy has no mock wallet, faucet, or private browser RPC", () => {
  assert.equal(networks.mainnet.mockAssets, false);
  assert.equal(networks.mainnet.builtInWalletEnabled, false);
  assert.equal(networks.mainnet.faucetEnabled, false);
  assert.match(networks.mainnet.browserRpcUrl, /^https:\/\//);
  assert.doesNotMatch(networks.mainnet.browserRpcUrl, /192\.168\.|localhost/);
});

test("paused deployment and activation use independent fail-closed gates", () => {
  const deployment = read("scripts/deploy-mainnet.sh");
  assert.match(
    deployment,
    /var\/releases\/\$head_sha\/testnet-acceptance\.json/,
  );
  assert.doesNotMatch(deployment, /72-hour|72h|diname/);
  assert.match(deployment, /pausedDeploymentReady/);
  assert.doesNotMatch(deployment, /qualificationWindowPassed/);
  assert.match(deployment, /prepare-mainnet-deployment-env\.mjs/);
  assert.doesNotMatch(
    read("packages/contracts/script/DeployMainnet.s.sol"),
    /consecutiveHours:\s*48/,
  );
  assert.match(read("scripts/mainnet-shadow.mjs"), /QUALIFICATION_HOURS = 48/);
  assert.match(
    read("scripts/mainnet-shadow.mjs"),
    /MDB_MAINNET_SHADOW_SYMBOLS is diagnostic-only and must be empty in readiness mode/,
  );
  assert.match(
    read("scripts/mainnet-shadow.mjs"),
    /fullCanonicalUniverseInspected/,
  );
  assert.match(read("scripts/deploy-mainnet.sh"), /diagnosticFilterDisabled/);
  const candidateBuilder = read("scripts/build-mainnet-candidate.mjs");
  assert.match(candidateBuilder, /creatorRiskPolicy/);
  assert.match(candidateBuilder, /increaseDelaySeconds: 172_800/);
  assert.match(candidateBuilder, /launchWitnessValid/);
  assert.match(candidateBuilder, /riskAuthorityConfigured/);
  assert.match(candidateBuilder, /pausedDeploymentReady/);
  assert.match(candidateBuilder, /activationReady/);
  assert.match(candidateBuilder, /shadowEvidenceFresh/);
  assert.match(candidateBuilder, /qualificationRuleVersion !== 4/);
  assert.match(candidateBuilder, /exactBuildEvidencePassed/);
  assert.match(candidateBuilder, /rpcPolicyPassed/);
  assert.doesNotMatch(candidateBuilder, /rpcFailoverPassed/);
  const rpcEvidence = read("scripts/record-mainnet-rpc-failover.mjs");
  assert.match(rpcEvidence, /routingMode: "primary_only"/);
  assert.match(rpcEvidence, /automaticSecondaryRouting: false/);
  assert.match(rpcEvidence, /degradedWithoutFailover: true/);
  assert.match(deployment, /MDB_RPC_ROUTING_MODE/);
  assert.match(deployment, /secondaryUsagePermitted/);
  assert.match(read("scripts/check-release.sh"), /record-release-build\.mjs/);
  assert.match(read("scripts/check-release.sh"), /check-release-format\.sh/);
  assert.match(deployment, /verify-mainnet-candidate\.mjs/);
  const activation = read("scripts/set-mainnet-activation.sh");
  assert.match(activation, /activationReady/);
  assert.match(activation, /mainnet-v5\.json/);
  const creatorRiskUpgrade = read("scripts/upgrade-creator-risk.sh");
  assert.match(creatorRiskUpgrade, /MDB_CREATOR_RISK_MIGRATION/);
  assert.match(creatorRiskUpgrade, /expected_chain=46630/);
  assert.match(creatorRiskUpgrade, /git.*status --porcelain/);
  assert.match(creatorRiskUpgrade, /riskIncreaseDelay/);
  const pausedPolicyUpgrade = read("scripts/upgrade-paused-canary-policy.sh");
  assert.match(pausedPolicyUpgrade, /UpgradePausedCanaryPolicy/);
  assert.match(pausedPolicyUpgrade, /MDB_BASKET/);
  assert.match(pausedPolicyUpgrade, /basketImplementation/);
  assert.match(pausedPolicyUpgrade, /statePreserved:true/);
  assert.match(
    pausedPolicyUpgrade,
    /testnet-paused-canary-policy-upgrade\.json/,
  );
});

test("mainnet services stay disabled until explicit activation", () => {
  const installer = read("scripts/install-systemd.sh");
  assert.match(
    installer,
    /disable [^\n]*mdb-web-mainnet\.service mdb-cycle-mainnet\.timer mdb-market-collector-mainnet\.timer/,
  );
  assert.match(
    read("scripts/set-mainnet-activation.sh"),
    /MDB_MAINNET_ACTIVATION_APPROVED/,
  );
});

test("risk migration seeds approval only from live qualification", () => {
  const script = readFileSync("scripts/upgrade-creator-risk.sh", "utf8");
  assert.match(script, /isEligibleV3\(address\)\(bool\)/);
  assert.match(script, /kind" == "reserve"/);
  assert.doesNotMatch(
    script,
    /\[\.assets\[\] \| select\(\.active \/\/ true\) \| \.address\]/,
  );
});

test("signed release artifacts cover every upgradeable implementation", () => {
  const artifacts = read("scripts/lib/release-artifacts.mjs");
  for (const contract of [
    "AssetRegistry",
    "BasketVault",
    "BrainControlRegistry",
    "BrainMarketplace",
    "CreatorRiskController",
    "CreatorVault",
    "DexTwapValuationAdapter",
    "RewardDistributor",
    "UniswapExecutionAdapter",
  ]) {
    assert.match(artifacts, new RegExp(`"${contract}"`));
  }
});
