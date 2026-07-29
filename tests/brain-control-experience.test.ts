import assert from "node:assert/strict";
import test from "node:test";
import {
  BRAIN_CONTROL_EXPERIENCE,
  BRAIN_CONTROL_EXPERIENCE_VERSION,
  braincellDecree,
  experienceControls,
  experienceSummary,
  prepareExperienceBundle,
} from "../apps/web/lib/brain-control-experience.ts";
import {
  defaultControlBundle,
  validateControlBundle,
} from "../apps/web/lib/brain-controls.ts";

test("experience v2 exposes two or three distinct levers for all 42 pieces", () => {
  assert.equal(BRAIN_CONTROL_EXPERIENCE_VERSION, 2);
  assert.equal(BRAIN_CONTROL_EXPERIENCE.length, 42);
  for (const piece of BRAIN_CONTROL_EXPERIENCE) {
    const controls = experienceControls(piece.id);
    assert.ok(
      controls.length >= 2 && controls.length <= 3,
      `piece ${piece.id} exposes ${controls.length} controls`,
    );
    assert.equal(
      new Set(controls.map((control) => control.rawIndex)).size,
      controls.length,
      `piece ${piece.id} repeats a raw control`,
    );
    assert.ok(
      controls.every((control) => !/desk|sleeve/i.test(control.label)),
      `piece ${piece.id} leaks institutional placeholder language`,
    );
    assert.ok(
      controls
        .filter((control) => control.kind === "choice")
        .every((control) => (control.options?.length ?? 0) <= 4),
      `piece ${piece.id} exposes too many choices`,
    );
  }
});

test("opening experience v2 retires hidden knobs to canonical defaults", () => {
  const noisy = defaultControlBundle(21);
  noisy.values = [4, 4, 0, 0, 7, 3];
  noisy.assetIds = [1, 2, 3, 4];

  const prepared = prepareExperienceBundle(21, noisy);
  assert.deepEqual(prepared.values, [4, 2, 0, 3, 7, 0]);
  assert.deepEqual(prepared.assetIds, [0, 0, 0, 4]);
  assert.deepEqual(validateControlBundle(21, prepared), []);
});

test("decrees use character language and remain deterministic", () => {
  const bundle = prepareExperienceBundle(21, defaultControlBundle(21));
  bundle.values[0] = 3;
  bundle.values[2] = 1;
  bundle.values[4] = 3;
  bundle.assetIds[3] = 7;

  const first = braincellDecree(21, bundle, "NVDA");
  const second = braincellDecree(21, bundle, "NVDA");
  assert.equal(first, second);
  assert.match(first, /Wafer Cult/);
  assert.match(first, /NVDA is the chosen one/);
  assert.match(experienceSummary(21, bundle), /How devoted are we/);
  assert.deepEqual(validateControlBundle(21, bundle), []);
});
