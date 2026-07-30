import {
  BRAIN_PROFILE_CATALOG,
  BRAIN_PROFILE_CATALOG_HASH,
  BRAIN_PROFILE_CATALOG_VERSION,
} from "./brain-profile-catalog.generated.ts";

export type BrainPersonaV1 = {
  accent: number;
  badge: number;
  voice: number;
  victoryLine: number;
  panicLine: number;
  rivalPieceId: number;
  allyPieceId: number;
  reaction: number;
};

export const DEFAULT_BRAIN_PERSONA: BrainPersonaV1 = {
  accent: 0,
  badge: 0,
  voice: 0,
  victoryLine: 0,
  panicLine: 0,
  rivalPieceId: 0,
  allyPieceId: 0,
  reaction: 0,
};

export function packBrainPersona(persona: BrainPersonaV1): bigint {
  const values = [
    persona.accent,
    persona.badge,
    persona.voice,
    persona.victoryLine,
    persona.panicLine,
    persona.rivalPieceId,
    persona.allyPieceId,
    persona.reaction,
  ];
  return values.reduce(
    (packed, value, index) => packed | (BigInt(value) << BigInt(index * 8)),
    0n,
  );
}

export function unpackBrainPersona(value: bigint): BrainPersonaV1 {
  const slot = (index: number) => Number((value >> BigInt(index * 8)) & 0xffn);
  return {
    accent: slot(0),
    badge: slot(1),
    voice: slot(2),
    victoryLine: slot(3),
    panicLine: slot(4),
    rivalPieceId: slot(5),
    allyPieceId: slot(6),
    reaction: slot(7),
  };
}

export function validateBrainPersona(pieceId: number, persona: BrainPersonaV1) {
  const bounded = [
    [persona.accent, BRAIN_PROFILE_CATALOG.accents.length, "accent"],
    [persona.badge, BRAIN_PROFILE_CATALOG.badges.length, "badge"],
    [persona.voice, BRAIN_PROFILE_CATALOG.voices.length, "voice"],
    [persona.victoryLine, BRAIN_PROFILE_CATALOG.victoryLineCount, "victory line"],
    [persona.panicLine, BRAIN_PROFILE_CATALOG.panicLineCount, "panic line"],
    [persona.reaction, BRAIN_PROFILE_CATALOG.reactions.length, "reaction"],
  ] as const;
  for (const [value, count, label] of bounded) {
    if (!Number.isInteger(value) || value < 0 || value >= count) {
      throw new Error(`Invalid ${label}.`);
    }
  }
  for (const [value, label] of [
    [persona.rivalPieceId, "rival"],
    [persona.allyPieceId, "ally"],
  ] as const) {
    if (!Number.isInteger(value) || value < 0 || value > 42) {
      throw new Error(`Invalid ${label}.`);
    }
    if (value === pieceId) throw new Error(`A braincell cannot be its own ${label}.`);
  }
  if (
    persona.rivalPieceId !== 0 &&
    persona.rivalPieceId === persona.allyPieceId
  ) {
    throw new Error("Rival and ally must be different braincells.");
  }
}

export {
  BRAIN_PROFILE_CATALOG,
  BRAIN_PROFILE_CATALOG_HASH,
  BRAIN_PROFILE_CATALOG_VERSION,
};
