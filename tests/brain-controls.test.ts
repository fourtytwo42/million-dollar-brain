import assert from "node:assert/strict";
import test from "node:test";
import {
  BRAIN_CONTROL_CATALOG,
  controlCatalogHash,
  controlSpec,
  defaultControlBundle,
  migrateLegacyPreset,
  packAssetIds,
  packScalars,
  scalarMaximums,
  summarizeControlBundle,
  unpackAssetIds,
  unpackScalars,
  validateControlBundle,
} from "../apps/web/lib/brain-controls.ts";

test("Control Catalog v1 contains canonical IDs 1 through 42", () => {
  assert.equal(BRAIN_CONTROL_CATALOG.length, 42);
  assert.deepEqual(
    BRAIN_CONTROL_CATALOG.map((piece) => piece.id),
    Array.from({ length: 42 }, (_, index) => index + 1),
  );
  assert.equal(
    new Set(BRAIN_CONTROL_CATALOG.map((piece) => piece.summary)).size,
    42,
  );
  for (const piece of BRAIN_CONTROL_CATALOG) {
    assert.ok(piece.controls.length >= 4);
    assert.equal(piece.controls.length, piece.defaults.length);
    assert.equal(
      validateControlBundle(piece.id, defaultControlBundle(piece.id)).length,
      0,
    );
  }
  assert.match(controlCatalogHash(), /^0x[0-9a-f]{64}$/);
});

test("packed scalar and asset bundles round-trip exactly", () => {
  const scalars = [20, 15, 10, 10, 15, 10, 10, 10, 1, 92, 3, 3];
  assert.deepEqual(unpackScalars(packScalars(scalars), 12), scalars);
  const assets = [1, 2, 3, 4];
  assert.deepEqual(unpackAssetIds(packAssetIds(assets)), assets);
});

test("legacy presets deterministically map into valid bundles", () => {
  for (let pieceId = 1; pieceId <= 42; pieceId += 1) {
    for (let preset = 0; preset <= 4; preset += 1) {
      const bundle = migrateLegacyPreset(pieceId, preset);
      assert.deepEqual(validateControlBundle(pieceId, bundle), []);
      const maximums = scalarMaximums(pieceId);
      bundle.values.forEach((value, index) =>
        assert.ok(value >= 0 && value <= maximums[index]),
      );
    }
  }
});

test("sector directives require a target and reject duplicate favorites", () => {
  const missingTarget = defaultControlBundle(21);
  missingTarget.values[4] = 2;
  assert.ok(
    validateControlBundle(21, missingTarget).some((error) =>
      error.includes("target"),
    ),
  );

  const duplicate = defaultControlBundle(21);
  duplicate.assetIds = [2, 2, 0, 0];
  assert.ok(
    validateControlBundle(21, duplicate).some((error) =>
      error.includes("repeated"),
    ),
  );
});

test("Data-Diet Chef enforces exactly 100 attention points", () => {
  const bundle = defaultControlBundle(42);
  bundle.values[0] += 1;
  assert.ok(
    validateControlBundle(42, bundle).some((error) => error.includes("100")),
  );
  assert.match(
    summarizeControlBundle(42, defaultControlBundle(42)),
    /Price and technical 20%/,
  );
});

test("representative complex controls expose the intended shapes", () => {
  assert.equal(controlSpec(4).controls[0].options?.length, 6);
  assert.equal(controlSpec(21).assetTag, "ai_semiconductor");
  assert.equal(controlSpec(29).assetTag, "communications");
  assert.equal(controlSpec(38).controls[0].options?.length, 5);
  assert.equal(controlSpec(39).controls[4].options?.at(-1)?.label, "4");
  assert.equal(controlSpec(42).controls.length, 12);
});
