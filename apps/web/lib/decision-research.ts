import {
  ASSET_POLICY,
  type AssetRecordV1,
  type CompactAssetV1,
} from "./asset-universe.ts";

export type ResearchRequestV1 = {
  assetId: string;
  topics: (
    | "identity"
    | "price_history"
    | "fundamentals"
    | "corporate_actions"
    | "onchain_supply"
    | "holders"
    | "liquidity"
    | "portfolio_history"
  )[];
};

export type ResearchResultV1 = {
  assetId: string;
  requestedTopics: ResearchRequestV1["topics"];
  generatedAt: string;
  sources: string[];
  evidence: Record<string, unknown>;
  unavailable: string[];
};

export type AllocatorResearchEnvelope =
  | { kind: "research"; requests: ResearchRequestV1[] }
  | { kind: "allocation"; allocation: Record<string, number> };

const TOPICS = new Set<ResearchRequestV1["topics"][number]>([
  "identity",
  "price_history",
  "fundamentals",
  "corporate_actions",
  "onchain_supply",
  "holders",
  "liquidity",
  "portfolio_history",
]);

export function validateResearchRequests(
  requests: unknown,
  eligibleAssets: AssetRecordV1[],
) {
  if (!Array.isArray(requests))
    throw new Error("research requests are not an array");
  if (
    requests.length === 0 ||
    requests.length > ASSET_POLICY.maximumResearchAssets
  ) {
    throw new Error("research is limited to 1-16 assets");
  }
  const eligible = new Set(
    eligibleAssets.filter((asset) => asset.active).map((asset) => asset.id),
  );
  const seen = new Set<string>();
  return requests.map((request): ResearchRequestV1 => {
    if (!request || typeof request !== "object")
      throw new Error("invalid research request");
    const candidate = request as { assetId?: unknown; topics?: unknown };
    if (
      typeof candidate.assetId !== "string" ||
      !eligible.has(candidate.assetId)
    ) {
      throw new Error("research requested an unknown or inactive asset");
    }
    if (seen.has(candidate.assetId))
      throw new Error("duplicate research asset");
    seen.add(candidate.assetId);
    if (!Array.isArray(candidate.topics) || candidate.topics.length === 0) {
      throw new Error("research topics are required");
    }
    const topics = [...new Set(candidate.topics)].map((topic) => {
      if (typeof topic !== "string" || !TOPICS.has(topic as never)) {
        throw new Error(`unsupported research topic: ${String(topic)}`);
      }
      return topic as ResearchRequestV1["topics"][number];
    });
    return { assetId: candidate.assetId, topics };
  });
}

export function buildStructuredResearchResults(
  requests: ResearchRequestV1[],
  assets: AssetRecordV1[],
  compact: CompactAssetV1[],
  detailed: { id: string; [key: string]: unknown }[],
): ResearchResultV1[] {
  const records = new Map(assets.map((asset) => [asset.id, asset]));
  const compactRows = new Map(compact.map((asset) => [asset.id, asset]));
  const detailedRows = new Map(detailed.map((asset) => [asset.id, asset]));
  const generatedAt = new Date().toISOString();
  return requests.map((request) => {
    const asset = records.get(request.assetId)!;
    const evidence: Record<string, unknown> = {};
    const unavailable: string[] = [];
    const detail = detailedRows.get(request.assetId);
    for (const topic of request.topics) {
      if (topic === "identity") {
        evidence.identity = {
          chainId: asset.chainId,
          address: asset.address,
          robinhoodUid: asset.robinhoodUid,
          kind: asset.kind,
          canonicalSource: asset.canonicalSource,
        };
      } else if (topic === "liquidity") {
        evidence.liquidity = {
          compact: compactRows.get(request.assetId) ?? null,
          qualification: asset.qualification,
        };
      } else if (detail && topic in detail) {
        evidence[topic] = detail[topic];
      } else if (detail) {
        evidence[topic] = detail;
      } else {
        unavailable.push(topic);
      }
    }
    return {
      assetId: request.assetId,
      requestedTopics: request.topics,
      generatedAt,
      sources: [
        asset.canonicalSource,
        "onchain-registry",
        "mdb-postgresql-history",
      ],
      evidence,
      unavailable,
    };
  });
}
