import { NextResponse } from "next/server";
import { dashboard, deployment, deploymentAssets } from "@/lib/chain";
import {
  controlSpec,
  validateControlBundle,
  type BrainControlBundle,
} from "@/lib/brain-controls";
import { compileBrainV1 } from "@/lib/compiled-brain";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      pieceId?: unknown;
      bundle?: Partial<BrainControlBundle>;
    };
    const pieceId = Number(body.pieceId);
    if (!Number.isInteger(pieceId) || pieceId < 1 || pieceId > 42)
      return NextResponse.json({ error: "Invalid piece ID." }, { status: 400 });
    const bundle: BrainControlBundle = {
      schemaVersion: 1,
      values: Array.isArray(body.bundle?.values)
        ? body.bundle.values.map(Number)
        : [],
      assetIds: Array.isArray(body.bundle?.assetIds)
        ? body.bundle.assetIds.map(Number)
        : [],
    };
    const errors = validateControlBundle(pieceId, bundle);
    const state = await dashboard();
    const manifestAssets = deploymentAssets(deployment());
    const spec = controlSpec(pieceId);
    if (spec.assetTag) {
      const byControlId = new Map(
        manifestAssets.map((asset) => [asset.controlId, asset]),
      );
      for (const controlId of bundle.assetIds.filter(Boolean)) {
        const asset = byControlId.get(controlId);
        if (!asset || !(asset.tags ?? []).includes(spec.assetTag))
          errors.push(`Asset ${controlId} is not active for this braincell.`);
      }
    }
    if (errors.length) return NextResponse.json({ errors }, { status: 422 });
    const compiled = compileBrainV1(
      state.pieces.map((piece) => ({
        id: piece.id,
        weightBps: piece.weight,
        bundle: piece.id === pieceId ? bundle : piece.controlBundle,
      })),
      manifestAssets.map((asset, index) => ({
        id: asset.id,
        controlId: asset.controlId ?? index + 1,
        symbol: asset.symbol,
        kind: asset.kind,
        riskClass: asset.riskClass,
        active: true,
        tags: asset.tags ?? [],
        currentWeightBps: state.currentWeightsBps[asset.symbol] ?? 0,
      })),
    );
    return NextResponse.json({
      pieceId,
      schemaVersion: 1,
      catalogVersion: 1,
      compiled,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Preview failed." },
      { status: 500 },
    );
  }
}
