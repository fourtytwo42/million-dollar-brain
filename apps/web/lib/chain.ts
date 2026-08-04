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
import { redeemPreviewShares } from "./redeem-preview";
import {
  canonicalAssetId,
  type AssetQualificationV3,
  type AssetKind,
  type RiskClass,
} from "./asset-universe";
import { maximumSupportedDeposit } from "./capacity-policy";

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
  safeTwoSidedCapacityUsdWad?: string;
  maximumExposureUsdWad?: string;
  robinhoodUid: string | null;
  controlId?: number;
  tags?: string[];
  active?: boolean;
  qualified?: boolean;
  creatorApproved?: boolean;
  creatorCapUsdWad?: string;
  policyVersion?: number;
  pendingPolicy?: {
    creatorCapUsdWad: string;
    activationTime: number;
    approved: boolean;
  };
  qualificationV3?: AssetQualificationV3;
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
  longTwapWindowSeconds?: number;
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
  riskController?: Address;
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
const riskRegistryAbi = parseAbi([
  "function isActive(address token) view returns (bool)",
  "function isEligibleV3(address token) view returns (bool)",
  "function riskPolicy(address token) view returns ((uint128 creatorCapUsdWad,uint64 version,bool approved) policy,uint128 effectiveCapUsdWad)",
  "function qualificationV3(address token) view returns ((bytes32 evidenceHash,uint64 observedAt,uint64 validUntil,uint32 consecutiveHours,uint8 regularMarketSessions,uint128 safeTwoSidedCapacityUsdWad,bool identityValid,bool routeMature,bool shortTwapValid,bool longTwapValid,bool timeWeightedLiquidityValid,bool liquidityValid,bool transferBehaviorValid,bool tokenStateClear) qualification,uint128 maximumExposureUsdWad)",
]);
const riskControllerReadAbi = parseAbi([
  "function riskAuthority() view returns (address)",
  "function pendingRiskAuthority() view returns (address)",
  "function riskIncreaseDelay() view returns (uint64)",
  "function pendingTvlCap() view returns (uint128 capUsdWad,uint64 activationTime,bytes32 witnessHash)",
  "function pendingAssetPolicies(address token) view returns (uint128 creatorCapUsdWad,uint64 activationTime,bool approved)",
]);
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
      batchSize: 16_384,
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
  const valuationAssetManifest = assetManifest.filter(
    (asset) => asset.active !== false,
  );
  const reserve = assetManifest.find((asset) => asset.kind === "reserve");
  if (!reserve) throw new Error("deployment has no reserve asset");
  const assetAddresses = Object.fromEntries(
    valuationAssetManifest.map((asset) => [asset.symbol, asset.address]),
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
      functionName: "tvlCapUsdWad",
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
  const hasCreatorRiskPolicy = Boolean(d.riskController && d.assetRegistry);
  if (hasCreatorRiskPolicy) {
    contracts.push(
      {
        address: d.riskController!,
        abi: riskControllerReadAbi,
        functionName: "riskAuthority",
      },
      {
        address: d.riskController!,
        abi: riskControllerReadAbi,
        functionName: "pendingRiskAuthority",
      },
      {
        address: d.riskController!,
        abi: riskControllerReadAbi,
        functionName: "riskIncreaseDelay",
      },
      {
        address: d.riskController!,
        abi: riskControllerReadAbi,
        functionName: "pendingTvlCap",
      },
    );
    for (const asset of assetManifest.filter(
      (asset) => asset.kind !== "reserve",
    )) {
      contracts.push(
        {
          address: d.assetRegistry!,
          abi: riskRegistryAbi,
          functionName: "isActive",
          args: [asset.address],
        },
        {
          address: d.assetRegistry!,
          abi: riskRegistryAbi,
          functionName: "isEligibleV3",
          args: [asset.address],
        },
        {
          address: d.assetRegistry!,
          abi: riskRegistryAbi,
          functionName: "riskPolicy",
          args: [asset.address],
        },
        {
          address: d.assetRegistry!,
          abi: riskRegistryAbi,
          functionName: "qualificationV3",
          args: [asset.address],
        },
        {
          address: d.riskController!,
          abi: riskControllerReadAbi,
          functionName: "pendingAssetPolicies",
          args: [asset.address],
        },
      );
    }
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
  const tvlCap = results[cursor++] as bigint;
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

  const assetRows = valuationAssetManifest.map((asset) => {
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
  const runtimeAssetManifest = assetManifest.map((asset) => ({ ...asset }));
  let creatorRiskPolicy = null;
  if (hasCreatorRiskPolicy) {
    const riskAuthority = results[cursor++] as Address;
    const pendingRiskAuthority = results[cursor++] as Address;
    const riskIncreaseDelay = results[cursor++] as bigint;
    const pendingTvlCap = results[cursor++] as readonly [
      bigint,
      bigint,
      `0x${string}`,
    ];
    creatorRiskPolicy = {
      controller: d.riskController!,
      authority: riskAuthority,
      pendingAuthority: pendingRiskAuthority,
      increaseDelaySeconds: Number(riskIncreaseDelay),
      pendingTvlCap:
        pendingTvlCap[1] !== 0n
          ? {
              capUsdWad: pendingTvlCap[0].toString(),
              activationTime: Number(pendingTvlCap[1]),
            }
          : null,
    };
    for (const asset of runtimeAssetManifest.filter(
      (asset) => asset.kind !== "reserve",
    )) {
      const active = Boolean(results[cursor++]);
      const qualified = Boolean(results[cursor++]);
      const policy = results[cursor++] as readonly [
        {
          creatorCapUsdWad: bigint;
          version: bigint;
          approved: boolean;
        },
        bigint,
      ];
      asset.active = active;
      asset.qualified = qualified;
      asset.creatorCapUsdWad = policy[0].creatorCapUsdWad.toString();
      asset.policyVersion = Number(policy[0].version);
      asset.creatorApproved = policy[0].approved;
      asset.maximumExposureUsdWad = policy[1].toString();
      const qualificationResult = results[cursor++] as readonly [
        {
          evidenceHash: `0x${string}`;
          observedAt: bigint;
          validUntil: bigint;
          consecutiveHours: number;
          regularMarketSessions: number;
          safeTwoSidedCapacityUsdWad: bigint;
          identityValid: boolean;
          routeMature: boolean;
          shortTwapValid: boolean;
          longTwapValid: boolean;
          timeWeightedLiquidityValid: boolean;
          liquidityValid: boolean;
          transferBehaviorValid: boolean;
          tokenStateClear: boolean;
        },
        bigint,
      ];
      const qualification = qualificationResult[0];
      asset.safeTwoSidedCapacityUsdWad =
        qualification.safeTwoSidedCapacityUsdWad.toString();
      asset.qualificationV3 = {
        schemaVersion: 3,
        evidenceHash: qualification.evidenceHash,
        observedAt: new Date(
          Number(qualification.observedAt) * 1_000,
        ).toISOString(),
        validUntil: new Date(
          Number(qualification.validUntil) * 1_000,
        ).toISOString(),
        qualificationHours: Number(qualification.consecutiveHours),
        regularMarketSessions: Number(qualification.regularMarketSessions),
        safeTwoSidedCapacityUsdWad:
          qualification.safeTwoSidedCapacityUsdWad.toString(),
        maximumExposureUsdWad: qualificationResult[1].toString(),
        capacityProbeUsdWad: [],
        buyImpactBps: null,
        sellImpactBps: null,
        identityValid: qualification.identityValid,
        routeMature: qualification.routeMature,
        liquidityValid: qualification.liquidityValid,
        transferBehaviorValid: qualification.transferBehaviorValid,
        tokenStateClear: qualification.tokenStateClear,
        dexSafety: {
          shortTwapWindowSeconds: 1_800,
          longTwapWindowSeconds: 14_400,
          shortTwapValid: qualification.shortTwapValid,
          longTwapValid: qualification.longTwapValid,
          timeWeightedLiquidityValid: qualification.timeWeightedLiquidityValid,
          spotToShortDeviationBps: null,
          shortToLongDeviationBps: null,
          observationCardinality: 0,
          newestObservationAt: new Date(
            Number(qualification.observedAt) * 1_000,
          ).toISOString(),
        },
        lastFailureAt: null,
        reasons: qualified
          ? []
          : ["current on-chain qualification is not valid"],
      };
      const pending = results[cursor++] as readonly [bigint, bigint, boolean];
      if (pending[1] !== 0n) {
        Object.assign(asset, {
          pendingPolicy: {
            creatorCapUsdWad: pending[0].toString(),
            activationTime: Number(pending[1]),
            approved: pending[2],
          },
        });
      }
    }
  }
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

  const redeemShares = redeemPreviewShares(
    requestedRedeem,
    shares,
    Boolean(address),
  );
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
  const { maximumDepositUsdWad, limitingConstraint } = maximumSupportedDeposit({
    navUsdWad: nav,
    tvlCapUsdWad: tvlCap,
    walletValueUsdWad: address && supply > 0n ? (shares * nav) / supply : null,
    assets: runtimeAssetManifest
      .filter((asset) => asset.kind !== "reserve")
      .map((asset) => ({
        symbol: asset.symbol,
        active: asset.active !== false,
        maximumWeightBps: asset.maximumWeightBps,
        maximumExposureUsdWad: BigInt(asset.maximumExposureUsdWad ?? "0"),
        currentExposureUsdWad: BigInt(assetValues[asset.symbol] ?? "0"),
        currentWeightBps: currentWeightsBps[asset.symbol] ?? 0,
      })),
  });
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
    capacity: {
      tvlCapUsdWad: tvlCap.toString(),
      remainingUsdWad: (nav >= tvlCap ? 0n : tvlCap - nav).toString(),
      maximumDepositUsdWad: maximumDepositUsdWad.toString(),
      limitingConstraint,
      utilizationBps: tvlCap === 0n ? 0 : Number((nav * 10_000n) / tvlCap),
      atOrAboveCap: tvlCap !== 0n && nav >= tvlCap,
    },
    creatorRiskPolicy,
    navPerShare: navPerShare.toString(),
    supply: supply.toString(),
    shares: shares.toString(),
    walletUsdg: walletUsdg.toString(),
    redemption: { pendingRequestId: pendingRedemption.toString() },
    assets: runtimeAssetManifest,
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

export async function accountDashboard(
  address: Address,
  ownedPieceIds: bigint[],
) {
  const d = deployment();
  const reserve = deploymentAssets(d).find((asset) => asset.kind === "reserve");
  if (!reserve) throw new Error("deployment has no reserve asset");
  const result = await dashboardReads([
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
    {
      address: d.rewards,
      abi: rewardAbi,
      functionName: "pendingRewards",
      args: [address, ownedPieceIds],
    },
  ]);
  return {
    shares: (result[0] as bigint).toString(),
    walletUsdg: (result[1] as bigint).toString(),
    redemption: { pendingRequestId: (result[2] as bigint).toString() },
    rewards: { pending: (result[3] as bigint).toString() },
  };
}

export const mintAbi = parseAbi(["function mint(address to, uint256 amount)"]);
