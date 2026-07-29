import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultPortraitUrl,
  EMPTY_PORTRAIT_HASH,
  isAnimatedWebp,
  portraitMediaType,
  portraitUrl,
  preserveAnimatedPortrait,
} from "../apps/web/lib/portrait.ts";

test("canonical portraits remain the fallback", () => {
  assert.equal(defaultPortraitUrl(1), "/brain-art/v4/piece-01.webp");
  assert.equal(
    portraitUrl({ id: 42, portraitHash: EMPTY_PORTRAIT_HASH }),
    "/brain-art/v4/piece-42.webp",
  );
});

test("custom portrait URLs are keyed by the exact on-chain hash", () => {
  const hash = `0x${"ab".repeat(32)}`;
  assert.equal(
    portraitUrl({ id: 7, portraitHash: hash }),
    `/api/brain-image/7?hash=${hash}`,
  );
});

test("GIF and animated WebP media are recognized without flattening", () => {
  const gif = new TextEncoder().encode("GIF89a");
  const animatedWebp = new Uint8Array([
    ...new TextEncoder().encode("RIFF"),
    12,
    0,
    0,
    0,
    ...new TextEncoder().encode("WEBP"),
    ...new TextEncoder().encode("ANIM"),
    4,
    0,
    0,
    0,
    0,
    0,
    0,
    0,
  ]);
  const staticWebp = new Uint8Array([
    ...new TextEncoder().encode("RIFF"),
    0,
    0,
    0,
    0,
    ...new TextEncoder().encode("WEBP"),
    ...new TextEncoder().encode("VP8 "),
    0,
    0,
    0,
    0,
  ]);

  assert.equal(portraitMediaType(gif), "image/gif");
  assert.equal(preserveAnimatedPortrait(gif), true);
  assert.equal(isAnimatedWebp(animatedWebp), true);
  assert.equal(preserveAnimatedPortrait(animatedWebp), true);
  assert.equal(isAnimatedWebp(staticWebp), false);
  assert.equal(preserveAnimatedPortrait(staticWebp), false);
});
