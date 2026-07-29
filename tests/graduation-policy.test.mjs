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
  assert.match(networks.mainnet.deploymentFile, /mainnet-v3\.json$/);
});

test("mainnet policy has no mock wallet, faucet, or private browser RPC", () => {
  assert.equal(networks.mainnet.mockAssets, false);
  assert.equal(networks.mainnet.builtInWalletEnabled, false);
  assert.equal(networks.mainnet.faucetEnabled, false);
  assert.match(networks.mainnet.browserRpcUrl, /^https:\/\//);
  assert.doesNotMatch(networks.mainnet.browserRpcUrl, /192\.168\.|localhost/);
});

test("mainnet deploy gate uses two-hour acceptance and 48-hour qualification", () => {
  const deployment = read("scripts/deploy-mainnet.sh");
  assert.match(deployment, /v3-2h-acceptance\.json/);
  assert.doesNotMatch(deployment, /72-hour|72h|diname/);
  assert.match(deployment, /qualificationWindowPassed/);
  assert.match(read("scripts/mainnet-shadow.mjs"), /QUALIFICATION_HOURS = 48/);
});

test("mainnet services stay disabled until explicit activation", () => {
  const installer = read("scripts/install-systemd.sh");
  assert.match(
    installer,
    /disable mdb-web-mainnet\.service mdb-cycle-mainnet\.timer mdb-market-collector-mainnet\.timer/,
  );
  assert.match(
    read("scripts/set-mainnet-activation.sh"),
    /MDB_MAINNET_ACTIVATION_APPROVED/,
  );
});
