import assert from "node:assert/strict";
import test from "node:test";
import {
  defaultPortraitUrl,
  EMPTY_PORTRAIT_HASH,
  portraitUrl,
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
