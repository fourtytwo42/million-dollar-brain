import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_CUSTOM_PIECE_NAME_BYTES,
  normalizeProfileUrl,
  pieceDisplayName,
  profileUrlLabel,
  validateCustomPieceName,
} from "../apps/web/lib/piece-name.ts";

test("custom name overrides the immutable catalog name for presentation", () => {
  assert.equal(
    pieceDisplayName({
      name: "The Moon-Bull Department",
      customName: "Exit Liquidity Department",
    }),
    "Exit Liquidity Department",
  );
  assert.equal(
    pieceDisplayName({ name: "The Moon-Bull Department", customName: "" }),
    "The Moon-Bull Department",
  );
});

test("profile links normalize to safe bounded HTTPS URLs", () => {
  assert.equal(
    normalizeProfileUrl("example.com/braincell"),
    "https://example.com/braincell",
  );
  assert.equal(normalizeProfileUrl(""), "");
  assert.throws(() => normalizeProfileUrl("http://example.com"), /HTTPS/);
  assert.throws(
    () => normalizeProfileUrl("https://user:pass@example.com"),
    /without sign-in details/,
  );
  assert.equal(
    profileUrlLabel("https://example.com/braincell"),
    "example.com/braincell",
  );
});

test("piece names use the same byte-level constraints as the contract", () => {
  assert.equal(validateCustomPieceName("The Last Braincell"), null);
  assert.equal(validateCustomPieceName(""), "Enter a name.");
  assert.match(validateCustomPieceName(" padded") ?? "", /beginning or end/);
  assert.match(validateCustomPieceName("bad\u0000name") ?? "", /Control/);
  assert.equal(
    validateCustomPieceName("a".repeat(MAX_CUSTOM_PIECE_NAME_BYTES)),
    null,
  );
  assert.match(
    validateCustomPieceName("🚀".repeat(13)) ?? "",
    /48 UTF-8 bytes/,
  );
});
