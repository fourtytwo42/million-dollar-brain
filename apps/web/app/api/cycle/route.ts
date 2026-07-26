import { NextRequest, NextResponse } from "next/server";
import { runCycle } from "@/lib/allocator";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  const expected = process.env.MDB_CYCLE_TOKEN;
  const token = request.headers.get("x-mdb-cycle-token");
  if (expected && token !== expected) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try { return NextResponse.json(await runCycle()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "cycle failed" }, { status: 500 }); }
}
