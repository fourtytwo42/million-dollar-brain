import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");

export function directoryHash(root) {
  const hash = createHash("sha256");
  const visit = (directory) => {
    for (const name of readdirSync(directory).sort()) {
      if (name === "cache" || name === "trace" || name === "diagnostics") continue;
      const path = resolve(directory, name);
      const info = statSync(path);
      if (info.isDirectory()) visit(path);
      else {
        hash.update(relative(root, path).replaceAll("\\", "/"));
        hash.update(readFileSync(path));
      }
    }
  };
  visit(root);
  return hash.digest("hex");
}

export function contractBytecodeHashes(repoRoot) {
  const contractRoot = resolve(repoRoot, "packages/contracts");
  const contracts = [
    "BasketVault",
    "BrainMarketplace",
    "AssetRegistry",
    "ChainlinkValuationAdapter",
    "ZeroExExecutionAdapter",
    "RewardDistributor",
    "CreatorVault",
  ];
  return Object.fromEntries(
    contracts.map((contract) => [
      contract,
      sha256(
        execFileSync(
          "forge",
          [
            "inspect",
            `src/${contract}.sol:${contract}`,
            "deployedBytecode",
          ],
          { cwd: contractRoot, encoding: "utf8" },
        ).trim(),
      ),
    ]),
  );
}
