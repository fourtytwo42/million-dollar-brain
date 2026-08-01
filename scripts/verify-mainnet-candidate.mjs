import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { sha256 } from "./lib/release-artifacts.mjs";

const candidatePath = resolve(process.argv[2] ?? "");
const report = JSON.parse(readFileSync(candidatePath, "utf8"));
const { signature, signed, reportHash, ...payload } = report;

if (signed !== true || !signature || !report.operatorAddress) {
  throw new Error("candidate is not signed by a configured operator");
}
if (sha256(JSON.stringify(payload)) !== reportHash) {
  throw new Error("candidate payload does not match its signed report hash");
}
if (report.broadcastPermitted !== false || report.readyToBroadcast !== false) {
  throw new Error("candidate unexpectedly permits a broadcast");
}

execFileSync(
  "cast",
  [
    "wallet",
    "verify",
    "--address",
    report.operatorAddress,
    `0x${reportHash}`,
    signature,
  ],
  { stdio: "ignore" },
);

console.log(candidatePath);
