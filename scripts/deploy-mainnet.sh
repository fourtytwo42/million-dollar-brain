#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(diname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${MDB_MAINNET_ENV_FILE:-/etc/mdb/mainnet.env}"
manifest="$repo_root/packages/contracts/deployments/mainnet-v3.json"
shadow_state="$repo_root/var/mainnet-shadow/state.json"
testnet_acceptance="$repo_root/var/testnet-readiness/v3-72h-acceptance.json"
export PATH="/home/hendo420/.foundry/bin:/home/hendo420/.local/node-v24.18.0-linux-x64/bin:/usr/bin:/bin"

[[ "${MDB_MAINNET_BROADCAST:-false}" == "true" ]] || {
  echo "Mainnet broadcast is disabled." >&2
  exit 1
}
[[ "${MDB_MAINNET_RELEASE_APPROVED:-false}" == "true" ]] || {
  echo "Missing explicit extenal release approval." >&2
  exit 1
}
[[ -r "$env_file" ]]
set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

[[ "${MDB_NETWORK_MODE:-}" == "mainnet" ]]
[[ "${MDB_RPC_URL:-}" != "https://rpc.mainnet.chain.robinhood.com" ]] || {
  echo "A paid redundant production RPC is required." >&2
  exit 1
}
[[ "$(cast chain-id --rpc-url "${MDB_RPC_URL:?}")" == "4663" ]]
[[ -n "${ZEROX_API_KEY:-}" ]]
[[ -r "${MDB_OPERATOR_KEYSTORE:?}" ]]
[[ -r "${MDB_OPERATOR_PASSWORD_FILE:?}" ]]
[[ ! -e "$manifest" ]] || {
  echo "Refusing to overwrite an existing mainnet manifest." >&2
  exit 1
}

cd "$repo_root"
[[ -z "$(git status --porcelain)" ]]
head_sha="$(git rev-parse HEAD)"
[[ "$head_sha" == "$(git rev-parse '@{u}')" ]]
forge fmt --check packages/contracts
forge test --root packages/contracts

jq -e '
  .chainId == 4663 and .broadcastPermitted == false and
  .gates.noSigningKey == true and
  .gates.canonicalIdentityChecked == true and
  .gates.zeroExConfigured == true and
  .gates.twoSidedQuotesValid == true and
  .gates.chainlinkMappingsConfigured == true and
  .gates.thirtyDailyPasses == true
' "$shadow_state" >/dev/null
jq -e '
  .chainId == 46630 and .durationHours >= 72 and
  .failures == 0 and .atomicBuys == true and .atomicSells == true and
  .autonomousCycles == true
' "$testnet_acceptance" >/dev/null

deployer="$(cast wallet address --keystore "$MDB_OPERATOR_KEYSTORE" \
  --password-file "$MDB_OPERATOR_PASSWORD_FILE")"
[[ "$deployer" == "${MDB_DEPLOYER_ADDRESS:?}" ]]

cd "$repo_root/packages/contracts"
MDB_DEPLOYMENT_OUTPUT="$manifest" \
  forge script script/DeployMainnet.s.sol:DeployMainnet \
    --rpc-url "$MDB_RPC_URL" \
    --keystore "$MDB_OPERATOR_KEYSTORE" \
    --password-file "$MDB_OPERATOR_PASSWORD_FILE" \
    --broadcast \
    --gas-estimate-multiplier 175

jq -e '
  .schemaVersion == 3 and .chainId == 4663 and
  .environment == "robinhood-mainnet" and .canonicalAssets == true and
  .productionParityReplicas == false
' "$manifest" >/dev/null
! grep -Eiq 'mock|replica|test quote' "$manifest"
echo "Mainnet deployment completed from $head_sha; verify runtime bytecode before activation."
