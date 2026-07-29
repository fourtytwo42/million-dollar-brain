import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  contractBytecodeHashes,
  directoryHash,
  sha256,
} from "./lib/release-artifacts.mjs";

const repoRoot = resolve(import.meta.dirname, "..");
const environment = process.argv[2] ?? "devnet";
const gitSha = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repoRoot,
  encoding: "utf8",
}).trim();
const candidate = JSON.parse(
  readFileSync(
    resolve(repoRoot, `var/releases/${gitSha}/${environment}.json`),
    "utf8",
  ),
);
const manifestPath = resolve(repoRoot, candidate.manifestPath);
assert.equal(candidate.gitSha, gitSha, "candidate commit mismatch");
assert.equal(
  candidate.manifestHash,
  sha256(readFileSync(manifestPath)),
  "manifest hash mismatch",
);
assert.equal(
  candidate.webBuildHash,
  directoryHash(resolve(repoRoot, "apps/web/.next")),
  "web build hash mismatch",
);
assert.deepEqual(
  candidate.bytecodeHashes,
  contractBytecodeHashes(repoRoot),
  "contract bytecode hash mismatch",
);
console.log(`Release artifacts match ${environment} candidate ${gitSha}.`);
