import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  publicNetworkConfig,
  validateNetworkConfig,
  type MdbServerNetworkConfig,
} from "../apps/web/lib/network.ts";

const officialTestnetRpc = "https://rpc.testnet.chain.robinhood.com";

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
    serverRpcUrl: officialTestnetRpc,
    explorerUrl: "https://explorer.testnet.chain.robinhood.com",
    confirmations: 3,
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

test("testnet accepts the official public RPC for server and browser", () => {
  const validated = validateNetworkConfig(testnetConfig());
  assert.equal(validated.chainId, 46630);
  assert.equal(validated.serverRpcUrl, officialTestnetRpc);
  assert.equal(validated.browserRpcUrl, officialTestnetRpc);
});

test("testnet rejects a private server RPC", () => {
  assert.throws(
    () =>
      validateNetworkConfig(
        testnetConfig({ serverRpcUrl: "http://192.168.50.117:8547" }),
      ),
    /official Robinhood public endpoint/,
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
  assert.equal("serverRpcUrl" in publicConfig, false);
  assert.equal("deploymentFile" in publicConfig, false);
  assert.equal("stateDir" in publicConfig, false);
  assert.equal("databaseName" in publicConfig, false);
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

test("testnet collector retries transient public-RPC failures", () => {
  const unit = readFileSync(
    "infrastructure/systemd/mdb-market-collector-testnet.service",
    "utf8",
  );
  assert.match(unit, /Restart=on-failure/);
  assert.match(unit, /RestartSec=10/);
  assert.match(unit, /StartLimitBurst=4/);
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
  assert.match(acceptance, /functionName: "redeemWithPlan"/);
  assert.match(endurance, /locator\("\.editorial-banner"\)/);
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
