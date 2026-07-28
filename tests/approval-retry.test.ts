import assert from "node:assert/strict";
import test from "node:test";
import {
  isAllowancePropagationError,
  retryApprovalDependentWrite,
} from "../apps/web/lib/approval-retry.ts";

test("recognizes viem allowance selectors through nested causes", () => {
  const error = new Error("Contract write failed", {
    cause: { shortMessage: "reverted with signature 0xfb8f41b2" },
  });
  assert.equal(isAllowancePropagationError(error), true);
  assert.equal(isAllowancePropagationError(new Error("price changed")), false);
});

test("retries temporary approval propagation failures", async () => {
  let writes = 0;
  let sleeps = 0;
  const result = await retryApprovalDependentWrite(
    async () => {
      writes += 1;
      if (writes < 3) {
        throw new Error("ERC20InsufficientAllowance");
      }
      return "submitted";
    },
    {
      attempts: 4,
      delayMs: 1,
      sleep: async () => {
        sleeps += 1;
      },
    },
  );
  assert.equal(result, "submitted");
  assert.equal(writes, 3);
  assert.equal(sleeps, 2);
});

test("does not retry unrelated contract failures", async () => {
  let writes = 0;
  await assert.rejects(
    retryApprovalDependentWrite(
      async () => {
        writes += 1;
        throw new Error("price changed");
      },
      { sleep: async () => undefined },
    ),
    /price changed/,
  );
  assert.equal(writes, 1);
});
