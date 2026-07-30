import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
  type Hash,
} from "viem";
import { nonceManager, privateKeyToAccount } from "viem/accounts";
import {
  basketAbi,
  brainAbi,
  brainControlAbi,
  erc20Abi,
  rewardAbi,
} from "./abi";
import { brainDefinition } from "./brain-catalog";
import {
  controlSpec,
  migrateLegacyPreset,
  unpackAssetIds,
  unpackScalars,
} from "./brain-controls";
import { networkConfig, publicNetworkConfig, viemChain } from "./network";
import {
  canonicalAssetId,
  type AssetKind,
  type RiskClass,
} from "./asset-universe";

type LegacyDeployment = Record<
  | "usdg"
  | "nvda"
  | "aapl"
  | "ethx"
  | "router"
  | "rewards"
  | "creatorVault"
  | "brain"
  | "basket",
  Address
> & { oracle?: Address };

export type DeploymentAsset = {
  id: string;
  symbol: string;
  name: string;
  address: Address;
  kind: AssetKind;
  riskClass: RiskClass;
  decimals: number;
  maximumWeightBps: number;
  robinhoodUid: string | null;
  controlId?: number;
  tags?: string[];
};

export type DexVenuePool = {
  address: Address;
  token0: Address;
  token1: Address;
  fee: number;
  approved: boolean;
};

export type DexVenueManifestV1 = {
  venue: "uniswap-v3";
  factory: Address;
  router: Address;
  quoter: Address;
  weth: Address;
  feeTiers: number[];
  twapWindowSeconds: number;
  quoteLifetimeSeconds: number;
  maximumReferenceBlockAge: number;
  pools: DexVenuePool[];
};

export type Deployment = LegacyDeployment & {
  schemaVersion?: number;
  environment?: string;
  chainId?: number;
  assets?: DeploymentAsset[];
  assetRegistry?: Address;
  executionAdapter?: Address;
  quoteAuthorizer?: Address;
  dexExecutionAdapter?: Address;
  dexValuationAdapter?: Address;
  dexVenue?: DexVenueManifestV1;
  pricePublisher?: Address;
  brainControlRegistry?: Address;
  controlCatalogHash?: `0x${string}`;
  controlSchemaVersion?: number;
  controlCatalogVersion?: number;
  contracts?: {
    router?: Address;
    oracle?: Address;
    valuation?: Address;
    executionAdapter?: Address;
    dexExecutionAdapter?: Address;
    dexValuationAdapter?: Address;
    assetRegistry?: Address;
    brainControlRegistry?: Address;
    pricePublisher?: Address;
    rewards: Address;
    creatorVault: Address;
    brain: Address;
    basket: Address;
  };
};
const rpcUrl = networkConfig.serverRpcUrl;
const deploymentFile = networkConfig.deploymentFile;
export const chain = viemChain({
  ...publicNetworkConfig(networkConfig),
  browserRpcUrl: rpcUrl,
});
const MULTICALL3_ADDRESS =
  "0xca11bde05977b3631167028862be2a173976ca11" as Address;
export const publicClient = createPublicClient({
  chain,
  transport: http(rpcUrl, {
    retryCount: 5,
    retryDelay: 1_000,
    timeout: 30_000,
  }),
});
const operatorPrivateKey =
  process.env.MDB_OPERATOR_PRIVATE_KEY ??
  process.env.MDB_DEV_PRIVATE_KEY ??
  (networkConfig.mode === "local"
    ? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"
    : undefined);
if (!operatorPrivateKey) {
  throw new Error(`MDB operator signer is required for ${networkConfig.mode}`);
}
export const admin = privateKeyToAccount(operatorPrivateKey as `0x${string}`, {
  nonceManager,
});
export const adminClient = createWalletClient({
  account: admin,
  chain,
  transport: http(rpcUrl, {
    retryCount: 5,
    retryDelay: 1_000,
    timeout: 30_000,
  }),
});
export function waitForReliableTransactionReceipt(hash: Hash) {
  return publicClient.waitForTransactionReceipt({
    hash,
    checkReplacement: false,
    retryCount: 20,
    retryDelay: 1_000,
    timeout: 180_000,
  });
}
export function normalizeDeployment(raw: Record<string, unknown>): Deployment {
  const contracts = (raw.contracts ?? {}) as Deployment["contracts"];
  const assets = Array.isArray(raw.assets)
    ? (raw.assets as DeploymentAsset[])
    : undefined;
  const reserve = assets?.find((asset) => asset.kind === "reserve");
  const bySymbol = new Map(
    assets?.map((asset) => [asset.symbol, asset.address]),
  );
  const normalized = {
    ...raw,
    usdg: raw.usdg ?? reserve?.address,
    nvda: raw.nvda ?? bySymbol.get("NVDA") ?? reserve?.address,
    aapl: raw.aapl ?? bySymbol.get("AAPL") ?? reserve?.address,
    ethx:
      raw.ethx ??
      bySymbol.get("ETHX") ??
      bySymbol.get("WETH") ??
      reserve?.address,
    router: raw.router ?? contracts?.router ?? contracts?.executionAdapter,
    oracle: raw.oracle ?? contracts?.oracle ?? contracts?.valuation,
    assetRegistry: raw.assetRegistry ?? contracts?.assetRegistry,
    executionAdapter: raw.executionAdapter ?? contracts?.executionAdapter,
    dexExecutionAdapter:
      raw.dexExecutionAdapter ?? contracts?.dexExecutionAdapter,
    dexValuationAdapter:
      raw.dexValuationAdapter ?? contracts?.dexValuationAdapter,
    pricePublisher: raw.pricePublisher ?? contracts?.pricePublisher,
    brainControlRegistry:
      raw.brainControlRegistry ?? contracts?.brainControlRegistry,
    rewards: raw.rewards ?? contracts?.rewards,
    creatorVault: raw.creatorVault ?? contracts?.creatorVault,
    brain: raw.brain ?? contracts?.brain,
    basket: raw.basket ?? contracts?.basket,
  } as Deployment;
  for (const field of [
    "usdg",
    "router",
    "rewards",
    "creatorVault",
    "brain",
    "basket",
  ] as const) {
    if (!normalized[field]) throw new Error(`deployment missing ${field}`);
  }
  return normalized;
}

export function deploymentAssets(d: Deployment): DeploymentAsset[] {
  if (d.assets?.length)
    return d.assets.map((asset, index) => ({
      ...asset,
      controlId: asset.controlId ?? index + 1,
      tags: asset.tags ?? defaultAssetTags(asset.symbol, asset.kind),
    }));
  const chainId = d.chainId ?? networkConfig.chainId;
  return [
    {
      id: canonicalAssetId(chainId, d.usdg),
      symbol: "USDG",
      name: "Global Dollar",
      address: d.usdg,
      kind: "reserve",
      riskClass: "reserve",
      decimals: 18,
      maximumWeightBps: 10_000,
      robinhoodUid: null,
      controlId: 1,
      tags: ["reserve"],
    },
    {
      id: canonicalAssetId(chainId, d.nvda),
      symbol: "NVDA",
      name: "NVIDIA",
      address: d.nvda,
      kind: "stock",
      riskClass: "standard",
      decimals: 18,
      maximumWeightBps: 5_000,
      robinhoodUid: null,
      controlId: 3,
      tags: ["technology", "ai_semiconductor"],
    },
    {
      id: canonicalAssetId(chainId, d.aapl),
      symbol: "AAPL",
      name: "Apple",
      address: d.aapl,
      kind: "stock",
      riskClass: "standard",
      decimals: 18,
      maximumWeightBps: 5_000,
      robinhoodUid: null,
      controlId: 2,
      tags: ["technology"],
    },
    {
      id: canonicalAssetId(chainId, d.ethx),
      symbol: "ETHX",
      name: "Ether",
      address: d.ethx,
      kind: "crypto",
      riskClass: "high_volatility",
      decimals: 18,
      maximumWeightBps: 5_000,
      robinhoodUid: null,
      controlId: 12,
      tags: ["crypto_major"],
    },
  ];
}

function defaultAssetTags(symbol: string, kind: AssetKind) {
  const upper = symbol.toUpperCase();
  const tags = new Set<string>();
  if (kind === "reserve") tags.add("reserve");
  if (kind === "crypto") tags.add("crypto_major");
  if (["AAPL", "NVDA", "MSFT", "AMZN", "GOOGL", "META"].includes(upper))
    tags.add("technology");
  if (["NVDA", "MSFT", "SOXX"].includes(upper)) tags.add("ai_semiconductor");
  if (["GOOGL", "META"].includes(upper)) tags.add("communications");
  if (["AMZN", "TSLA"].includes(upper)) tags.add("consumer_discretionary");
  if (["SPY", "QQQ", "SOXX"].includes(upper)) tags.add("broad_market");
  return [...tags];
}

export function deployment(): Deployment {
  return normalizeDeployment(
    JSON.parse(
      readFileSync(/* turbopackIgnore: true */ deploymentFile, "utf8"),
    ) as Record<string, unknown>,
  );
}

type DashboardContract = {
  address: Address;
  abi: readonly unknown[];
  functionName: string;
  args?: readonly unknown[];
};

async function dashboardReads(contracts: DashboardContract[]) {
  if (networkConfig.mode === "testnet") {
    return (await publicClient.multicall({
      contracts,
      allowFailure: false,
      multicallAddress: MULTICALL3_ADDRESS,
    } as never)) as unknown[];
  }
  return Promise.all(
    contracts.map((contract) => publicClient.readContract(contract as never)),
  ) as Promise<unknown[]>;
}

export async function dashboard(
  address?: Address,
  grossDeposit = 1_000n * 10n ** 18n,
  requestedRedeem?: bigint,
) {
  const d = deployment();
  const assetManifest = deploymentAssets(d);
  const reserve = assetManifest.find((asset) => asset.kind === "reserve");
  if (!reserve) throw new Error("deployment has no reserve asset");
  const assetAddresses = Object.fromEntries(
    assetManifest.map((asset) => [asset.symbol, asset.address]),
  ) as Record<string, Address>;
  const contracts: DashboardContract[] = [
    {
      address: d.basket,
      abi: basketAbi,
      functionName: "canaryControlsConfigured",
    },
    {
      address: d.basket,
      abi: basketAbi,
      functionName: "buysEnabled",
    },
    {
      address: d.basket,
      abi: basketAbi,
      functionName: "sellsEnabled",
    },
    {
      address: d.basket,
      abi: basketAbi,
      functionName: "rebalancesEnabled",
    },
    {
      address: d.brain,
      abi: brainAbi,
      functionName: "marketControlsConfigured",
    },
    {
      address: d.brain,
      abi: brainAbi,
      functionName: "purchasesEnabled",
    },
    {
      address: d.basket,
      abi: basketAbi,
      functionName: "totalAssetsUsd",
    },
    {
      address: d.basket,
      abi: basketAbi,
      functionName: "navPerShareWad",
    },
    {
      address: d.basket,
      abi: basketAbi,
      functionName: "totalSupply",
    },
    ...assetManifest.map((asset) => ({
      address: asset.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [d.basket] as const,
    })),
    {
      address: d.brain,
      abi: brainAbi,
      functionName: "catalogVersion",
    },
    {
      address: d.brain,
      abi: brainAbi,
      functionName: "catalogHash",
    },
    {
      address: d.brain,
      abi: brainAbi,
      functionName: "profileCatalogVersion",
    },
    {
      address: d.brain,
      abi: brainAbi,
      functionName: "profileCatalogHash",
    },
    {
      address: d.brain,
      abi: brainAbi,
      functionName: "profileV2Enabled",
    },
    {
      address: d.basket,
      abi: basketAbi,
      functionName: "previewDeposit",
      args: [grossDeposit],
    },
  ];
  if (address) {
    contracts.push(
      {
        address: d.basket,
        abi: basketAbi,
        functionName: "balanceOf",
        args: [address],
      },
      {
        address: reserve.address,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      },
      {
        address: d.basket,
        abi: basketAbi,
        functionName: "pendingRedemptionByAccount",
        args: [address],
      },
    );
  }
  for (const asset of Object.values(assetAddresses)) {
    contracts.push(
      {
        address: d.basket,
        abi: basketAbi,
        functionName: "assetValueUsd",
        args: [asset],
      },
      {
        address: d.basket,
        abi: basketAbi,
        functionName: "currentWeightBps",
        args: [asset],
      },
      {
        address: d.basket,
        abi: basketAbi,
        functionName: "oracleStatus",
        args: [asset],
      },
    );
  }
  const hasControlCatalog = Boolean(d.brainControlRegistry);
  if (hasControlCatalog) {
    contracts.push(
      {
        address: d.brain,
        abi: brainAbi,
        functionName: "controlBundlesEnabled",
      },
      {
        address: d.brainControlRegistry!,
        abi: brainControlAbi,
        functionName: "catalogHash",
      },
    );
  }
  for (let pieceId = 1; pieceId <= 42; pieceId += 1) {
    const id = BigInt(pieceId);
    contracts.push(
      {
        address: d.brain,
        abi: brainAbi,
        functionName: "ownerOf",
        args: [id],
      },
      {
        address: d.brain,
        abi: brainAbi,
        functionName: "currentPrice",
        args: [id],
      },
      {
        address: d.brain,
        abi: brainAbi,
        functionName: "selectedPreset",
        args: [id],
      },
      {
        address: d.brain,
        abi: brainAbi,
        functionName: "immutableWeight",
        args: [id],
      },
      {
        address: d.brain,
        abi: brainAbi,
        functionName: "isUnowned",
        args: [id],
      },
      {
        address: d.brain,
        abi: brainAbi,
        functionName: "portraitHash",
        args: [id],
      },
      {
        address: d.brain,
        abi: brainAbi,
        functionName: "ownershipSerial",
        args: [id],
      },
      {
        address: d.brain,
        abi: brainAbi,
        functionName: "portraitChangeSerialPlusOne",
        args: [id],
      },
      {
        address: d.brain,
        abi: brainAbi,
        functionName: "customName",
        args: [id],
      },
      {
        address: d.brain,
        abi: brainAbi,
        functionName: "profileUrl",
        args: [id],
      },
      {
        address: d.brain,
        abi: brainAbi,
        functionName: "customTagline",
        args: [id],
      },
      {
        address: d.brain,
        abi: brainAbi,
        functionName: "personaPack",
        args: [id],
      },
    );
    if (hasControlCatalog) {
      contracts.push({
        address: d.brainControlRegistry!,
        abi: brainControlAbi,
        functionName: "controlBundle",
        args: [id],
      });
    }
  }

  const [results, latestBlock, maximumPriceAge] = await Promise.all([
    dashboardReads(contracts),
    publicClient.getBlock(),
    publicClient.readContract({
      address: d.basket,
      abi: basketAbi,
      functionName: "maximumPriceAge",
    }),
  ]);
  let cursor = 0;
  const basketControlsConfigured = results[cursor++] as boolean;
  const buysEnabled = results[cursor++] as boolean;
  const sellsEnabled = results[cursor++] as boolean;
  const rebalancesEnabled = results[cursor++] as boolean;
  const brainControlsConfigured = results[cursor++] as boolean;
  const brainPurchasesEnabled = results[cursor++] as boolean;
  const nav = results[cursor++] as bigint;
  const navPerShare = results[cursor++] as bigint;
  const supply = results[cursor++] as bigint;
  const balances = Object.fromEntries(
    assetManifest.map((asset) => [
      asset.symbol,
      (results[cursor++] as bigint).toString(),
    ]),
  );
  const catalogVersion = results[cursor++] as number;
  const catalogHash = results[cursor++] as `0x${string}`;
  const profileCatalogVersion = results[cursor++] as number;
  const profileCatalogHash = results[cursor++] as `0x${string}`;
  const profileV2Enabled = results[cursor++] as boolean;
  const depositPreview = results[cursor++] as readonly [bigint, bigint, bigint];
  const shares = address ? (results[cursor++] as bigint) : 0n;
  const walletUsdg = address ? (results[cursor++] as bigint) : 0n;
  const pendingRedemption = address ? (results[cursor++] as bigint) : 0n;

  const assetRows = assetManifest.map((asset) => {
    const value = results[cursor++] as bigint;
    const weightBps = results[cursor++] as number;
    const oracle = results[cursor++] as readonly [bigint, bigint, boolean];
    return { ...asset, value, weightBps, oracle };
  });
  const controlBundlesEnabled = hasControlCatalog
    ? Boolean(results[cursor++])
    : false;
  const controlCatalogVersion = hasControlCatalog
    ? (d.controlCatalogVersion ?? 1)
    : 0;
  const controlCatalogHash = hasControlCatalog
    ? (results[cursor++] as `0x${string}`)
    : null;
  const pieces = Array.from({ length: 42 }, (_, index) => {
    const owner = results[cursor++] as Address;
    const price = results[cursor++] as bigint;
    const preset = results[cursor++] as number;
    const weight = results[cursor++] as number;
    const unowned = results[cursor++] as boolean;
    const portraitHash = results[cursor++] as `0x${string}`;
    const ownershipSerial = Number(results[cursor++] as bigint);
    const portraitChangeSerialPlusOne = Number(results[cursor++] as bigint);
    const customName = results[cursor++] as string;
    const profileUrl = results[cursor++] as string;
    const customTagline = results[cursor++] as string;
    const personaPack = results[cursor++] as bigint;
    const rawControlBundle = hasControlCatalog
      ? (results[cursor++] as readonly [
          number,
          `0x${string}`,
          `0x${string}`,
          `0x${string}`,
          bigint,
          bigint,
        ])
      : null;
    const legacyBundle = migrateLegacyPreset(index + 1, Number(preset));
    const controlBundle = rawControlBundle
      ? {
          schemaVersion: 1 as const,
          values: unpackScalars(rawControlBundle[1]).slice(
            0,
            controlSpec(index + 1).controls.length,
          ),
          assetIds: unpackAssetIds(rawControlBundle[2]),
        }
      : legacyBundle;
    const definition = brainDefinition(index + 1);
    return {
      id: index + 1,
      owner,
      price: price.toString(),
      preset: Number(preset),
      weight: Number(weight),
      unowned,
      portraitHash,
      ownershipSerial,
      profileChangeAvailable:
        !unowned && portraitChangeSerialPlusOne !== ownershipSerial + 1,
      customName,
      profileUrl,
      customTagline,
      personaPack: personaPack.toString(),
      ownerCustomized: portraitChangeSerialPlusOne === ownershipSerial + 1,
      controlBundle,
      controlBundleHash: rawControlBundle?.[3] ?? null,
      controlSelectionVersion: Number(rawControlBundle?.[4] ?? 0n),
      controlUpdatedAt: Number(rawControlBundle?.[5] ?? 0n),
      affinity: definition.affinity,
      name: definition.name,
      glyph: definition.glyph,
      tagline: definition.tagline,
      lore: definition.lore,
      crew: definition.crew,
      kind: definition.kind,
      visual: definition.visual,
      category: definition.category,
      options: definition.options,
      data: definition.data,
      tags: definition.tags ?? [],
    };
  });
  if (cursor !== results.length) {
    throw new Error("dashboard multicall result length mismatch");
  }

  const redeemShares =
    requestedRedeem == null
      ? shares / 2n
      : requestedRedeem > shares
        ? shares
        : requestedRedeem;
  const ownedPieceIds = address
    ? pieces
        .filter((piece) => piece.owner.toLowerCase() === address.toLowerCase())
        .map((piece) => BigInt(piece.id))
    : [];
  const followupContracts: DashboardContract[] = [
    {
      address: d.basket,
      abi: basketAbi,
      functionName: "previewRedeem",
      args: [redeemShares],
    },
  ];
  if (address) {
    followupContracts.push({
      address: d.rewards,
      abi: rewardAbi,
      functionName: "pendingRewards",
      args: [address, ownedPieceIds],
    });
  }
  const followupResults = await dashboardReads(followupContracts);
  const redeemPreview = followupResults[0] as readonly [
    bigint,
    bigint,
    bigint,
    boolean,
  ];
  const pendingRewards = address ? (followupResults[1] as bigint) : 0n;
  const assetValues = Object.fromEntries(
    assetRows.map((row) => [row.symbol, row.value.toString()]),
  );
  const currentWeightsBps = Object.fromEntries(
    assetRows.map((row) => [row.symbol, Number(row.weightBps)]),
  );
  const oracleRows = Object.fromEntries(
    assetRows.map((row) => [
      row.symbol,
      {
        priceUsdWad: row.oracle[0].toString(),
        updatedAt: Number(row.oracle[1]),
        valid: row.oracle[2],
      },
    ]),
  );
  const oldestOracleTimestamp = Math.min(
    ...assetRows
      .filter((row) => row.oracle[2])
      .map((row) => Number(row.oracle[1])),
  );
  return {
    network: publicNetworkConfig(networkConfig),
    activation: {
      basketControlsConfigured,
      brainControlsConfigured,
      buysEnabled: !basketControlsConfigured || Boolean(buysEnabled),
      sellsEnabled: !basketControlsConfigured || Boolean(sellsEnabled),
      rebalancesEnabled:
        !basketControlsConfigured || Boolean(rebalancesEnabled),
      brainPurchasesEnabled:
        !brainControlsConfigured || Boolean(brainPurchasesEnabled),
      controlBundlesEnabled,
    },
    controlCatalog: {
      schemaVersion: hasControlCatalog ? 1 : 0,
      catalogVersion: controlCatalogVersion,
      catalogHash: controlCatalogHash,
      registry: d.brainControlRegistry ?? null,
    },
    profileCatalog: {
      schemaVersion: 2,
      catalogVersion: Number(profileCatalogVersion),
      catalogHash: profileCatalogHash,
      enabled: Boolean(profileV2Enabled),
    },
    deployment: d,
    blockNumber: latestBlock.number.toString(),
    nav: nav.toString(),
    navPerShare: navPerShare.toString(),
    supply: supply.toString(),
    shares: shares.toString(),
    walletUsdg: walletUsdg.toString(),
    redemption: { pendingRequestId: pendingRedemption.toString() },
    assets: assetManifest,
    holdings: balances,
    holdingValues: assetValues,
    currentWeightsBps,
    oracle: {
      assets: oracleRows,
      chainTimestamp: Number(latestBlock.timestamp),
      maximumPriceAge: Number(maximumPriceAge),
      oldestTimestamp: Number.isFinite(oldestOracleTimestamp)
        ? oldestOracleTimestamp
        : 0,
      fresh: assetRows.every(
        (row) =>
          row.oracle[2] &&
          Number(row.oracle[1]) > 0 &&
          Number(latestBlock.timestamp) - Number(row.oracle[1]) <=
            Number(maximumPriceAge),
      ),
    },
    previews: {
      deposit: {
        gross: grossDeposit.toString(),
        fee: depositPreview[0].toString(),
        netInvestment: depositPreview[1].toString(),
        expectedShares: depositPreview[2].toString(),
      },
      redeem: {
        shares: redeemShares.toString(),
        gross: redeemPreview[0].toString(),
        fee: redeemPreview[1].toString(),
        net: redeemPreview[2].toString(),
        immediate: redeemPreview[3],
      },
    },
    pieces,
    rewards: { pending: pendingRewards.toString() },
    catalog: { version: Number(catalogVersion), hash: catalogHash },
    browserRpcUrl: networkConfig.browserRpcUrl,
  };
}

export const mintAbi = parseAbi(["function mint(address to, uint256 amount)"]);
