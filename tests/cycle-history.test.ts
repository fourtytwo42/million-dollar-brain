import assert from "node:assert/strict";
import test from "node:test";
import { cycleSelectionKey } from "../apps/web/lib/cycle-history.ts";

test("executed cycles keep their transaction hash as the deep-link identity", () => {
  assert.equal(
    cycleSelectionKey({
      txHash: "0xabc",
      inputHash: "0xinput",
      at: "2026-07-30T08:00:00.000Z",
    }),
    "0xabc",
  );
});

test("HOLD cycles receive distinct stable identities", () => {
  const first = cycleSelectionKey({
    txHash: null,
    inputHash: "0xsame-input",
    at: "2026-07-30T08:00:00.000Z",
  });
  const second = cycleSelectionKey({
    txHash: null,
    inputHash: "0xsame-input",
    at: "2026-07-30T09:00:00.000Z",
  });

  assert.notEqual(first, second);
  assert.equal(first, "hold:0xsame-input:2026-07-30T08:00:00.000Z");
});

test("legacy HOLD cycles without input hashes remain selectable", () => {
  assert.equal(
    cycleSelectionKey({
      txHash: null,
      at: "2026-07-30T10:00:00.000Z",
    }),
    "hold:legacy:2026-07-30T10:00:00.000Z",
  );
  assert.equal(cycleSelectionKey(null), null);
});
