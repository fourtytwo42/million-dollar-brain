#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${MDB_TESTNET_ENV_FILE:-/etc/mdb/testnet.env}"
official_rpc="https://rpc.testnet.chain.robinhood.com"
flat_manifest="$repo_root/packages/contracts/deployments/testnet-v3-flat.json"
manifest="$repo_root/packages/contracts/deployments/testnet-v3.json"
minimum_balance_wei="${MDB_TESTNET_V3_MINIMUM_BALANCE_WEI:-8000000000000000}"
gas_estimate_multiplier="${MDB_TESTNET_GAS_ESTIMATE_MULTIPLIER:-175}"
export PATH="/home/hendo420/.foundry/bin:/home/hendo420/.local/node-v24.18.0-linux-x64/bin:/usr/bin:/bin"

[[ "${MDB_TESTNET_BROADCAST:-false}" == "true" ]] || {
  echo "Refusing public-testnet broadcast without MDB_TESTNET_BROADCAST=true." >&2
  exit 1
}
[[ -r "$env_file" ]]
set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

[[ "${MDB_NETWORK_MODE:-}" == "testnet" ]]
[[ "${MDB_RPC_URL:-}" == "$official_rpc" ]]
[[ "${MDB_BROWSER_RPC_URL:-}" == "$official_rpc" ]]
[[ "$(cast chain-id --rpc-url "$official_rpc")" == "46630" ]]
[[ ! -e "$flat_manifest" && ! -e "$manifest" ]] || {
  echo "Refusing to overwrite an existing V3 deployment manifest." >&2
  exit 1
}
[[ -r "${MDB_OPERATOR_KEYSTORE:?Missing operator keystore}" ]]
[[ -r "${MDB_OPERATOR_PASSWORD_FILE:?Missing operator password file}" ]]

cd "$repo_root"
[[ -z "$(git status --porcelain)" ]] || {
  echo "Refusing broadcast from a dirty worktree." >&2
  exit 1
}
head_sha="$(git rev-parse HEAD)"
[[ "$head_sha" == "$(git rev-parse '@{u}')" ]] || {
  echo "Refusing broadcast until the exact commit is pushed." >&2
  exit 1
}

deployer="$(cast wallet address --keystore "$MDB_OPERATOR_KEYSTORE" \
  --password-file "$MDB_OPERATOR_PASSWORD_FILE")"
[[ -z "${MDB_DEPLOYER_ADDRESS:-}" || "$MDB_DEPLOYER_ADDRESS" == "$deployer" ]] || {
  echo "Configured deployer does not match the encrypted keystore." >&2
  exit 1
}
balance="$(cast balance "$deployer" --rpc-url "$official_rpc")"
(( balance >= minimum_balance_wei )) || {
  echo "Operator requires at least $minimum_balance_wei wei; current balance is $balance." >&2
  exit 1
}

cd "$repo_root/packages/contracts"
MDB_DEPLOYER_ADDRESS="$deployer" \
MDB_QUOTE_AUTHORIZER="$deployer" \
  forge script script/DeployTestnetV3.s.sol:DeployTestnetV3 \
    --rpc-url "$official_rpc" \
    --keystore "$MDB_OPERATOR_KEYSTORE" \
    --password-file "$MDB_OPERATOR_PASSWORD_FILE" \
    --broadcast \
    --slow \
    --gas-estimate-multiplier "$gas_estimate_multiplier"

cd "$repo_root"
MDB_DEPLOYMENT_FLAT="$flat_manifest" \
MDB_DEPLOYMENT_OUTPUT="$manifest" \
  node scripts/build-testnet-v3-manifest.mjs

jq -e '
  .schemaVersion == 3 and .environment == "robinhood-testnet-replica" and
  .chainId == 46630 and .productionParityReplicas == true and
  .canonicalAssets == false and .automaticFreshness == false and
  (.assets | length) == 12 and
  ([.assets[] | select(.replica != true)] | length) == 0
' "$manifest" >/dev/null

for address in $(jq -r '.contracts[] as $address | $address, (.assets[].address)' "$manifest" | sort -u); do
  [[ "$(cast code "$address" --rpc-url "$official_rpc")" != "0x" ]] || {
    echo "Deployment validation failed: no runtime code at $address" >&2
    exit 1
  }
done

evidence="$repo_root/var/testnet-readiness/v3-public-deployment.json"
mkdir -p "$(dirname "$evidence")"
ending_balance="$(cast balance "$deployer" --rpc-url "$official_rpc")"
jq -n \
  --arg deployedAt "$(date -u +%FT%TZ)" \
  --arg gitSha "$head_sha" \
  --arg deployer "$deployer" \
  --arg manifestHash "$(sha256sum "$manifest" | awk '{print $1}')" \
  --arg startingBalanceWei "$balance" \
  --arg endingBalanceWei "$ending_balance" \
  '{
    schemaVersion: 3,
    deployedAt: $deployedAt,
    gitSha: $gitSha,
    chainId: 46630,
    publicRpc: "https://rpc.testnet.chain.robinhood.com",
    deployer: $deployer,
    manifestHash: $manifestHash,
    productionParityReplicas: true,
    canonicalAssets: false,
    startingBalanceWei: $startingBalanceWei,
    endingBalanceWei: $endingBalanceWei,
    runtimeCodeValidated: true
  }' >"$evidence"
cat "$evidence"
