import assert from "node:assert/strict";
import test from "node:test";
import { withAdminTransactionLock } from "../apps/web/lib/admin-transaction-lock.ts";

test("operator transactions execute sequentially", async () => {
  const events: string[] = [];
  await Promise.all([
    withAdminTransactionLock(async () => {
      events.push("first-start");
      await new Promise((resolve) => setTimeout(resolve, 10));
      events.push("first-end");
    }),
    withAdminTransactionLock(async () => {
      events.push("second-start");
      events.push("second-end");
    }),
  ]);
  assert.deepEqual(events, [
    "first-start",
    "first-end",
    "second-start",
    "second-end",
  ]);
});

test("a failed operator transaction releases the lock", async () => {
  await assert.rejects(
    withAdminTransactionLock(async () => {
      throw new Error("expected failure");
    }),
    /expected failure/,
  );
  assert.equal(
    await withAdminTransactionLock(async () => "continued"),
    "continued",
  );
});
