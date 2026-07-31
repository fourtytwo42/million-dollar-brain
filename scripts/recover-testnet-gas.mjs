#!/usr/bin/env node
import {
  createPublicClient,
  createWalletClient,
  formatEther,
  http,
  keccak256,
  stringToHex,
} from "viem";
import { nonceManager, privateKeyToAccount } from "viem/accounts";

const EXPECTED_CHAIN_ID = 46_630;
const ACTOR_COUNT = 3;
const secret = process.env.MDB_CYCLE_TOKEN;
const rpcUrl = process.env.MDB_RPC_URL ?? "http://127.0.0.1:18548";
const destination = process.env.MDB_RECOVERY_DESTINATION;
const execute = process.env.MDB_RECOVER_TESTNET_GAS === "true";

if (!secret) throw new Error("MDB_CYCLE_TOKEN is required");
if (execute && !destination) {
  throw new Error("MDB_RECOVERY_DESTINATION is required for execution");
}

const publicClient = createPublicClient({ transport: http(rpcUrl) });
const chainId = await publicClient.getChainId();
if (chainId !== EXPECTED_CHAIN_ID) {
  throw new Error(`refusing chain ${chainId}; expected ${EXPECTED_CHAIN_ID}`);
}

const chain = {
  id: EXPECTED_CHAIN_ID,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
};
const fee = await publicClient.estimateFeesPerGas();
const maximumFeePerGas = fee.maxFeePerGas ?? fee.gasPrice;
if (!maximumFeePerGas) throw new Error("RPC did not return a usable gas price");

const results = [];
for (let index = 0; index < ACTOR_COUNT; index += 1) {
  const privateKey = keccak256(
    stringToHex(`${secret}:million-dollar-brain:endurance:${index}`),
  );
  const account = privateKeyToAccount(privateKey, { nonceManager });
  const balanceBefore = await publicClient.getBalance({
    address: account.address,
  });
  const record = {
    index,
    address: account.address,
    balanceBeforeWei: balanceBefore.toString(),
    balanceBeforeEth: formatEther(balanceBefore),
    recoveredWei: "0",
    transactionHash: null,
  };

  if (execute && balanceBefore > 0n) {
    const estimatedGas = await publicClient.estimateGas({
      account: account.address,
      to: destination,
      value: 1n,
    });
    const gasLimit = (estimatedGas * 125n + 99n) / 100n;
    const gasReserve = gasLimit * maximumFeePerGas;
    if (balanceBefore > gasReserve) {
      const value = balanceBefore - gasReserve;
      const walletClient = createWalletClient({
        account,
        chain,
        transport: http(rpcUrl),
      });
      const transactionHash = await walletClient.sendTransaction({
        account,
        chain,
        gas: gasLimit,
        maxFeePerGas: maximumFeePerGas,
        maxPriorityFeePerGas: fee.maxPriorityFeePerGas ?? 0n,
        to: destination,
        value,
      });
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: transactionHash,
      });
      if (receipt.status !== "success") {
        throw new Error(`recovery transaction ${transactionHash} failed`);
      }
      record.recoveredWei = value.toString();
      record.transactionHash = transactionHash;
    }
  }
  results.push(record);
}

console.log(
  JSON.stringify(
    {
      schema: "TestnetGasRecoveryV1",
      chainId,
      destination: destination ?? null,
      execute,
      actors: results,
      totalBalanceWei: results
        .reduce((total, actor) => total + BigInt(actor.balanceBeforeWei), 0n)
        .toString(),
      totalRecoveredWei: results
        .reduce((total, actor) => total + BigInt(actor.recoveredWei), 0n)
        .toString(),
    },
    null,
    2,
  ),
);
