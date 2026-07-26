import { readFileSync } from "node:fs";
import { createPublicClient, createWalletClient, http, parseAbi, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { localhost } from "viem/chains";
import { basketAbi, brainAbi, erc20Abi, rewardAbi } from "./abi";
import { brainDefinition } from "./brain-catalog";

export type Deployment = Record<"usdg" | "nvda" | "aapl" | "ethx" | "router" | "rewards" | "creatorVault" | "brain" | "basket", Address>;
const rpcUrl = process.env.MDB_RPC_URL ?? "http://127.0.0.1:8545";
const deploymentFile = process.env.MDB_DEPLOYMENT_FILE ?? "/home/hendo420/projects/million-dollar-brain/packages/contracts/deployments/local.json";
export const chain = { ...localhost, id: 31337, rpcUrls: { default: { http: [rpcUrl] } } };
export const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
export const admin = privateKeyToAccount((process.env.MDB_DEV_PRIVATE_KEY ?? "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80") as `0x${string}`);
export const adminClient = createWalletClient({ account: admin, chain, transport: http(rpcUrl) });
export function deployment(): Deployment { return JSON.parse(readFileSync(deploymentFile, "utf8")) as Deployment; }

export async function dashboard(address?: Address) {
  const d = deployment();
  const [nav, supply, usdgBalance, nvdaBalance, aaplBalance, ethxBalance, shares, catalogVersion, catalogHash] = await Promise.all([
    publicClient.readContract({ address: d.basket, abi: basketAbi, functionName: "nav" }),
    publicClient.readContract({ address: d.basket, abi: basketAbi, functionName: "totalSupply" }),
    publicClient.readContract({ address: d.usdg, abi: erc20Abi, functionName: "balanceOf", args: [d.basket] }),
    publicClient.readContract({ address: d.nvda, abi: erc20Abi, functionName: "balanceOf", args: [d.basket] }),
    publicClient.readContract({ address: d.aapl, abi: erc20Abi, functionName: "balanceOf", args: [d.basket] }),
    publicClient.readContract({ address: d.ethx, abi: erc20Abi, functionName: "balanceOf", args: [d.basket] }),
    address ? publicClient.readContract({ address: d.basket, abi: basketAbi, functionName: "balanceOf", args: [address] }) : Promise.resolve(0n),
    publicClient.readContract({ address: d.brain, abi: brainAbi, functionName: "catalogVersion" }),
    publicClient.readContract({ address: d.brain, abi: brainAbi, functionName: "catalogHash" }),
  ]);
  const pieces = await Promise.all(Array.from({ length: 42 }, async (_, i) => {
    const id = BigInt(i + 1);
    const [owner, price, preset, weight, unowned] = await Promise.all([
      publicClient.readContract({ address: d.brain, abi: brainAbi, functionName: "ownerOf", args: [id] }),
      publicClient.readContract({ address: d.brain, abi: brainAbi, functionName: "currentPrice", args: [id] }),
      publicClient.readContract({ address: d.brain, abi: brainAbi, functionName: "selectedPreset", args: [id] }),
      publicClient.readContract({ address: d.brain, abi: brainAbi, functionName: "immutableWeight", args: [id] }),
      publicClient.readContract({ address: d.brain, abi: brainAbi, functionName: "isUnowned", args: [id] }),
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
      category: definition.category,
      options: definition.options,
      data: definition.data,
      tags: definition.tags ?? [],
    };
  }));
  const ownedPieceIds = address
    ? pieces.filter((piece) => piece.owner.toLowerCase() === address.toLowerCase()).map((piece) => BigInt(piece.id))
    : [];
  const pendingRewards = address
    ? await publicClient.readContract({ address: d.rewards, abi: rewardAbi, functionName: "pendingRewards", args: [address, ownedPieceIds] })
    : 0n;
  return { deployment: d, nav: nav.toString(), supply: supply.toString(), shares: shares.toString(), holdings: { USDG: usdgBalance.toString(), NVDA: nvdaBalance.toString(), AAPL: aaplBalance.toString(), ETHX: ethxBalance.toString() }, pieces, rewards: { pending: pendingRewards.toString() }, catalog: { version: Number(catalogVersion), hash: catalogHash }, browserRpcUrl: process.env.NEXT_PUBLIC_MDB_RPC_URL ?? rpcUrl };
}

export const mintAbi = parseAbi(["function mint(address to, uint256 amount)"]);
