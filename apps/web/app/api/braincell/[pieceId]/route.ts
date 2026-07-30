import { NextRequest, NextResponse } from "next/server";
import { parseAbiItem, toEventSelector, toHex } from "viem";
import { dashboard, deployment, publicClient } from "@/lib/chain";
import { unpackBrainPersona } from "@/lib/brain-profile";

export const runtime = "nodejs";

const purchaseEvent = parseAbiItem(
  "event PiecePurchased(uint256 indexed pieceId,address indexed buyer,address indexed seller,uint256 paid,uint256 nextPrice)",
);
const profileEvent = parseAbiItem(
  "event ProfileChangedV2(uint256 indexed pieceId,address indexed owner,uint64 indexed ownershipSerial,bytes32 portraitHash,string customName,string profileUrl,string customTagline,uint64 personaPack,uint16 catalogVersion)",
);
const moderationEvent = parseAbiItem(
  "event ProfileModerated(uint256 indexed pieceId,address indexed moderator,address indexed owner,uint8 fieldMask,uint64 ownershipSerial)",
);

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ pieceId: string }> },
) {
  const { pieceId: rawPieceId } = await context.params;
  const pieceId = Number(rawPieceId);
  if (!Number.isInteger(pieceId) || pieceId < 1 || pieceId > 42)
    return NextResponse.json(
      { error: "Invalid braincell ID." },
      { status: 400 },
    );

  const [state, latestBlock] = await Promise.all([
    dashboard(),
    publicClient.getBlockNumber(),
  ]);
  const piece = state.pieces.find((candidate) => candidate.id === pieceId);
  if (!piece)
    return NextResponse.json(
      { error: "Braincell not found." },
      { status: 404 },
    );

  const fromBlock = latestBlock > 250_000n ? latestBlock - 250_000n : 0n;
  const address = deployment().brain;
  const pieceTopic = toHex(BigInt(pieceId), { size: 32 });
  const selectors = {
    purchase: toEventSelector(purchaseEvent),
    profile: toEventSelector(profileEvent),
    moderation: toEventSelector(moderationEvent),
  };
  const rawLogs = (await publicClient.request({
    method: "eth_getLogs",
    params: [
      {
        address,
        fromBlock: toHex(fromBlock),
        toBlock: toHex(latestBlock),
        topics: [
          [selectors.purchase, selectors.profile, selectors.moderation],
          pieceTopic,
        ],
      },
    ],
  })) as {
    transactionHash: `0x${string}`;
    blockNumber: `0x${string}`;
    logIndex: `0x${string}`;
    data: `0x${string}`;
    topics: `0x${string}`[];
  }[];
  const compact = (log: (typeof rawLogs)[number]) => ({
    transactionHash: log.transactionHash,
    blockNumber: BigInt(log.blockNumber).toString(),
    logIndex: Number(BigInt(log.logIndex)),
    data: log.data,
  });
  const matching = (selector: `0x${string}`) =>
    rawLogs
      .filter(
        (log) =>
          log.topics[0]?.toLowerCase() === selector.toLowerCase() &&
          log.topics[1]?.toLowerCase() === pieceTopic.toLowerCase(),
      )
      .slice(-20)
      .reverse()
      .map(compact);

  return NextResponse.json({
    pieceId,
    network: state.network.mode,
    profile: {
      owner: piece.owner,
      ownershipSerial: piece.ownershipSerial,
      name: piece.customName,
      portraitHash: piece.portraitHash,
      url: piece.profileUrl,
      tagline: piece.customTagline,
      persona: unpackBrainPersona(BigInt(piece.personaPack)),
      profileChangeAvailable: piece.profileChangeAvailable,
      ownerCustomized: piece.ownerCustomized,
    },
    history: {
      purchases: matching(selectors.purchase),
      profiles: matching(selectors.profile),
      moderation: matching(selectors.moderation),
    },
    evidence: {
      profileCatalogVersion: state.profileCatalog.catalogVersion,
      profileCatalogHash: state.profileCatalog.catalogHash,
      latestBlock: latestBlock.toString(),
      fromBlock: fromBlock.toString(),
      matchedEventCount: rawLogs.length,
    },
  });
}
