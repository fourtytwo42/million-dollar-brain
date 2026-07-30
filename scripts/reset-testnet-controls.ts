import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  stringToHex,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  defaultControlBundle,
  packAssetIds,
  packScalars,
} from "../apps/web/lib/brain-controls.ts";
import { brainControlAbi } from "../apps/web/lib/abi.ts";
import { stableDecisionJson } from "../apps/web/lib/decision-math.ts";

const CHAIN_ID = 46_630;
const EXPECTED_EXTERNAL_PIECE_ONE =
  "0x4365543D9e895bb48835CEcedf0903E8770A3A63";
const EXPECTED_ACTORS = new Set(
  [
    "0xC1e239684daFa9a3EbaC029Bc9bC84625870E213",
    "0xFe562E6F1387c5325818993347549A035D916bbb",
    "0xc94773E3872f68B78B95441c70bcF7d93b1c6021",
  ].map((address) => address.toLowerCase()),
);

const secret = process.env.MDB_CYCLE_TOKEN;
const rpcUrl = process.env.MDB_RPC_URL;
const deploymentFile =
  process.env.MDB_DEPLOYMENT_FILE ??
  "/home/hendo420/projects/million-dollar-brain/packages/contracts/deployments/testnet-v3.json";
const stateDir =
  process.env.MDB_STATE_DIR ??
  "/home/hendo420/projects/million-dollar-brain/var/testnet-v3";
if (!secret || !rpcUrl) throw new Error("testnet environment is incomplete");

const chain = defineChain({
  id: CHAIN_ID,
  name: "Robinhood Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
});
const publicClient = createPublicClient({ chain, transport: http(rpcUrl) });
const actorAccounts = [0, 1, 2].map((index) =>
  privateKeyToAccount(
    keccak256(stringToHex(`${secret}:million-dollar-brain:endurance:${index}`)),
  ),
);
if (
  actorAccounts.some(
    (account) => !EXPECTED_ACTORS.has(account.address.toLowerCase()),
  )
) {
  throw new Error("derived endurance actors do not match the approved owners");
}

const manifest = JSON.parse(readFileSync(deploymentFile, "utf8")) as {
  brainControlRegistry?: `0x${string}`;
  deployment?: { brainControlRegistry?: `0x${string}` };
};
const registry =
  manifest.brainControlRegistry ?? manifest.deployment?.brainControlRegistry;
if (!registry) throw new Error("control registry is absent from the manifest");

async function status() {
  const response = await fetch("http://127.0.0.1:3001/api/status", {
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`status endpoint returned ${response.status}`);
  return (await response.json()) as {
    supply: string;
    holdings: Record<string, string>;
    pieces: Record<string, unknown>[];
  };
}

function immutableSnapshot(value: Awaited<ReturnType<typeof status>>) {
  return {
    supply: value.supply,
    holdings: value.holdings,
    pieces: value.pieces.map((piece) => {
      const {
        controlBundle: _controlBundle,
        controlBundleHash: _controlBundleHash,
        controlSelectionVersion: _controlSelectionVersion,
        controlUpdatedAt: _controlUpdatedAt,
        ...preserved
      } = piece;
      return preserved;
    }),
  };
}

function snapshotHash(value: unknown) {
  return keccak256(stringToHex(stableDecisionJson(value)));
}

async function main() {
  const chainId = await publicClient.getChainId();
  if (chainId !== CHAIN_ID)
    throw new Error(`wrong chain ${chainId}; expected ${CHAIN_ID}`);
  const before = await status();
  const pieceOne = before.pieces.find((piece) => piece.id === 1);
  if (
    String(pieceOne?.owner).toLowerCase() !==
    EXPECTED_EXTERNAL_PIECE_ONE.toLowerCase()
  ) {
    throw new Error("Piece 1 is not owned by the approved external owner");
  }
  const actorPieces = before.pieces.filter((piece) =>
    EXPECTED_ACTORS.has(String(piece.owner).toLowerCase()),
  );
  if (actorPieces.length !== 41)
    throw new Error(
      `expected 41 actor-owned pieces, found ${actorPieces.length}`,
    );
  const unexpected = before.pieces.filter(
    (piece) =>
      piece.id !== 1 && !EXPECTED_ACTORS.has(String(piece.owner).toLowerCase()),
  );
  if (unexpected.length)
    throw new Error("a non-Piece-1 cell has an unexpected owner");

  const preview = actorPieces.map((piece) => {
    const pieceId = Number(piece.id);
    const bundle = defaultControlBundle(pieceId);
    const scalarPack = packScalars(bundle.values);
    const assetPack = packAssetIds(bundle.assetIds);
    return {
      pieceId,
      owner: piece.owner,
      scalarPack,
      assetPack,
      bundleHash: keccak256(
        stringToHex(
          stableDecisionJson({
            schemaVersion: bundle.schemaVersion,
            values: bundle.values,
            assetIds: bundle.assetIds,
          }),
        ),
      ),
    };
  });
  const runAt = new Date().toISOString().replaceAll(":", "-");
  mkdirSync(stateDir, { recursive: true });
  const evidencePath = `${stateDir}/control-reset-${runAt}.json`;
  const beforeImmutable = immutableSnapshot(before);
  const evidence: Record<string, unknown> = {
    schemaVersion: 1,
    chainId,
    registry,
    mode:
      process.env.MDB_TESTNET_CONTROL_RESET === "true"
        ? "broadcast"
        : "preview",
    pieceOne: { id: 1, owner: pieceOne?.owner },
    immutableStateHashBefore: snapshotHash(beforeImmutable),
    preview,
    transactions: [],
  };
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, {
    mode: 0o600,
  });
  console.log(`Reset preview written to ${evidencePath}`);
  console.log(
    `Piece 1 preserved; ${preview.length} actor-owned bundles validated.`,
  );
  for (const row of preview) {
    console.log(`${row.pieceId}\t${row.owner}\t${row.bundleHash}`);
  }
  if (process.env.MDB_TESTNET_CONTROL_RESET !== "true") {
    console.log(
      "Preview only. Set MDB_TESTNET_CONTROL_RESET=true to authorize.",
    );
    return;
  }
  const completionPath = `${stateDir}/control-reset-v1-complete.json`;
  try {
    readFileSync(completionPath);
    throw new Error("the one-time testnet control reset already completed");
  } catch (error) {
    if (
      error instanceof Error &&
      !("code" in error && error.code === "ENOENT")
    ) {
      throw error;
    }
  }

  const transactions: { pieceId: number; hash: Hex }[] = [];
  for (const account of actorAccounts) {
    const client = createWalletClient({
      account,
      chain,
      transport: http(rpcUrl),
    });
    for (const row of preview.filter(
      (candidate) =>
        String(candidate.owner).toLowerCase() === account.address.toLowerCase(),
    )) {
      const hash = await client.writeContract({
        account,
        address: registry,
        abi: brainControlAbi,
        functionName: "setControlBundle",
        args: [BigInt(row.pieceId), row.scalarPack, row.assetPack],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success")
        throw new Error(`reset transaction failed for Piece ${row.pieceId}`);
      transactions.push({ pieceId: row.pieceId, hash });
    }
  }
  const after = await status();
  const afterImmutable = immutableSnapshot(after);
  const afterImmutableHash = snapshotHash(afterImmutable);
  if (afterImmutableHash !== evidence.immutableStateHashBefore) {
    throw new Error("non-control state changed during reset");
  }
  for (const row of preview) {
    const piece = after.pieces.find(
      (candidate) => candidate.id === row.pieceId,
    );
    const expected = defaultControlBundle(row.pieceId);
    const actual = piece?.controlBundle as
      { values?: number[]; assetIds?: number[] } | undefined;
    if (
      stableDecisionJson(actual?.values ?? []) !==
        stableDecisionJson(expected.values) ||
      stableDecisionJson(actual?.assetIds ?? []) !==
        stableDecisionJson(expected.assetIds)
    ) {
      throw new Error(
        `Piece ${row.pieceId} did not persist canonical defaults`,
      );
    }
  }
  const completed = {
    ...evidence,
    completedAt: new Date().toISOString(),
    transactions,
    immutableStateHashAfter: afterImmutableHash,
    verification: {
      pieceOneUntouched:
        stableDecisionJson(pieceOne) ===
        stableDecisionJson(after.pieces.find((piece) => piece.id === 1)),
      actorBundleCount: preview.length,
      nonControlStatePreserved: true,
      immediateCycleTriggered: false,
    },
  };
  writeFileSync(evidencePath, `${JSON.stringify(completed, null, 2)}\n`, {
    mode: 0o600,
  });
  writeFileSync(completionPath, `${JSON.stringify(completed, null, 2)}\n`, {
    mode: 0o600,
  });
  console.log(`Reset completed with ${transactions.length} transactions.`);
}

await main();
