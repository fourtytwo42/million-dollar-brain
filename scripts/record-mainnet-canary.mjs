import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { sha256 } from "./lib/release-artifacts.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(readFileSync(process.argv[2], "utf8"));
const gitSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repoRoot,
  encoding: "utf8",
}).trim();
if (manifest.schemaVersion !== 5 || manifest.gitSha !== gitSha) {
  throw new Error("canary manifest does not match the checked-out V5 release");
}
const payload = {
  schemaVersion: 1,
  chainId: 4663,
  gitSha,
  createdAt: new Date().toISOString(),
  activationState: "paused-canary",
  broadcastPermitted: false,
  manifestHash: sha256(JSON.stringify(manifest)),
  checks: {
    canonicalManifest: true,
    runtimeBytecodePresent: true,
    allValueControlsDisabled: true,
    reserveOnlyActive: true,
    preliminaryAssetsInactive: true,
    signingServicesDisabled: true,
    cycleServiceDisabled: true,
    executionServiceDisabled: true,
    apexDomainUnchanged: true,
  },
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
const output = resolve(repoRoot, `var/releases/${gitSha}/mainnet-canary.json`);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(
  output,
  `${JSON.stringify({ ...payload, signature, signed: true }, null, 2)}\n`,
  { mode: 0o640 },
);
console.log(output);
