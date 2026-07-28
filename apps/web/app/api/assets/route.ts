import { NextResponse } from "next/server";
import { discoverRobinhoodMainnetAssets } from "@/lib/asset-discovery";
import { qualificationStatus } from "@/lib/asset-universe";
import { networkConfig } from "@/lib/network";
import { loadAssetCandidates } from "@/lib/persistence";

export const runtime = "nodejs";

export async function GET() {
  try {
    const registryChainId =
      networkConfig.mode === "local" ? networkConfig.chainId : 4663;
    const stored = await loadAssetCandidates(registryChainId);
    if (stored.length > 0) {
      return NextResponse.json({
        network: networkConfig.mode,
        registryChainId,
        source: "postgresql-qualified-registry",
        assets: stored.map((asset) => ({
          ...asset,
          eligibility: qualificationStatus(asset, asset.qualification),
        })),
      });
    }
    if (networkConfig.mode === "local") {
      return NextResponse.json({
        network: "local",
        registryChainId,
        source: "legacy-local-manifest",
        assets: [],
      });
    }
    const discovery = await discoverRobinhoodMainnetAssets();
    return NextResponse.json({
      network: networkConfig.mode,
      registryChainId,
      source: discovery.source,
      sourceHash: discovery.sourceHash,
      generatedAt: discovery.generatedAt,
      assets: discovery.records.map((asset) => ({
        ...asset,
        eligibility: qualificationStatus(asset, asset.qualification),
      })),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "asset registry unavailable",
      },
      { status: 503 },
    );
  }
}
