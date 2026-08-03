import { NextRequest, NextResponse } from "next/server";
import { refreshDexNavSnapshot } from "@/lib/dex-nav-snapshot";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const expected =
    process.env.MDB_SNAPSHOT_TOKEN ?? process.env.MDB_COLLECTOR_TOKEN;
  if (expected && request.headers.get("x-mdb-snapshot-token") !== expected) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const snapshot = await refreshDexNavSnapshot();
    return NextResponse.json({
      snapshotHash: snapshot.snapshotHash,
      observedAt: snapshot.observedAt,
      blockNumber: snapshot.blockNumber,
      state: snapshot.state,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "snapshot refresh failed",
      },
      { status: 503 },
    );
  }
}
