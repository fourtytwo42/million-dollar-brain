import assert from "node:assert/strict";
import test from "node:test";
import { deriveSnapshotState } from "../apps/web/lib/dex-snapshot-state.ts";

const observedAt = "2026-08-03T20:00:00.000Z";
const observed = Date.parse(observedAt);

test("snapshot stays live inside the freshness window", () => {
  assert.deepEqual(
    deriveSnapshotState({
      observedAt,
      now: observed + 45_000,
      staleAfterSeconds: 45,
    }),
    { state: "live", reasonCodes: [], ageSeconds: 45 },
  );
});

test("snapshot becomes stale after the exact freshness boundary", () => {
  assert.deepEqual(
    deriveSnapshotState({
      observedAt,
      now: observed + 46_000,
      staleAfterSeconds: 45,
    }),
    {
      state: "stale",
      reasonCodes: ["snapshot_age_exceeded"],
      ageSeconds: 46,
    },
  );
});

test("a newer failed attempt degrades but retains the last snapshot", () => {
  assert.deepEqual(
    deriveSnapshotState({
      observedAt,
      now: observed + 10_000,
      staleAfterSeconds: 45,
      attempt: {
        attemptedAt: "2026-08-03T20:00:05.000Z",
        succeeded: false,
      },
    }),
    {
      state: "degraded",
      reasonCodes: ["snapshot_refresh_failed"],
      ageSeconds: 10,
    },
  );
});
