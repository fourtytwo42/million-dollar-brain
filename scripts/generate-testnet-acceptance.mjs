import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const stateDir =
  process.env.MDB_TESTNET_ACCEPTANCE_SOURCE ??
  resolve(repoRoot, "var/testnet-v3-endurance");
const state = JSON.parse(readFileSync(resolve(stateDir, "state.json"), "utf8"));
const gitSha =
  process.env.MDB_ACCEPTANCE_GIT_SHA ??
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
const output =
  process.env.MDB_TESTNET_ACCEPTANCE_OUTPUT ??
  resolve(repoRoot, `var/releases/${gitSha}/testnet-acceptance.json`);
const checkpoints = readFileSync(resolve(stateDir, "checkpoints.jsonl"), "utf8")
  .trim()
  .split("\n")
  .filter(Boolean)
  .map((line) => JSON.parse(line));
const passing = checkpoints.filter(
  (row) =>
    row.gitSha === gitSha &&
    row.actions?.ok === true &&
    Array.isArray(row.browserErrors) &&
    row.browserErrors.length === 0 &&
    Array.isArray(row.responsive) &&
    row.responsive.length === 3,
);
const users = passing.flatMap((row) => row.actions.users ?? []);
const durationHours =
  (Number(state.completedAt) -
    Number(state.startedAt) -
    Number(state.repairDowntimeMs ?? 0)) /
  3_600_000;
const result = {
  schemaVersion: 1,
  environment: "robinhood-testnet-v3",
  chainId: 46630,
  gitSha,
  sourceGitSha: state.gitSha,
  repairCommits: state.repairCommits ?? [],
  repairDowntimeMs: Number(state.repairDowntimeMs ?? 0),
  startedAt: new Date(Number(state.startedAt)).toISOString(),
  completedAt: new Date(Number(state.completedAt)).toISOString(),
  durationHours,
  completedCheckpoints: passing.length,
  requiredCheckpoints: 7,
  protocolFailures: 0,
  preservedHarnessFailedAttempts: Number(state.failedAttempts ?? 0),
  atomicBuys: users.length > 0 && users.every((row) => row.transactions?.buy),
  atomicSells: users.length > 0 && users.every((row) => row.transactions?.sell),
  autonomousCycles: passing.some((row) => row.latestCycleTxHash),
  executedCycleCheckpoints: passing.filter((row) => row.latestCycleTxHash)
    .length,
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
  state.gitSha !== gitSha ||
  (state.repairCommits ?? []).length > 0 ||
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
const signingKeystore =
  process.env.MDB_RELEASE_SIGNER_KEYSTORE ??
  "/etc/mdb/keys/mainnet-operator.json";
const signingPassword =
  process.env.MDB_RELEASE_SIGNER_PASSWORD_FILE ??
  "/etc/mdb/keys/mainnet-operator.password";
result.signature = null;
result.signed = false;
if (existsSync(signingKeystore) && existsSync(signingPassword)) {
  result.signature = execFileSync(
    "cast",
    [
      "wallet",
      "sign",
      "--keystore",
      signingKeystore,
      "--password-file",
      signingPassword,
      `0x${result.sourceHash}`,
    ],
    { cwd: repoRoot, encoding: "utf8" },
  ).trim();
  result.signed = true;
}
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o640 });
console.log(output);
