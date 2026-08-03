import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  publicNetworkConfig,
  validateNetworkConfig,
  type MdbServerNetworkConfig,
} from "../apps/web/lib/network.ts";

const officialTestnetRpc = "https://rpc.testnet.chain.robinhood.com";
const testnetFailoverRpc = "http://127.0.0.1:18548";
const mainnetFailoverRpc = "http://127.0.0.1:18549";

function testnetConfig(
  overrides: Partial<MdbServerNetworkConfig> = {},
): MdbServerNetworkConfig {
  return {
    mode: "testnet",
    chainId: 46630,
    chainName: "Robinhood Chain Testnet",
    networkLabel: "Robinhood Testnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    browserRpcUrl: officialTestnetRpc,
    serverRpcUrl: testnetFailoverRpc,
    explorerUrl: "https://explorer.testnet.chain.robinhood.com",
    confirmations: 3,
    decisionCadenceMinutes: 15,
    builtInWalletEnabled: true,
    faucetEnabled: true,
    faucetLanOnly: true,
    mockAssets: true,
    deploymentFile: "/tmp/mdb-testnet.json",
    stateDir: "/tmp/mdb-testnet",
    databaseName: "milliondollarbrain_testnet",
    ...overrides,
  };
}

function mainnetConfig(
  overrides: Partial<MdbServerNetworkConfig> = {},
): MdbServerNetworkConfig {
  return {
    ...testnetConfig(),
    mode: "mainnet",
    chainId: 4663,
    chainName: "Robinhood Chain",
    networkLabel: "Robinhood Chain",
    browserRpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    serverRpcUrl: mainnetFailoverRpc,
    confirmations: 12,
    decisionCadenceMinutes: 60,
    builtInWalletEnabled: false,
    faucetEnabled: false,
    mockAssets: false,
    deploymentFile: "/tmp/mdb-mainnet.json",
    stateDir: "/tmp/mdb-mainnet",
    databaseName: "milliondollarbrain_mainnet",
    ...overrides,
  };
}

test("testnet uses a loopback failover gateway and a public browser RPC", () => {
  const validated = validateNetworkConfig(testnetConfig());
  assert.equal(validated.chainId, 46630);
  assert.equal(validated.serverRpcUrl, testnetFailoverRpc);
  assert.equal(validated.browserRpcUrl, officialTestnetRpc);
  assert.equal(validated.decisionCadenceMinutes, 15);
});

test("testnet rejects bypassing the failover gateway", () => {
  assert.throws(
    () =>
      validateNetworkConfig(
        testnetConfig({ serverRpcUrl: "http://192.168.50.117:8547" }),
      ),
    /loopback failover gateway/,
  );
});

test("testnet rejects a private browser RPC", () => {
  assert.throws(
    () =>
      validateNetworkConfig(
        testnetConfig({ browserRpcUrl: "http://192.168.50.117:8547" }),
      ),
    /Public-network browser RPC must be public HTTPS/,
  );
});

test("public config never exposes server-only paths or database names", () => {
  const publicConfig = publicNetworkConfig(testnetConfig());
  assert.equal(publicConfig.decisionCadenceMinutes, 15);
  assert.equal("serverRpcUrl" in publicConfig, false);
  assert.equal("deploymentFile" in publicConfig, false);
  assert.equal("stateDir" in publicConfig, false);
  assert.equal("databaseName" in publicConfig, false);
});

test("network cadence must be a positive whole number", () => {
  assert.throws(
    () => validateNetworkConfig(testnetConfig({ decisionCadenceMinutes: 0 })),
    /Decision cadence must be a positive whole number/,
  );
});

test("mainnet cannot enable disposable wallets, faucets, or mocks", () => {
  assert.throws(
    () =>
      validateNetworkConfig({
        ...testnetConfig(),
        mode: "mainnet",
        chainId: 4663,
        builtInWalletEnabled: true,
        faucetEnabled: false,
        mockAssets: false,
      }),
    /Mainnet cannot enable built-in wallets or faucets/,
  );
});

test("mainnet requires its isolated loopback failover gateway", () => {
  assert.equal(
    validateNetworkConfig(mainnetConfig()).serverRpcUrl,
    mainnetFailoverRpc,
  );
  assert.throws(
    () =>
      validateNetworkConfig(
        mainnetConfig({ serverRpcUrl: "http://192.168.50.173:8547" }),
      ),
    /loopback failover gateway/,
  );
});

test("mainnet keeps Alchemy comparison-only until explicitly authorized", () => {
  const unit = readFileSync(
    "infrastructure/systemd/mdb-rpc-failover-mainnet.service",
    "utf8",
  );
  const configurator = readFileSync(
    "scripts/configure-mainnet-rpc-failover.sh",
    "utf8",
  );
  const manifest = readFileSync("config/networks.json", "utf8");
  const deploy = readFileSync("scripts/deploy-mainnet.sh", "utf8");
  assert.match(unit, /EnvironmentFile=\/etc\/mdb\/mainnet-rpc\.env/);
  assert.match(configurator, /http:\/\/192\.168\.50\.173:8547/);
  assert.match(configurator, /MDB_ALCHEMY_MAINNET_RPC_URL/);
  assert.match(configurator, /MDB_RPC_ROUTING_MODE=primary_only/);
  assert.match(configurator, /MDB_RPC_SECONDARY_ROUTING_AUTHORIZED=false/);
  assert.match(configurator, /MDB_RPC_CHECK_INTERVAL_MS=15000/);
  assert.match(configurator, /MDB_RPC_LISTEN_PORT=18549/);
  assert.match(manifest, /http:\/\/127\.0\.0\.1:18549/);
  assert.match(deploy, /MDB_RPC_ROUTING_MODE/);
  assert.match(deploy, /secondaryUsagePermitted/);
  assert.doesNotMatch(deploy, /cast chain-id --rpc-url "\$MDB_BACKUP_RPC_URL"/);
});

test("testnet collector retries transient public-RPC failures", () => {
  const unit = readFileSync(
    "infrastructure/systemd/mdb-market-collector-testnet.service",
    "utf8",
  );
  assert.match(unit, /Restart=on-failure/);
  assert.match(unit, /RestartSec=10/);
  assert.match(unit, /StartLimitBurst=4/);
});

test("testnet compares LAN and Alchemy heads without routing app traffic", () => {
  const proxy = readFileSync("scripts/rpc-failover-proxy.mjs", "utf8");
  const unit = readFileSync(
    "infrastructure/systemd/mdb-rpc-failover-testnet.service",
    "utf8",
  );
  const manifest = readFileSync("config/networks.json", "utf8");
  const configurator = readFileSync(
    "scripts/configure-testnet-rpc-failover.sh",
    "utf8",
  );
  const runtimeHealth = readFileSync("scripts/check-runtime-health.sh", "utf8");
  const endurance = readFileSync("tests/endurance-testnet.mjs", "utf8");
  assert.match(proxy, /eth_blockNumber/);
  assert.match(proxy, /eth_syncing/);
  assert.match(proxy, /primary behind by/);
  assert.match(proxy, /isMutatingRpcBody/);
  assert.match(unit, /EnvironmentFile=\/etc\/mdb\/testnet-rpc\.env/);
  assert.match(configurator, /MDB_ALCHEMY_TESTNET_RPC_URL/);
  assert.match(configurator, /MDB_RPC_ROUTING_MODE=primary_only/);
  assert.match(configurator, /MDB_RPC_SECONDARY_ROUTING_AUTHORIZED=false/);
  assert.match(configurator, /MDB_RPC_CHECK_INTERVAL_MS=15000/);
  assert.match(configurator, /pre-rpc-policy/);
  assert.match(runtimeHealth, /rpcHealth\.status/);
  assert.match(runtimeHealth, /secondaryUsagePermitted/);
  assert.match(endurance, /mdb-rpc-failover-testnet\.service/);
  assert.match(manifest, /http:\/\/127\.0\.0\.1:18548/);
  assert.doesNotMatch(
    readFileSync("infrastructure/env/testnet.env.example", "utf8"),
    /MDB_RPC_SECONDARY_URL|MDB_BACKUP_RPC_URL/,
  );
  assert.match(
    readFileSync("infrastructure/env/testnet-rpc.env.example", "utf8"),
    /MDB_RPC_SECONDARY_URL=.*alchemy\.com/,
  );
  assert.doesNotMatch(
    testnetConfig().browserRpcUrl,
    /192\.168\.50\.117|127\.0\.0\.1/,
  );
});

test("testnet evaluates control-selected cycle eligibility every five minutes", () => {
  const timer = readFileSync(
    "infrastructure/systemd/mdb-cycle-testnet.timer",
    "utf8",
  );
  assert.match(timer, /eligibility every five minutes/);
  assert.match(timer, /OnCalendar=\*-\*-\* \*:00\/5:00/);
});

test("testnet dashboard collapses reads through Multicall3", () => {
  const chain = readFileSync("apps/web/lib/chain.ts", "utf8");
  const dashboard = readFileSync(
    "apps/web/components/brain-dashboard.tsx",
    "utf8",
  );
  assert.match(chain, /0xca11bde05977b3631167028862be2a173976ca11/);
  assert.match(chain, /publicClient\.multicall/);
  assert.match(chain, /allowFailure: false/);
  assert.match(dashboard, /data\?\.network\.mode === "testnet" \? 30_000/);
});

test("testnet transactions tolerate public-RPC nonce and receipt replica lag", () => {
  const chain = readFileSync("apps/web/lib/chain.ts", "utf8");
  const dashboard = readFileSync(
    "apps/web/components/brain-dashboard.tsx",
    "utf8",
  );
  const collector = readFileSync("apps/web/lib/market-price-sync.ts", "utf8");
  assert.match(
    chain,
    /privateKeyToAccount\(operatorPrivateKey as `0x\$\{string\}`, \{\s*nonceManager,/s,
  );
  assert.match(chain, /checkReplacement: false/);
  assert.match(chain, /retryCount: 20/);
  assert.match(chain, /timeout: 180_000/);
  assert.match(dashboard, /privateKeyToAccount\(key, \{ nonceManager \}\)/);
  assert.match(
    dashboard,
    /const receiptWaitPolicy = \{\s*checkReplacement: false/s,
  );
  assert.equal(
    [...dashboard.matchAll(/waitForTransactionReceipt\(\{/g)].length,
    [...dashboard.matchAll(/\.\.\.receiptWaitPolicy/g)].length,
  );
  assert.doesNotMatch(collector, /publicClient\.waitForTransactionReceipt/);
});

test("testnet endurance uses the authenticated acceptance surface", () => {
  const faucet = readFileSync("apps/web/app/api/faucet/route.ts", "utf8");
  const acceptance = readFileSync(
    "apps/web/app/api/testnet-acceptance/route.ts",
    "utf8",
  );
  const endurance = readFileSync("tests/endurance-testnet.mjs", "utf8");
  const enduranceUnit = readFileSync(
    "infrastructure/systemd/mdb-endurance-testnet.service",
    "utf8",
  );
  assert.match(faucet, /"250000000000000"/);
  assert.match(faucet, /"3000000000000000"/);
  assert.match(endurance, /process\.env\.MDB_CYCLE_TOKEN/);
  assert.match(endurance, /\/api\/testnet-acceptance/);
  assert.match(endurance, /"x-mdb-cycle-token": token/);
  assert.match(acceptance, /process\.env\.MDB_CYCLE_TOKEN/);
  assert.match(
    acceptance,
    /request\.headers\.get\("x-mdb-cycle-token"\) !== expected/,
  );
  assert.match(acceptance, /networkConfig\.mode !== "testnet"/);
  assert.match(acceptance, /functionName: "redeemWithDexPlan"/);
  assert.match(acceptance, /buildDexSwapPlans\("deposit"/);
  assert.match(acceptance, /buildDexSwapPlans\("redeem"/);
  assert.match(endurance, /locator\("\.editorial-banner"\)/);
  assert.match(endurance, /2 \* 60 \* 60 \* 1000/);
  assert.match(endurance, /existing\.repairDowntimeMs \?\?=/);
  assert.match(endurance, /existing\.repairCommits \?\? \[\]/);
  assert.match(
    endurance,
    /state\.completedAt -\s*state\.startedAt -\s*\(state\.repairDowntimeMs \?\? 0\)/s,
  );
  assert.match(enduranceUnit, /MDB_ENDURANCE_DURATION_MS=7200000/);
  const acceptanceGenerator = readFileSync(
    "scripts/generate-testnet-acceptance.mjs",
    "utf8",
  );
  assert.match(acceptanceGenerator, /state\.gitSha !== gitSha/);
  assert.match(acceptanceGenerator, /state\.repairDowntimeMs \?\? 0/);
  assert.match(acceptanceGenerator, /row\.gitSha === gitSha/);
  assert.match(
    acceptanceGenerator,
    /state\.repairCommits \?\? \[\]\)\.length > 0/,
  );
  assert.match(
    acceptanceGenerator,
    /autonomousCycles: passing\.some\(\(row\) => row\.latestCycleTxHash\)/,
  );
  assert.match(endurance, /concurrentRequests: 2/);
  assert.match(endurance, /userActions: 3/);
  assert.match(endurance, /width: 390/);
  assert.match(endurance, /widths\.scroll <= widths\.client/);
  assert.match(acceptance, /million-dollar-brain:endurance/);
  assert.match(acceptance, /purchaseType:/);
  assert.match(acceptance, /oversizedSellRejected/);
  assert.match(acceptance, /brainPurchasePrice \+ gross \+ fundingBuffer/);
  assert.match(acceptance, /requiredUsdg - balance/);
  assert.doesNotMatch(acceptance, /const minimumUsdg = parseUnits\("5000"/);
});

test("DEX keepalive is explicitly armed and never funds itself", () => {
  const keepalive = readFileSync("scripts/run-dex-keepalive.sh", "utf8");

  assert.match(keepalive, /MDB_DEX_KEEPALIVE_ARMED/);
  assert.doesNotMatch(keepalive, /top_up_testnet_keeper/);
  assert.doesNotMatch(keepalive, /MDB_DEX_KEEPALIVE_MINIMUM_GAS_WEI/);
  assert.doesNotMatch(keepalive, /MDB_OPERATOR_GAS_RESERVE_FLOOR_WEI/);
  assert.doesNotMatch(keepalive, /cast send "\$deployer"/);
});

test("mock price writes are opt-in test utilities", () => {
  const source = readFileSync("apps/web/lib/market-price-sync.ts", "utf8");
  assert.match(source, /MDB_LOCAL_PRICE_SYNC_ENABLED !== "true"/);
  assert.match(source, /require explicit test arming/);
});

test("test-only wallet controls are visible locally but hidden on testnet", () => {
  const dashboard = readFileSync(
    "apps/web/components/editorial-dashboard.tsx",
    "utf8",
  );
  const controller = readFileSync(
    "apps/web/components/brain-dashboard.tsx",
    "utf8",
  );
  assert.match(
    dashboard,
    /network\?\.mode === "local" && network\.faucetEnabled/,
  );
  assert.match(
    dashboard,
    /walletSource === "built-in" &&\s*network\?\.mode === "local"/,
  );
  assert.doesNotMatch(dashboard, /YOU ARE HERE: THE STEERING LAYER/);
  assert.match(controller, /`mdb-test-wallet-\$\{data\.network\.chainId\}`/);
  assert.match(controller, /fetch\("\/api\/faucet"/);
});

test("local faucet supports repeated disposable-wallet UAT without weakening testnet caps", () => {
  const faucet = readFileSync("apps/web/app/api/faucet/route.ts", "utf8");
  assert.match(faucet, /localDevnet \? 1_000 : 1/);
  assert.match(faucet, /localDevnet \? 1_000 : 5/);
});

test("confirmed wallet actions survive temporary status refresh failures", () => {
  const dashboard = readFileSync(
    "apps/web/components/brain-dashboard.tsx",
    "utf8",
  );
  assert.match(dashboard, /async function refreshAfterConfirmedAction\(\)/);
  assert.match(dashboard, /Date\.now\(\) \+ 90_000/);
  assert.match(dashboard, /\(\) => refresh\(\)\.catch\(\(\) => undefined\)/);
  assert.match(dashboard, /Live portfolio data is still refreshing\./);
});

test("cached DEX status is explicit and blocks stale transactions", () => {
  const dashboard = readFileSync(
    "apps/web/components/brain-dashboard.tsx",
    "utf8",
  );
  const status = readFileSync("apps/web/app/api/status/route.ts", "utf8");
  assert.match(dashboard, /DEX pricing live · block/);
  assert.match(
    dashboard,
    /Last updated \$\{ageSeconds\}s ago — trading paused/,
  );
  assert.match(dashboard, /data\.dexSnapshot\.state !== "live"/);
  assert.match(status, /snapshotStatusResponse\(\)/);
  assert.doesNotMatch(status, /dashboard\(/);
});

test("runtime release evidence can supersede a stale service environment SHA", () => {
  const releaseStatus = readFileSync("apps/web/lib/release-status.ts", "utf8");
  assert.match(releaseStatus, /MDB_STATE_DIR.*release\.json/s);
  assert.match(
    releaseStatus,
    /recordedReleaseSha \?\? process\.env\.MDB_RELEASE_SHA/,
  );
});
