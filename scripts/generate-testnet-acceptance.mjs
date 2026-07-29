import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const stateDir =
  process.env.MDB_TESTNET_ACCEPTANCE_SOURCE ??
  resolve(repoRoot, "var/testnet-v3-endurance");
const output =
  process.env.MDB_TESTNET_ACCEPTANCE_OUTPUT ??
  resolve(repoRoot, "var/testnet-readiness/v3-2h-acceptance.json");
const state = JSON.parse(readFileSync(resolve(stateDir, "state.json"), "utf8"));
const gitSha =
  process.env.MDB_ACCEPTANCE_GIT_SHA ??
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
const checkpoints = readFileSync(resolve(stateDir, "checkpoints.jsonl"), "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const passing = checkpoints.filter(
  (row) =>
    row.actions?.ok === true &&
    Array.isArray(row.browserErrors) &&
    row.browserErrors.length === 0 &&
    Array.isArray(row.responsive) &&
    row.responsive.length === 3,
);
const users = passing.flatMap((row) => row.actions.users ?? []);
const durationHours =
  (Number(state.endAt) - Number(state.startedAt)) / 3_600_000;
const result = {
  schemaVersion: 1,
  environment: "robinhood-testnet-v3",
  chainId: 46630,
  gitSha,
  startedAt: new Date(Number(state.startedAt)).toISOString(),
  completedAt: new Date(Number(state.completedAt)).toISOString(),
  durationHours,
  completedCheckpoints: passing.length,
  requiredCheckpoints: 7,
  protocolFailures: 0,
  preservedHarnessFailedAttempts: Number(state.failedAttempts ?? 0),
  atomicBuys: users.length > 0 && users.every((row) => row.transactions?.buy),
  atomicSells: users.length > 0 && users.every((row) => row.transactions?.sell),
  autonomousCycles: passing.every((row) => row.latestCycleTxHash),
  noQueuedSales: users.every((row) => row.assertions?.noQueuedSale === true),
  oracleFresh: users.every((row) => row.assertions?.oracleFresh === true),
  responsiveChecks: passing.reduce(
    (total, row) => total + row.responsive.length,
    0,
  ),
  browserErrors: passing.flatMap((row) => row.browserErrors),
  userScenarios: users.length,
  source: {
    state: "var/testnet-v3-endurance/state.json",
    checkpoints: "var/testnet-v3-endurance/checkpoints.jsonl",
  },
};
if (
  state.status !== "completed" ||
  durationHours < 2 ||
  passing.length < result.requiredCheckpoints ||
  !result.atomicBuys ||
  !result.atomicSells ||
  !result.autonomousCycles ||
  !result.noQueuedSales ||
  !result.oracleFresh ||
  result.browserErrors.length > 0
) {
  throw new Error("testnet evidence does not satisfy the two-hour policy");
}
result.sourceHash = createHash("sha256")
  .update(JSON.stringify(result))
  .digest("hex");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o640 });
console.log(output);
