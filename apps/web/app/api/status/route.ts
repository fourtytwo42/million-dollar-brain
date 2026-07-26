import { NextRequest, NextResponse } from "next/server";
import { isAddress } from "viem";
import { dashboard } from "@/lib/chain";

export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const address = request.nextUrl.searchParams.get("address");
    return NextResponse.json(await dashboard(address && isAddress(address) ? address : undefined));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "status unavailable" }, { status: 503 });
  }
}
