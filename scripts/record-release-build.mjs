import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  contractBytecodeHashes,
  directoryHash,
  sha256,
} from "./lib/release-artifacts.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const run = (command, args) =>
  execFileSync(command, args, { cwd: repoRoot, encoding: "utf8" }).trim();
const gitSha = run("git", ["rev-parse", "HEAD"]);
if (run("git", ["status", "--porcelain"]) !== "") {
  throw new Error("build evidence requires a clean source release");
}
if (gitSha !== run("git", ["rev-parse", "@{u}"])) {
  throw new Error("build evidence requires the exact pushed source release");
}
const buildDir = resolve(repoRoot, "apps/web/.next");
if (!existsSync(resolve(buildDir, "BUILD_ID"))) {
  throw new Error("production web build is missing");
}
const payload = {
  schemaVersion: 1,
  gitSha,
  createdAt: new Date().toISOString(),
  webBuildId: readFileSync(resolve(buildDir, "BUILD_ID"), "utf8").trim(),
  webBuildHash: directoryHash(buildDir),
  contractBytecodeHashes: contractBytecodeHashes(repoRoot),
};
payload.sourceHash = sha256(JSON.stringify(payload));
const keystore =
  process.env.MDB_RELEASE_SIGNER_KEYSTORE ??
  "/etc/mdb/keys/mainnet-operator.json";
const password =
  process.env.MDB_RELEASE_SIGNER_PASSWORD_FILE ??
  "/etc/mdb/keys/mainnet-operator.password";
const signature = run("cast", [
  "wallet",
  "sign",
  "--keystore",
  keystore,
  "--password-file",
  password,
  `0x${payload.sourceHash}`,
]);
const output = resolve(repoRoot, `var/releases/${gitSha}/build.json`);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(
  output,
  `${JSON.stringify({ ...payload, signature, signed: true }, null, 2)}\n`,
  {
    mode: 0o640,
  },
);
console.log(output);
