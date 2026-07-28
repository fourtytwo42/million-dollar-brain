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
