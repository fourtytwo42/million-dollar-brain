import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  stringToHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  defaultControlBundle,
  packAssetIds,
  packScalars,
} from "../apps/web/lib/brain-controls.ts";
import { brainControlAbi } from "../apps/web/lib/abi.ts";

const chainId = 46_630;
const pieces = new Set([4, 6, 38]);
const secret = process.env.MDB_CYCLE_TOKEN;
const rpcUrl = process.env.MDB_RPC_URL;

if (process.env.MDB_TESTNET_CADENCE_REPAIR !== "true" || !secret || !rpcUrl) {
  throw new Error("explicit testnet cadence repair authorization is required");
}

const chain = defineChain({
  id: chainId,
  name: "Robinhood Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
if ((await publicClient.getChainId()) !== chainId) {
  throw new Error("wrong chain");
}

const response = await fetch("http://127.0.0.1:3001/api/status", {
  cache: "no-store",
});
if (!response.ok) throw new Error(`status returned ${response.status}`);
const status = (await response.json()) as {
  deployment: { brainControlRegistry?: `0x${string}` };
  pieces: {
    id: number;
    owner: `0x${string}`;
    controlBundle: { values: number[]; assetIds: number[] };
  }[];
};
const registry = status.deployment.brainControlRegistry;
if (!registry) throw new Error("control registry is unavailable");

const accounts = [0, 1, 2].map((index) =>
  privateKeyToAccount(
    keccak256(stringToHex(`${secret}:million-dollar-brain:endurance:${index}`)),
  ),
);
const accountByAddress = new Map(
  accounts.map((account) => [account.address.toLowerCase(), account]),
);

for (const piece of status.pieces.filter((candidate) =>
  pieces.has(candidate.id),
)) {
  const account = accountByAddress.get(piece.owner.toLowerCase());
  if (!account) {
    throw new Error(`Piece ${piece.id} is not owned by an endurance actor`);
  }
  const nextBundle = {
    ...piece.controlBundle,
    values: [...piece.controlBundle.values],
    assetIds: [...piece.controlBundle.assetIds],
  };
  nextBundle.values[0] = defaultControlBundle(piece.id).values[0];
  const client = createWalletClient({
    account,
    chain,
    transport: http(rpcUrl),
  });
  const hash = await client.writeContract({
    account,
    address: registry,
    abi: brainControlAbi,
    functionName: "setControlBundle",
    args: [
      BigInt(piece.id),
      packScalars(nextBundle.values),
      packAssetIds(nextBundle.assetIds),
    ],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`Piece ${piece.id} cadence repair failed`);
  }
  console.log(`Piece ${piece.id} cadence restored: ${hash}`);
}
