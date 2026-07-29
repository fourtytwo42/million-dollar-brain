#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${MDB_TESTNET_ENV_FILE:-/etc/mdb/testnet.env}"
official_rpc="https://rpc.testnet.chain.robinhood.com"
runtime_rpc="http://127.0.0.1:18548"
evidence="$repo_root/var/testnet-readiness/build-evidence.json"
public_manifest="$repo_root/packages/contracts/deployments/testnet.json"
export PATH="/home/hendo420/.local/node/bin:/home/hendo420/.foundry/bin:/usr/bin:/bin"

[[ -r "$env_file" ]] || {
  echo "Testnet environment file is not readable: $env_file" >&2
  exit 1
}
set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

[[ "${MDB_NETWORK_MODE:-}" == "testnet" ]]
[[ "${MDB_RPC_URL:-}" == "$runtime_rpc" ]]
[[ "${MDB_BROWSER_RPC_URL:-}" == "$official_rpc" ]]
[[ "${MDB_RPC_PRIMARY_URL:-}" == "http://192.168.50.117:8547" ]]
[[ -n "${MDB_RPC_SECONDARY_URL:-}" ]]
[[ "${NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID:-}" =~ ^[0-9a-f]{32}$ ]]
[[ "$(cast chain-id --rpc-url "$runtime_rpc")" == "46630" ]]
curl --fail --silent "$MDB_RPC_HEALTH_URL" |
  jq -e '.status == "ok" and .expectedChainId == 46630' >/dev/null
: "${MDB_OPERATOR_KEYSTORE:?MDB_OPERATOR_KEYSTORE is required}"
: "${MDB_OPERATOR_PASSWORD_FILE:?MDB_OPERATOR_PASSWORD_FILE is required}"
export MDB_OPERATOR_PRIVATE_KEY="$(
  cast wallet private-key \
    --keystore "$MDB_OPERATOR_KEYSTORE" \
    --password-file "$MDB_OPERATOR_PASSWORD_FILE"
)"

cd "$repo_root"
npm run test:network
npm run test:wallet
npm --workspace apps/web run build

forbidden='192\.168\.50\.117|127\.0\.0\.1:8545|localhost:8545|ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'
if command -v rg >/dev/null 2>&1; then
  bundle_match="$(rg -l "$forbidden" apps/web/.next/static || true)"
elif command -v grep >/dev/null 2>&1; then
  bundle_match="$(grep -RIlE "$forbidden" apps/web/.next/static || true)"
else
  echo "No browser-bundle scanner is installed" >&2
  exit 1
fi
if [[ -n "$bundle_match" ]]; then
  echo "Forbidden private RPC or local development key found in browser bundle" >&2
  exit 1
fi

mkdir -p "$(dirname "$evidence")"
jq -n \
  --arg builtAt "$(date -u +%FT%TZ)" \
  --arg gitSha "$(git rev-parse HEAD)" \
  --arg serverRpc "$runtime_rpc" \
  --arg browserRpc "$official_rpc" \
  --arg reownProjectIdHash "$(printf %s "$NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID" | sha256sum | awk '{print $1}')" \
  --argjson publicManifestPresent "$([[ -e "$public_manifest" ]] && echo true || echo false)" \
  '{
    schemaVersion: 1,
    builtAt: $builtAt,
    gitSha: $gitSha,
    networkMode: "testnet",
    chainId: 46630,
    serverRpc: $serverRpc,
    browserRpc: $browserRpc,
    rpcFailoverValidated: true,
    walletLayer: "wagmi-rainbowkit-reown",
    reownProjectIdHash: $reownProjectIdHash,
    browserBundleChecks: {
      noPrivateRpc: true,
      noLocalAnvilKey: true
    },
    publicManifestPresent: $publicManifestPresent,
    broadcastPerformed: $publicManifestPresent
  }' >"$evidence"
cat "$evidence"
