import { readFileSync } from "node:fs";
import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { basketAbi, brainAbi, erc20Abi, rewardAbi } from "./abi";
import { brainDefinition } from "./brain-catalog";
import { networkConfig, publicNetworkConfig, viemChain } from "./network";

export type Deployment = Record<
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
const rpcUrl = networkConfig.serverRpcUrl;
const deploymentFile = networkConfig.deploymentFile;
export const chain = viemChain({
  ...publicNetworkConfig(networkConfig),
  browserRpcUrl: rpcUrl,
});
export const publicClient = createPublicClient({
  chain,
  transport: http(rpcUrl),
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
export const admin = privateKeyToAccount(operatorPrivateKey as `0x${string}`);
export const adminClient = createWalletClient({
  account: admin,
  chain,
  transport: http(rpcUrl),
});
export function deployment(): Deployment {
  return JSON.parse(
    readFileSync(/* turbopackIgnore: true */ deploymentFile, "utf8"),
  ) as Deployment;
}

export async function dashboard(
  address?: Address,
  grossDeposit = 1_000n * 10n ** 18n,
  requestedRedeem?: bigint,
) {
  const d = deployment();
  const [
    nav,
    navPerShare,
    supply,
    usdgBalance,
    nvdaBalance,
    aaplBalance,
    ethxBalance,
    shares,
    walletUsdg,
    pendingRedemption,
    catalogVersion,
    catalogHash,
    depositPreview,
    latestBlock,
  ] = await Promise.all([
    publicClient.readContract({
      address: d.basket,
      abi: basketAbi,
      functionName: "totalAssetsUsd",
    }),
    publicClient.readContract({
      address: d.basket,
      abi: basketAbi,
      functionName: "navPerShareWad",
    }),
    publicClient.readContract({
      address: d.basket,
      abi: basketAbi,
      functionName: "totalSupply",
    }),
    publicClient.readContract({
      address: d.usdg,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [d.basket],
    }),
    publicClient.readContract({
      address: d.nvda,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [d.basket],
    }),
    publicClient.readContract({
      address: d.aapl,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [d.basket],
    }),
    publicClient.readContract({
      address: d.ethx,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [d.basket],
    }),
    address
      ? publicClient.readContract({
          address: d.basket,
          abi: basketAbi,
          functionName: "balanceOf",
          args: [address],
        })
      : Promise.resolve(0n),
    address
      ? publicClient.readContract({
          address: d.usdg,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [address],
        })
      : Promise.resolve(0n),
    address
      ? publicClient.readContract({
          address: d.basket,
          abi: basketAbi,
          functionName: "pendingRedemptionByAccount",
          args: [address],
        })
      : Promise.resolve(0n),
    publicClient.readContract({
      address: d.brain,
      abi: brainAbi,
      functionName: "catalogVersion",
    }),
    publicClient.readContract({
      address: d.brain,
      abi: brainAbi,
      functionName: "catalogHash",
    }),
    publicClient.readContract({
      address: d.basket,
      abi: basketAbi,
      functionName: "previewDeposit",
      args: [grossDeposit],
    }),
    publicClient.getBlock(),
  ]);
  const assetAddresses = {
    USDG: d.usdg,
    NVDA: d.nvda,
    AAPL: d.aapl,
    ETHX: d.ethx,
  } as const;
  const redeemShares =
    requestedRedeem == null
      ? shares / 2n
      : requestedRedeem > shares
        ? shares
        : requestedRedeem;
  const [assetRows, redeemPreview] = await Promise.all([
    Promise.all(
      Object.entries(assetAddresses).map(async ([symbol, asset]) => {
        const [value, weightBps, oracle] = await Promise.all([
          publicClient.readContract({
            address: d.basket,
            abi: basketAbi,
            functionName: "assetValueUsd",
            args: [asset],
          }),
          publicClient.readContract({
            address: d.basket,
            abi: basketAbi,
            functionName: "currentWeightBps",
            args: [asset],
          }),
          publicClient.readContract({
            address: d.basket,
            abi: basketAbi,
            functionName: "oracleStatus",
            args: [asset],
          }),
        ]);
        return { symbol, value, weightBps, oracle };
      }),
    ),
    publicClient.readContract({
      address: d.basket,
      abi: basketAbi,
      functionName: "previewRedeem",
      args: [redeemShares],
    }),
  ]);
  const pieces = await Promise.all(
    Array.from({ length: 42 }, async (_, i) => {
      const id = BigInt(i + 1);
      const [owner, price, preset, weight, unowned] = await Promise.all([
        publicClient.readContract({
          address: d.brain,
          abi: brainAbi,
          functionName: "ownerOf",
          args: [id],
        }),
        publicClient.readContract({
          address: d.brain,
          abi: brainAbi,
          functionName: "currentPrice",
          args: [id],
        }),
        publicClient.readContract({
          address: d.brain,
          abi: brainAbi,
          functionName: "selectedPreset",
          args: [id],
        }),
        publicClient.readContract({
          address: d.brain,
          abi: brainAbi,
          functionName: "immutableWeight",
          args: [id],
        }),
        publicClient.readContract({
          address: d.brain,
          abi: brainAbi,
          functionName: "isUnowned",
          args: [id],
        }),
      ]);
      const definition = brainDefinition(i + 1);
      return {
        id: i + 1,
        owner,
        price: price.toString(),
        preset: Number(preset),
        weight: Number(weight),
        unowned,
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
    }),
  );
  const ownedPieceIds = address
    ? pieces
        .filter((piece) => piece.owner.toLowerCase() === address.toLowerCase())
        .map((piece) => BigInt(piece.id))
    : [];
  const pendingRewards = address
    ? await publicClient.readContract({
        address: d.rewards,
        abi: rewardAbi,
        functionName: "pendingRewards",
        args: [address, ownedPieceIds],
      })
    : 0n;
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
    deployment: d,
    blockNumber: latestBlock.number.toString(),
    nav: nav.toString(),
    navPerShare: navPerShare.toString(),
    supply: supply.toString(),
    shares: shares.toString(),
    walletUsdg: walletUsdg.toString(),
    redemption: { pendingRequestId: pendingRedemption.toString() },
    holdings: {
      USDG: usdgBalance.toString(),
      NVDA: nvdaBalance.toString(),
      AAPL: aaplBalance.toString(),
      ETHX: ethxBalance.toString(),
    },
    holdingValues: assetValues,
    currentWeightsBps,
    oracle: {
      assets: oracleRows,
      chainTimestamp: Number(latestBlock.timestamp),
      oldestTimestamp: Number.isFinite(oldestOracleTimestamp)
        ? oldestOracleTimestamp
        : 0,
      fresh: assetRows.every(
        (row) =>
          row.oracle[2] &&
          Number(row.oracle[1]) > 0 &&
          Number(latestBlock.timestamp) - Number(row.oracle[1]) <= 120,
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
