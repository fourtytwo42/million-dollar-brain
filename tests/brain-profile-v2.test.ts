import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  BRAIN_PROFILE_CATALOG,
  DEFAULT_BRAIN_PERSONA,
  packBrainPersona,
  unpackBrainPersona,
  validateBrainPersona,
} from "../apps/web/lib/brain-profile.ts";

test("profile catalog exposes the locked curated choice counts", () => {
  assert.equal(BRAIN_PROFILE_CATALOG.version, 1);
  assert.equal(BRAIN_PROFILE_CATALOG.accents.length, 8);
  assert.equal(BRAIN_PROFILE_CATALOG.badges.length, 12);
  assert.equal(BRAIN_PROFILE_CATALOG.voices.length, 5);
  assert.equal(BRAIN_PROFILE_CATALOG.reactions.length, 8);
});

test("persona pack round-trips every bounded field", () => {
  const persona = {
    accent: 7,
    badge: 11,
    voice: 4,
    victoryLine: 4,
    panicLine: 2,
    rivalPieceId: 41,
    allyPieceId: 42,
    reaction: 7,
  };
  assert.doesNotThrow(() => validateBrainPersona(1, persona));
  assert.deepEqual(unpackBrainPersona(packBrainPersona(persona)), persona);
  assert.deepEqual(
    unpackBrainPersona(packBrainPersona(DEFAULT_BRAIN_PERSONA)),
    DEFAULT_BRAIN_PERSONA,
  );
});

test("persona validation rejects invalid relationships and curated values", () => {
  assert.throws(
    () => validateBrainPersona(7, {
      ...DEFAULT_BRAIN_PERSONA,
      rivalPieceId: 7,
    }),
    /rival/i,
  );
  assert.throws(
    () => validateBrainPersona(7, {
      ...DEFAULT_BRAIN_PERSONA,
      rivalPieceId: 8,
      allyPieceId: 8,
    }),
    /different/i,
  );
  assert.throws(
    () => validateBrainPersona(7, {
      ...DEFAULT_BRAIN_PERSONA,
      accent: 8,
    }),
    /accent/i,
  );
});

test("free-form presentation fields are absent from AI context construction", () => {
  const contextSource = readFileSync(
    new URL("../apps/web/lib/decision-context.ts", import.meta.url),
    "utf8",
  );
  const allocatorSource = readFileSync(
    new URL("../apps/web/lib/allocator.ts", import.meta.url),
    "utf8",
  );
  for (const field of [
    "customTagline",
    "customName",
    "profileUrl",
    "portraitHash",
  ]) {
    assert.equal(contextSource.includes(field), false, `${field} entered context`);
    assert.equal(allocatorSource.includes(field), false, `${field} entered prompt`);
  }
  assert.equal(contextSource.includes("personaPack"), false);
});
