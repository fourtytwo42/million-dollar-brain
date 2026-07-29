#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { keccak256, toHex } from "viem";
import {
  BRAIN_CONTROL_CATALOG,
  controlCatalogHash,
  migrateLegacyPreset,
  packAssetIds,
  packScalars,
  scalarMaximums,
} from "../apps/web/lib/brain-controls.ts";

const output = resolve(
  process.argv[2] ?? "packages/contracts/deployments/control-catalog-v1.json",
);
const migrationScalarPacks = [];
const migrationAssetPacks = [];
for (const piece of BRAIN_CONTROL_CATALOG) {
  for (let preset = 0; preset <= 4; preset += 1) {
    const bundle = migrateLegacyPreset(piece.id, preset);
    migrationScalarPacks.push(packScalars(bundle.values));
    migrationAssetPacks.push(packAssetIds(bundle.assetIds));
  }
}
const payload = {
  schemaVersion: 1,
  catalogVersion: 1,
  catalogHash: controlCatalogHash(),
  pieceIds: BRAIN_CONTROL_CATALOG.map((piece) => piece.id),
  scalarCounts: BRAIN_CONTROL_CATALOG.map((piece) => piece.controls.length),
  scalarMaximumPacks: BRAIN_CONTROL_CATALOG.map((piece) =>
    packScalars(scalarMaximums(piece.id)),
  ),
  requiredAssetTags: BRAIN_CONTROL_CATALOG.map((piece) =>
    piece.assetTag ? keccak256(toHex(piece.assetTag)) : `0x${"0".repeat(64)}`,
  ),
  migrationScalarPacks,
  migrationAssetPacks,
};
writeFileSync(output, `${JSON.stringify(payload, null, 2)}\n`);
console.log(`${payload.catalogHash} ${output}`);
