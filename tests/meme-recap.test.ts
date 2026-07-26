import assert from "node:assert/strict";
import test from "node:test";
import {
  CHARACTER_ROSTER_VERSION,
  generateMemeRecap,
  MEME_CHARACTERS,
  type MemeBrainInput,
} from "../apps/web/lib/brain-meme.ts";

const brain = (overrides: Partial<MemeBrainInput>[] = []): MemeBrainInput[] =>
  MEME_CHARACTERS.map((profile, index) => ({
    id: profile.id,
    character: profile.name,
    selectedOption: "Neutral Ground",
    signedValue: 0,
    weightedValue: 0,
    weightBps: index < 6 ? 500 : index < 18 ? 300 : index < 34 ? 150 : 100,
    active: true,
    ...(overrides[index] ?? {}),
  }));

test("roster v4 has the locked cast ratio and valid identities", () => {
  assert.equal(CHARACTER_ROSTER_VERSION, 4);
  assert.equal(MEME_CHARACTERS.length, 42);
  assert.equal(
    MEME_CHARACTERS.filter((profile) => profile.kind === "human").length,
    10,
  );
  assert.equal(
    MEME_CHARACTERS.filter((profile) => profile.kind !== "human").length,
    32,
  );
  assert.equal(
    new Set(MEME_CHARACTERS.map((profile) => profile.name)).size,
    42,
  );
  for (const profile of MEME_CHARACTERS) {
    assert.equal(profile.catchphrases.length, 5);
    assert.equal(profile.rivals.length, 2);
    assert.ok(!profile.rivals.includes(profile.id));
    assert.ok(profile.rivals.every((id) => id >= 1 && id <= 42));
    assert.equal(MEME_CHARACTERS[profile.id - 1].id, profile.id);
  }
});

test("strongest active weighted mood becomes spokesperson", () => {
  const input = brain();
  input[0] = {
    ...input[0],
    selectedOption: "Moon With Seatbelts",
    signedValue: 2,
    weightedValue: 1000,
  };
  input[4] = {
    ...input[4],
    selectedOption: "Bunker Cash",
    signedValue: 2,
    weightedValue: 900,
  };
  const recap = generateMemeRecap(input, {
    USDG: 2000,
    NVDA: 3500,
    AAPL: 2000,
    ETHX: 2500,
  });
  assert.equal(recap.spokespersonPieceId, 1);
  assert.equal(recap.cast[0].line, "Moon has been approved.");
  assert.match(recap.headline, /NVDA/);
});

test("inactive pieces cannot become spokesperson", () => {
  const input = brain();
  input[0] = {
    ...input[0],
    signedValue: 2,
    weightedValue: 1000,
    active: false,
  };
  input[1] = {
    ...input[1],
    signedValue: -1,
    weightedValue: -500,
  };
  const recap = generateMemeRecap(input, { USDG: 10000 });
  assert.equal(recap.spokespersonPieceId, 2);
});

test("neutral and tied brains resolve deterministically by weight then id", () => {
  const neutral = generateMemeRecap(brain(), { USDG: 10000 });
  assert.equal(neutral.spokespersonPieceId, 1);
  const input = brain();
  input[0] = { ...input[0], signedValue: 1, weightedValue: 500 };
  input[1] = { ...input[1], signedValue: -1, weightedValue: -500 };
  const tied = generateMemeRecap(input, { USDG: 10000 });
  assert.equal(tied.spokespersonPieceId, 1);
});

test("recaps persist factual mood and influence while assigning fictional roles", () => {
  const input = brain();
  input[6] = {
    ...input[6],
    selectedOption: "Trend Is Friend",
    signedValue: 2,
    weightedValue: 600,
  };
  const recap = generateMemeRecap(input, {
    USDG: 2500,
    NVDA: 2500,
    AAPL: 2500,
    ETHX: 2500,
  });
  assert.equal(recap.cast[0].mood, "Trend Is Friend");
  assert.equal(recap.cast[0].influenceBps, 300);
  assert.match(recap.disclaimer, /not causal attribution/i);
  assert.ok(recap.cast.some((item) => item.role === "scapegoat"));
});
