import { keccak256, stringToHex, type Address } from "viem";
import {
  canonicalAssetId,
  validateAssetManifest,
  type AssetRecordV1,
} from "./asset-universe.ts";
import { stableDecisionJson } from "./decision-math.ts";

type RobinhoodAssetResponse = {
  assets: {
    id: string;
    tokenSymbol: string;
    tokenName: string;
    deployments?: { contractAddress: Address; chainId: number }[];
    status: string;
    tradingCapabilities?: Record<string, unknown> | null;
  }[];
};

export type DiscoverySnapshotV1 = {
  schemaVersion: 1;
  generatedAt: string;
  chainId: 4663;
  source: "robinhood-official-assets";
  sourceHash: string;
  records: AssetRecordV1[];
};

export const ROBINHOOD_MAINNET_USDG =
  "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address;
export const ROBINHOOD_MAINNET_WETH =
  "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as Address;

function discoveredRecord(
  chainId: number,
  address: Address,
  symbol: string,
  name: string,
  robinhoodUid: string | null,
  kind: AssetRecordV1["kind"],
): AssetRecordV1 {
  return {
    id: canonicalAssetId(chainId, address),
    chainId,
    address,
    symbol,
    name,
    robinhoodUid,
    kind,
    riskClass:
      kind === "crypto"
        ? "high_volatility"
        : kind === "reserve"
          ? "reserve"
          : "standard",
    tags: [kind, ...(robinhoodUid ? ["robinhood_canonical"] : [])],
    decimals: 18,
    maximumWeightBps: kind === "reserve" ? 10_000 : 2_000,
    valuationAdapter: null,
    executionAdapter: null,
    circulatingSupplyAdapter: null,
    canonicalSource: robinhoodUid
      ? "https://api.robinhood.com/rhj/assets"
      : "https://docs.robinhood.com/chain/connecting/",
    qualification: null,
    active: false,
  };
}

export async function discoverRobinhoodMainnetAssets(): Promise<DiscoverySnapshotV1> {
  const response = await fetch("https://api.robinhood.com/rhj/assets", {
    headers: {
      accept: "application/json",
      "user-agent": "MillionDollarBrain/1.0",
    },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(`Robinhood assets returned ${response.status}`);
  const payload = (await response.json()) as RobinhoodAssetResponse;
  const records = payload.assets.flatMap((asset) => {
    const deployment = asset.deployments?.find(
      (candidate) => candidate.chainId === 4663,
    );
    if (!deployment || asset.status !== "ASSET_STATUS_ACTIVE") return [];
    return [
      discoveredRecord(
        4663,
        deployment.contractAddress,
        asset.tokenSymbol,
        asset.tokenName,
        asset.id,
        "stock",
      ),
    ];
  });
  records.push(
    discoveredRecord(
      4663,
      ROBINHOOD_MAINNET_USDG,
      "USDG",
      "Global Dollar",
      null,
      "reserve",
    ),
    discoveredRecord(
      4663,
      ROBINHOOD_MAINNET_WETH,
      "WETH",
      "Wrapped Ether",
      null,
      "crypto",
    ),
  );
  validateAssetManifest(records, 4663);
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    chainId: 4663,
    source: "robinhood-official-assets",
    sourceHash: keccak256(stringToHex(stableDecisionJson(payload))),
    records,
  };
}

export function applyApprovedAssetManifest(
  discovered: AssetRecordV1[],
  approved: AssetRecordV1[],
) {
  const canonical = new Map(discovered.map((asset) => [asset.id, asset]));
  for (const asset of approved) {
    const source = canonical.get(asset.id);
    if (!source)
      throw new Error(
        `approved asset is not in canonical discovery: ${asset.id}`,
      );
    if (
      source.robinhoodUid &&
      source.robinhoodUid.toLowerCase() !== asset.robinhoodUid?.toLowerCase()
    ) {
      throw new Error(`Robinhood UID mismatch: ${asset.id}`);
    }
  }
  return validateAssetManifest(approved, 4663);
}
