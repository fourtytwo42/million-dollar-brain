import { NextRequest, NextResponse } from "next/server";
import { buildTestnetSwapPlans } from "@/lib/quote-planner";
import { networkConfig } from "@/lib/network";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    if (networkConfig.mode !== "testnet") {
      return NextResponse.json(
        { error: "signed swap plans are enabled only for V3 testnet replicas" },
        { status: 409 },
      );
    }
    const body = (await request.json()) as {
      action?: unknown;
      amount?: unknown;
    };
    if (body.action !== "deposit" && body.action !== "redeem") {
      throw new Error("action must be deposit or redeem");
    }
    if (typeof body.amount !== "string" || !/^[1-9][0-9]*$/.test(body.amount)) {
      throw new Error("amount must be a positive integer string");
    }
    const quote = await buildTestnetSwapPlans(body.action, BigInt(body.amount));
    return NextResponse.json(quote, {
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "quote unavailable" },
      { status: 422 },
    );
  }
}
