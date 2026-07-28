#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${MDB_TESTNET_ENV_FILE:-/etc/mdb/testnet.env}"
rpc="https://rpc.testnet.chain.robinhood.com"
export PATH="/home/hendo420/.foundry/bin:/home/hendo420/.local/node-v24.18.0-linux-x64/bin:/usr/bin:/bin"

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

cd "$repo_root"
[[ -z "$(git status --porcelain)" ]]
[[ "$(git rev-parse HEAD)" == "$(git rev-parse '@{u}')" ]]
adapter="$(jq -er '.contracts.executionAdapter' packages/contracts/deployments/testnet-v3.json)"

cd packages/contracts
MDB_EXECUTION_ADAPTER="$adapter" \
  forge script script/UpgradeTestnetExecution.s.sol:UpgradeTestnetExecution \
    --rpc-url "$rpc" \
    --keystore "$MDB_OPERATOR_KEYSTORE" \
    --password-file "$MDB_OPERATOR_PASSWORD_FILE" \
    --broadcast \
    --slow \
    --gas-estimate-multiplier 175

actual="$(cast call "$adapter" 'maximumBlockDelay()(uint32)' --rpc-url "$rpc")"
[[ "$actual" == "600" ]]
echo "Testnet execution adapter upgraded; maximumBlockDelay=$actual"
