import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const lock = JSON.parse(
  readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"),
) as {
  packages: Record<
    string,
    { version?: string; dependencies?: Record<string, string> }
  >;
};

test("WalletConnect QR renderer stays on the compatible qr release", () => {
  assert.equal(
    lock.packages["node_modules/cuer/node_modules/qr"]?.version,
    "0.5.5",
    "qr 0.6 rejects cuer's border=0 and crashes the WalletConnect QR screen",
  );
});

test("wallet framework versions remain explicitly pinned", () => {
  const web = lock.packages["apps/web"]?.dependencies;
  assert.equal(web?.["@rainbow-me/rainbowkit"], "2.2.11");
  assert.equal(web?.["@tanstack/react-query"], "5.101.4");
  assert.equal(web?.wagmi, "2.19.5");
  assert.equal(web?.viem, "2.55.8");
});
