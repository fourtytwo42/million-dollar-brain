import { readFileSync } from "node:fs";
import { defineChain, type Chain } from "viem";

export type MdbNetworkMode = "local" | "testnet" | "mainnet";

export type MdbPublicNetworkConfig = {
  mode: MdbNetworkMode;
  chainId: number;
  chainName: string;
  networkLabel: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  browserRpcUrl: string;
  explorerUrl: string;
  confirmations: number;
  builtInWalletEnabled: boolean;
  faucetEnabled: boolean;
  faucetLanOnly: boolean;
  mockAssets: boolean;
};

export type MdbServerNetworkConfig = MdbPublicNetworkConfig & {
  serverRpcUrl: string;
  deploymentFile: string;
  stateDir: string;
  databaseName: string;
};

export function validateNetworkConfig(
  resolved: MdbServerNetworkConfig,
): MdbServerNetworkConfig {
  if (
    resolved.mode === "mainnet" &&
    (resolved.builtInWalletEnabled || resolved.faucetEnabled)
  ) {
    throw new Error("Mainnet cannot enable built-in wallets or faucets");
  }
  if (
    resolved.mode !== "local" &&
    /^https?:\/\/(127\.0\.0\.1|localhost|192\.168\.)/i.test(
      resolved.browserRpcUrl,
    )
  ) {
    throw new Error("Public-network browser RPC must be public HTTPS");
  }
  if (
    resolved.mode === "testnet" &&
    resolved.serverRpcUrl !== "https://rpc.testnet.chain.robinhood.com"
  ) {
    throw new Error(
      "Testnet server RPC must use the official Robinhood public endpoint",
    );
  }
  if (
    resolved.mode === "testnet" &&
    resolved.browserRpcUrl !== "https://rpc.testnet.chain.robinhood.com"
  ) {
    throw new Error(
      "Testnet browser RPC must use the official Robinhood public endpoint",
    );
  }
  if (resolved.mode === "mainnet" && resolved.mockAssets) {
    throw new Error("Mainnet cannot use mock assets");
  }
  return resolved;
}

type NetworkManifest = {
  schemaVersion: 1;
  local: Omit<MdbServerNetworkConfig, "mode">;
  testnet: Omit<MdbServerNetworkConfig, "mode">;
  mainnet: Omit<MdbServerNetworkConfig, "mode">;
};

const DEFAULT_MANIFEST: NetworkManifest = {
  schemaVersion: 1,
  local: {
    chainId: 31337,
    chainName: "MillionDollar Brain Devnet",
    networkLabel: "Local devnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    browserRpcUrl: "http://192.168.50.135:8545",
    serverRpcUrl: "http://127.0.0.1:8545",
    explorerUrl: "",
    confirmations: 1,
    builtInWalletEnabled: true,
    faucetEnabled: true,
    faucetLanOnly: false,
    mockAssets: true,
    deploymentFile:
      "/home/hendo420/projects/million-dollar-brain/packages/contracts/deployments/local.json",
    stateDir: "/home/hendo420/projects/million-dollar-brain/var",
    databaseName: "milliondollarbrain",
  },
  testnet: {
    chainId: 46630,
    chainName: "Robinhood Chain Testnet",
    networkLabel: "Robinhood Testnet",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    browserRpcUrl: "https://rpc.testnet.chain.robinhood.com",
    serverRpcUrl: "https://rpc.testnet.chain.robinhood.com",
    explorerUrl: "https://explorer.testnet.chain.robinhood.com",
    confirmations: 3,
    builtInWalletEnabled: true,
    faucetEnabled: true,
    faucetLanOnly: true,
    mockAssets: true,
    deploymentFile:
      "/home/hendo420/projects/million-dollar-brain/packages/contracts/deployments/testnet.json",
    stateDir: "/home/hendo420/projects/million-dollar-brain/var/testnet",
    databaseName: "milliondollarbrain_testnet",
  },
  mainnet: {
    chainId: 4663,
    chainName: "Robinhood Chain",
    networkLabel: "Robinhood Chain",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    browserRpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    serverRpcUrl: "https://rpc.mainnet.chain.robinhood.com",
    explorerUrl: "https://robinhoodchain.blockscout.com",
    confirmations: 12,
    builtInWalletEnabled: false,
    faucetEnabled: false,
    faucetLanOnly: true,
    mockAssets: false,
    deploymentFile:
      "/home/hendo420/projects/million-dollar-brain/packages/contracts/deployments/mainnet.json",
    stateDir: "/home/hendo420/projects/million-dollar-brain/var/mainnet",
    databaseName: "milliondollarbrain_mainnet",
  },
};

function isMode(value: string): value is MdbNetworkMode {
  return value === "local" || value === "testnet" || value === "mainnet";
}

function loadManifest(): NetworkManifest {
  const path = process.env.MDB_NETWORK_MANIFEST;
  if (!path) return DEFAULT_MANIFEST;
  return JSON.parse(readFileSync(path, "utf8")) as NetworkManifest;
}

export function resolveNetworkConfig(): MdbServerNetworkConfig {
  const requested = process.env.MDB_NETWORK_MODE ?? "local";
  if (!isMode(requested))
    throw new Error(`Unsupported MDB_NETWORK_MODE: ${requested}`);
  const manifest = loadManifest();
  if (manifest.schemaVersion !== 1)
    throw new Error("Unsupported MDB network manifest");
  const base = manifest[requested];
  const resolved: MdbServerNetworkConfig = {
    ...base,
    mode: requested,
    serverRpcUrl: process.env.MDB_RPC_URL ?? base.serverRpcUrl,
    browserRpcUrl: process.env.MDB_BROWSER_RPC_URL ?? base.browserRpcUrl,
    deploymentFile: process.env.MDB_DEPLOYMENT_FILE ?? base.deploymentFile,
    stateDir: process.env.MDB_STATE_DIR ?? base.stateDir,
    databaseName: process.env.MDB_DATABASE ?? base.databaseName,
  };
  return validateNetworkConfig(resolved);
}

export const networkConfig = resolveNetworkConfig();

export function publicNetworkConfig(
  config: MdbServerNetworkConfig = networkConfig,
): MdbPublicNetworkConfig {
  const {
    serverRpcUrl: _serverRpcUrl,
    deploymentFile: _deploymentFile,
    stateDir: _stateDir,
    databaseName: _databaseName,
    ...publicConfig
  } = config;
  return publicConfig;
}

export function viemChain(
  config: MdbPublicNetworkConfig = publicNetworkConfig(),
): Chain {
  return defineChain({
    id: config.chainId,
    name: config.chainName,
    nativeCurrency: config.nativeCurrency,
    rpcUrls: { default: { http: [config.browserRpcUrl] } },
    blockExplorers: config.explorerUrl
      ? {
          default: {
            name: `${config.networkLabel} Explorer`,
            url: config.explorerUrl,
          },
        }
      : undefined,
    testnet: config.mode !== "mainnet",
  });
}
