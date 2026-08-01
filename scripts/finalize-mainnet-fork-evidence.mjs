import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { sha256 } from "./lib/release-artifacts.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(process.argv[2], "utf8"));
const checks = JSON.parse(readFileSync(process.argv[3], "utf8"));
const gitSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repoRoot,
  encoding: "utf8",
}).trim();
const releaseDir = resolve(repoRoot, `var/releases/${gitSha}`);
const payload = {
  schemaVersion: 5,
  chainId: 4663,
  gitSha,
  createdAt: new Date().toISOString(),
  canonicalAssets: true,
  activationState: "paused-canary",
  broadcastPermitted: false,
  forkBlock: checks.forkBlock,
  manifest,
  checks: checks.checks,
};
payload.sourceHash = sha256(JSON.stringify(payload));
const keystore =
  process.env.MDB_RELEASE_SIGNER_KEYSTORE ??
  "/etc/mdb/keys/mainnet-operator.json";
const password =
  process.env.MDB_RELEASE_SIGNER_PASSWORD_FILE ??
  "/etc/mdb/keys/mainnet-operator.password";
const signature = execFileSync(
  "cast",
  [
    "wallet",
    "sign",
    "--keystore",
    keystore,
    "--password-file",
    password,
    `0x${payload.sourceHash}`,
  ],
  { cwd: repoRoot, encoding: "utf8" },
).trim();
const report = { ...payload, signature, signed: true };
const outputs = [
  resolve(repoRoot, "var/mainnet-shadow/fork-deployment.json"),
  resolve(releaseDir, "mainnet-fork.json"),
];
for (const output of outputs) {
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, {
    mode: 0o640,
  });
}
console.log(outputs[1]);
