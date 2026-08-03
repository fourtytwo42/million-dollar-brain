import { NextResponse } from "next/server";
import { snapshotStatusResponse } from "@/lib/dex-nav-snapshot";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const status = snapshotStatusResponse();
  if (!status) {
    return NextResponse.json(
      {
        error: "No backend DEX snapshot is available yet.",
        dexSnapshot: {
          schemaVersion: 1,
          state: "unavailable",
          reasonCodes: ["snapshot_missing"],
        },
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }
  return NextResponse.json(status, {
    headers: {
      "cache-control": "public, max-age=5, stale-while-revalidate=30",
      etag: `"${status.dexSnapshot.snapshotHash}"`,
    },
  });
}
