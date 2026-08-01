import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(import.meta.dirname, "..");
const run = (command, args) =>
  execFileSync(command, args, { cwd: repoRoot, encoding: "utf8" }).trim();
const gitSha = run("git", ["rev-parse", "HEAD"]);
if (gitSha !== run("git", ["rev-parse", "@{u}"])) {
  throw new Error("RPC evidence requires the exact pushed release SHA");
}
if (run("git", ["status", "--porcelain"]) !== "") {
  throw new Error("RPC evidence requires a clean repository");
}

run(process.execPath, ["--test", "tests/rpc-failover.test.mjs"]);
const healthUrl =
  process.env.MDB_RPC_HEALTH_URL ?? "http://127.0.0.1:18549/health";
const response = await fetch(healthUrl, {
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok)
  throw new Error(`RPC health returned HTTP ${response.status}`);
const health = await response.json();
if (
  health.status !== "ok" ||
  health.expectedChainId !== 4663 ||
  health.primary?.chainId !== 4663 ||
  health.secondary?.chainId !== 4663
) {
  throw new Error("Both mainnet RPC upstreams must be healthy on chain 4663");
}

const artifact = {
  schemaVersion: 1,
  gitSha,
  generatedAt: new Date().toISOString(),
  chainId: 4663,
  gateway: "http://127.0.0.1:18549",
  health: {
    status: health.status,
    active: health.active,
    headLag: health.headLag,
    thresholds: health.thresholds,
    primary: {
      healthy: health.primary.healthy,
      chainId: health.primary.chainId,
      blockNumber: health.primary.blockNumber,
      checkedAt: health.primary.checkedAt,
    },
    secondary: {
      healthy: health.secondary.healthy,
      chainId: health.secondary.chainId,
      blockNumber: health.secondary.blockNumber,
      checkedAt: health.secondary.checkedAt,
    },
  },
  failureModeTests: {
    unreachablePrimary: true,
    wrongChainPrimary: true,
    laggedPrimary: true,
    failoverHysteresis: true,
    failbackHysteresis: true,
    ambiguousTransactionNotReplayed: true,
  },
};
artifact.sourceHash = createHash("sha256")
  .update(JSON.stringify(artifact))
  .digest("hex");
const outputs = [
  resolve(repoRoot, "var/mainnet-readiness/mainnet-rpc-failover.json"),
  resolve(repoRoot, `var/releases/${gitSha}/mainnet-rpc-failover.json`),
];
for (const output of outputs) {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(artifact, null, 2)}\n`, {
    mode: 0o640,
  });
}
console.log(outputs[1]);
