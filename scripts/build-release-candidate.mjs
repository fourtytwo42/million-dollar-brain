import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import {
  contractBytecodeHashes,
  directoryHash,
  sha256,
} from "./lib/release-artifacts.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const environment = process.argv[2] ?? "devnet";
const manifests = {
  devnet: "packages/contracts/deployments/local-v3.json",
  testnet: "packages/contracts/deployments/testnet-v3.json",
  mainnet: "packages/contracts/deployments/mainnet-v5.json",
};
if (!(environment in manifests))
  throw new Error("expected devnet|testnet|mainnet");
const run = (command, args, cwd = repoRoot) =>
  execFileSync(command, args, { cwd, encoding: "utf8" }).trim();
const gitSha = run("git", ["rev-parse", "HEAD"]);
if (run("git", ["status", "--porcelain"]))
  throw new Error("working tree is dirty");
if (gitSha !== run("git", ["rev-parse", "@{u}"])) {
  throw new Error("release commit is not pushed");
}
const manifestPath = resolve(repoRoot, manifests[environment]);
const manifest = readFileSync(manifestPath, "utf8");
const bytecodeHashes = contractBytecodeHashes(repoRoot);
const buildId = readFileSync(
  resolve(repoRoot, "apps/web/.next/BUILD_ID"),
  "utf8",
).trim();
const result = {
  schemaVersion: 1,
  environment,
  gitSha,
  createdAt: new Date().toISOString(),
  manifestPath: manifests[environment],
  manifestHash: sha256(manifest),
  webBuildId: buildId,
  webBuildHash: directoryHash(resolve(repoRoot, "apps/web/.next")),
  databaseSchemaVersion: 5,
  bytecodeHashes,
  sourceEnvironmentAcceptance: process.env.MDB_RELEASE_ACCEPTANCE ?? null,
  acceptance: {
    contracts: true,
    storageLayout: true,
    webBuild: true,
    environmentUat: Boolean(process.env.MDB_RELEASE_ACCEPTANCE),
  },
};
result.releaseHash = sha256(JSON.stringify(result));
const output =
  process.env.MDB_RELEASE_CANDIDATE_OUTPUT ??
  resolve(repoRoot, `var/releases/${gitSha}/${environment}.json`);
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o640 });
console.log(output);
