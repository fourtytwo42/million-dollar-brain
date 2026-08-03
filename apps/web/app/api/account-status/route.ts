import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { accountDashboard } from "@/lib/chain";
import { snapshotStatusResponse } from "@/lib/dex-nav-snapshot";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const address = request.nextUrl.searchParams.get("address");
  if (!address || !isAddress(address)) {
    return NextResponse.json(
      { error: "valid address required" },
      { status: 400 },
    );
  }
  try {
    const status = snapshotStatusResponse();
    const pieces = Array.isArray(status?.pieces)
      ? (status.pieces as Array<{ id: number; owner: string }>)
      : [];
    const ownedPieceIds = pieces
      .filter(
        (piece: { id: number; owner: string }) =>
          piece.owner.toLowerCase() === address.toLowerCase(),
      )
      .map((piece: { id: number }) => BigInt(piece.id));
    const result = await accountDashboard(address, ownedPieceIds);
    return NextResponse.json(result, {
      headers: { "cache-control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "account status unavailable",
      },
      { status: 503 },
    );
  }
}
