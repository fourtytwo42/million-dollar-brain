#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${MDB_MAINNET_ENV_FILE:-/etc/mdb/mainnet.env}"
manifest="$repo_root/packages/contracts/deployments/mainnet-v3.json"
[[ -r "$env_file" && -r "$manifest" ]]
set -a
# shellcheck disable=SC1090
source "$env_file"
set +a
export PATH="/home/hendo420/.foundry/bin:/home/hendo420/.local/node-v24.18.0-linux-x64/bin:/usr/bin:/bin"
[[ "$(cast chain-id --rpc-url "${MDB_RPC_URL:?}")" == "4663" ]]
jq -e '
  .schemaVersion == 3 and .chainId == 4663 and
  .canonicalAssets == true and .productionParityReplicas == false and
  .activationState == "paused-canary"
' "$manifest" >/dev/null
basket="$(jq -r '.basket' "$manifest")"
brain="$(jq -r '.brain' "$manifest")"
[[ "$(cast call "$basket" 'canaryControlsConfigured()(bool)' --rpc-url "$MDB_RPC_URL")" == "true" ]]
[[ "$(cast call "$basket" 'buysEnabled()(bool)' --rpc-url "$MDB_RPC_URL")" == "false" ]]
[[ "$(cast call "$basket" 'sellsEnabled()(bool)' --rpc-url "$MDB_RPC_URL")" == "false" ]]
[[ "$(cast call "$basket" 'rebalancesEnabled()(bool)' --rpc-url "$MDB_RPC_URL")" == "false" ]]
[[ "$(cast call "$brain" 'marketControlsConfigured()(bool)' --rpc-url "$MDB_RPC_URL")" == "true" ]]
[[ "$(cast call "$brain" 'purchasesEnabled()(bool)' --rpc-url "$MDB_RPC_URL")" == "false" ]]
echo "Mainnet canary is deployed and value actions are disabled."
