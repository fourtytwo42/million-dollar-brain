#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${MDB_MAINNET_ENV_FILE:-/etc/mdb/mainnet.env}"
manifest="$repo_root/packages/contracts/deployments/mainnet-v5.json"
shadow_state="$repo_root/var/mainnet-shadow/state.json"
candidate="$repo_root/var/mainnet-readiness/mainnet-candidate-v5.json"
export PATH="/home/hendo420/.foundry/bin:/home/hendo420/.local/node-v24.18.0-linux-x64/bin:/usr/bin:/bin"

[[ "${MDB_MAINNET_BROADCAST:-false}" == "true" ]] || {
  echo "Mainnet broadcast is disabled." >&2
  exit 1
}
[[ "${MDB_MAINNET_RELEASE_APPROVED:-false}" == "true" ]] || {
  echo "Missing explicit external release approval." >&2
  exit 1
}
[[ -r "$env_file" ]]
set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

[[ "${MDB_NETWORK_MODE:-}" == "mainnet" ]]
[[ "${MDB_RPC_URL:-}" == "http://127.0.0.1:18549" ]] || {
  echo "Mainnet must use the loopback RPC failover gateway." >&2
  exit 1
}
[[ "${MDB_RPC_PRIMARY_URL:-}" == "http://192.168.50.173:8547" ]]
[[ "${MDB_RPC_SECONDARY_URL:-}" =~ ^https://[^/]*alchemy\.com/ ]]
[[ -n "${MDB_BACKUP_RPC_URL:-}" && "$MDB_BACKUP_RPC_URL" != "$MDB_RPC_URL" ]]
[[ "$MDB_BACKUP_RPC_URL" == "$MDB_RPC_SECONDARY_URL" ]]
[[ -n "${MDB_WEBSOCKET_URL:-}" && -n "${MDB_BACKUP_WEBSOCKET_URL:-}" ]]
rpc_health="$(curl --fail --silent --show-error "${MDB_RPC_HEALTH_URL:?}")"
[[ "$(jq -r '.status' <<<"$rpc_health")" == "ok" ]]
[[ "$(jq -r '.expectedChainId' <<<"$rpc_health")" == "4663" ]]
[[ "$(jq -r '.primary.chainId' <<<"$rpc_health")" == "4663" ]]
[[ "$(jq -r '.secondary.chainId' <<<"$rpc_health")" == "4663" ]]
[[ "$(cast chain-id --rpc-url "${MDB_RPC_URL:?}")" == "4663" ]]
[[ "$(cast chain-id --rpc-url "$MDB_BACKUP_RPC_URL")" == "4663" ]]
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

(
  cd "$repo_root/packages/contracts"
  forge test
)

jq -e '
  .chainId == 4663 and .gitSha == $sha and
  .broadcastPermitted == false and .activationState == "paused-canary" and
  .signed == true and .pausedDeploymentReady == true and
  .readyToBroadcast == false and .activationReady == false and
  .creatorRiskPolicy.initialApprovedSymbols == ["USDG"]
' --arg sha "$head_sha" "$candidate" >/dev/null
node "$repo_root/scripts/verify-mainnet-candidate.mjs" "$candidate" >/dev/null

deployment_env="$(mktemp)"
trap 'rm -f "$deployment_env"' EXIT
node "$repo_root/scripts/prepare-mainnet-deployment-env.mjs" "$candidate" >"$deployment_env"
# The asset list, route identities, capacities, and actual qualification progress
# must come from the exact signed candidate rather than operator-supplied arrays.
# shellcheck disable=SC1090
source "$deployment_env"

jq -e '
  .schemaVersion == 5 and .chainId == 4663 and .broadcastPermitted == false and
  .deploymentGates.fullCanonicalStockUniverseInspected == true and
  .deploymentGates.diagnosticFilterDisabled == true and
  .deploymentGates.dexVenueVerified == true and
  .deploymentGates.selfHostedRouting == true and
  .deploymentGates.noOffchainCapitalizationGate == true
' "$shadow_state" >/dev/null
testnet_acceptance="$repo_root/var/releases/$head_sha/testnet-acceptance.json"
jq -e '
  .chainId == 46630 and .durationHours >= 2 and
  .protocolFailures == 0 and .atomicBuys == true and .atomicSells == true and
  .autonomousCycles == true and .signed == true
' "$testnet_acceptance" >/dev/null
[[ "$(jq -r '.gitSha' "$testnet_acceptance")" == "$head_sha" ]] || {
  echo "Testnet acceptance was not produced from the release commit." >&2
  exit 1
}
testnet_candidate="$repo_root/var/releases/$head_sha/testnet.json"
[[ -r "$testnet_candidate" ]]
[[ "$(jq -r '.gitSha' "$testnet_candidate")" == "$head_sha" ]]
[[ "$(jq -r '.environment' "$testnet_candidate")" == "testnet" ]]
node "$repo_root/scripts/verify-release-artifacts.mjs" testnet

deployer="$(cast wallet address --keystore "$MDB_OPERATOR_KEYSTORE" \
  --password-file "$MDB_OPERATOR_PASSWORD_FILE")"
[[ "$deployer" == "${MDB_DEPLOYER_ADDRESS:?}" ]]

cd "$repo_root/packages/contracts"
export MDB_RELEASE_SHA="$head_sha"
MDB_DEPLOYMENT_OUTPUT="$manifest" \
  forge script script/DeployMainnet.s.sol:DeployMainnet \
    --rpc-url "$MDB_RPC_URL" \
    --keystore "$MDB_OPERATOR_KEYSTORE" \
    --password-file "$MDB_OPERATOR_PASSWORD_FILE" \
    --broadcast \
    --gas-estimate-multiplier 175

jq -e '
  .schemaVersion == 5 and .chainId == 4663 and
  .environment == "robinhood-mainnet" and .canonicalAssets == true and
  .productionParityReplicas == false and .activationState == "paused-canary" and
  .activatedRiskAssetCount == 0 and .buysEnabled == false and
  .sellsEnabled == false and .rebalancesEnabled == false and
  .brainPurchasesEnabled == false
' "$manifest" >/dev/null
! grep -Eiq 'mock|replica|test quote' "$manifest"
echo "Mainnet deployment completed from $head_sha; verify runtime bytecode before activation."
