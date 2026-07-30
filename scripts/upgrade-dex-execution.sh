#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${MDB_TESTNET_ENV_FILE:-/etc/mdb/testnet.env}"
rpc="${MDB_TESTNET_RPC_URL:-http://127.0.0.1:18548}"
export PATH="/home/hendo420/.foundry/bin:/home/hendo420/.local/node/bin:/usr/bin:/bin"

[[ "${MDB_TESTNET_BROADCAST:-false}" == "true" ]] || {
  echo "Refusing testnet upgrade without MDB_TESTNET_BROADCAST=true." >&2
  exit 1
}
[[ -r "$env_file" ]]
set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

[[ "$(cast chain-id --rpc-url "$rpc")" == "46630" ]]
[[ -r "${MDB_OPERATOR_KEYSTORE:?}" ]]
[[ -r "${MDB_OPERATOR_PASSWORD_FILE:?}" ]]
[[ -z "$(git -C "$repo_root" status --porcelain)" ]]
[[ "$(git -C "$repo_root" rev-parse HEAD)" == "$(git -C "$repo_root" rev-parse '@{u}')" ]]

manifest="$repo_root/packages/contracts/deployments/testnet-v3.json"
adapter="$(jq -er '.contracts.dexExecutionAdapter' "$manifest")"
basket="$(jq -er '.contracts.basket' "$manifest")"
[[ "$(cast call "$basket" 'executionAdapter()(address)' --rpc-url "$rpc" | tr '[:upper:]' '[:lower:]')" == "$(printf '%s' "$adapter" | tr '[:upper:]' '[:lower:]')" ]]
implementation_slot="0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
before="$(cast storage "$adapter" "$implementation_slot" --rpc-url "$rpc")"

cd "$repo_root/packages/contracts"
MDB_DEX_EXECUTION_ADAPTER="$adapter" \
  forge script script/UpgradeDexExecution.s.sol:UpgradeDexExecution \
    --rpc-url "$rpc" \
    --keystore "$MDB_OPERATOR_KEYSTORE" \
    --password-file "$MDB_OPERATOR_PASSWORD_FILE" \
    --broadcast \
    --slow \
    --gas-estimate-multiplier 175

after="$(cast storage "$adapter" "$implementation_slot" --rpc-url "$rpc")"
[[ "$after" != "$before" ]]
[[ "$(cast call "$adapter" 'MAX_REFERENCE_BLOCK_AGE()(uint32)' --rpc-url "$rpc")" == "128" ]]
printf 'DEX execution adapter upgraded: %s -> %s\n' "$before" "$after"
