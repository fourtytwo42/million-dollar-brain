#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fork_rpc="${MDB_MAINNET_FORK_RPC_URL:-http://192.168.50.173:8547}"
fork_port="${MDB_MAINNET_FORK_PORT:-8555}"
candidate="$repo_root/var/mainnet-readiness/mainnet-candidate-v5.json"
export PATH="/home/hendo420/.foundry/bin:/home/hendo420/.local/node-v24.18.0-linux-x64/bin:/usr/bin:/bin"

cd "$repo_root"
[[ -z "$(git status --porcelain)" ]]
git_sha="$(git rev-parse HEAD)"
[[ "$git_sha" == "$(git rev-parse '@{u}')" ]]
[[ "$(cast chain-id --rpc-url "$fork_rpc")" == "4663" ]]
fork_block="$(cast block-number --rpc-url "$fork_rpc")"
node scripts/build-mainnet-candidate.mjs >/dev/null
jq -e --arg sha "$git_sha" '
  .manifestSchemaVersion == 5 and .chainId == 4663 and .gitSha == $sha and
  .broadcastPermitted == false and .activatedSymbols == ["USDG"] and
  (.preliminarySymbols | length) >= 4 and (.preliminarySymbols | length) <= 9
' "$candidate" >/dev/null
node scripts/verify-mainnet-candidate.mjs "$candidate" >/dev/null

work_dir="$(mktemp -d "$repo_root/var/mainnet-shadow/fork-rehearsal.XXXXXX")"
manifest="$work_dir/mainnet-v5.json"
checks="$work_dir/checks.json"
env_exports="$work_dir/deployment.env"
log="$work_dir/anvil.log"
trap 'kill "${anvil_pid:-}" 2>/dev/null || true; rm -rf "$work_dir"' EXIT
node scripts/prepare-mainnet-deployment-env.mjs "$candidate" >"$env_exports"
# shellcheck disable=SC1090
source "$env_exports"
export MDB_DEPLOYER_ADDRESS="$(jq -r '.operatorAddress' "$candidate")"
export MDB_RELEASE_SHA="$git_sha"
export MDB_DEPLOYMENT_OUTPUT="$manifest"
export MDB_FORK_MANIFEST="$manifest"

anvil --fork-url "$fork_rpc" --fork-block-number "$fork_block" \
  --port "$fork_port" --chain-id 4663 --auto-impersonate >"$log" 2>&1 &
anvil_pid=$!
fork_url="http://127.0.0.1:$fork_port"
for _ in $(seq 1 30); do
  cast chain-id --rpc-url "$fork_url" >/dev/null 2>&1 && break
  sleep 1
done
[[ "$(cast chain-id --rpc-url "$fork_url")" == "4663" ]]
cast rpc --rpc-url "$fork_url" anvil_setBalance \
  "$MDB_DEPLOYER_ADDRESS" 0x56BC75E2D63100000 >/dev/null

cd "$repo_root/packages/contracts"
forge script script/DeployMainnet.s.sol:DeployMainnet \
  --rpc-url "$fork_url" --unlocked --sender "$MDB_DEPLOYER_ADDRESS" --broadcast
jq -e '
  .schemaVersion == 5 and .chainId == 4663 and .canonicalAssets == true and
  .activationState == "paused-canary" and .activatedRiskAssetCount == 0 and
  .buysEnabled == false and .sellsEnabled == false and
  .rebalancesEnabled == false and .brainPurchasesEnabled == false
' "$manifest" >/dev/null

for key in assetRegistry dexValuationAdapter executionAdapter riskController rewards creatorVault brain basket; do
  address="$(jq -r --arg key "$key" '.[$key]' "$manifest")"
  [[ "$(cast code "$address" --rpc-url "$fork_url")" != "0x" ]]
  implementation="$(cast storage "$address" 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc --rpc-url "$fork_url")"
  implementation="0x${implementation:26}"
  [[ "$(cast code "$implementation" --rpc-url "$fork_url")" != "0x" ]]
done

basket="$(jq -r '.basket' "$manifest")"
brain="$(jq -r '.brain' "$manifest")"
registry="$(jq -r '.assetRegistry' "$manifest")"
valuation="$(jq -r '.dexValuationAdapter' "$manifest")"
usdg="$(jq -r '.usdg' "$manifest")"
[[ "$(cast call "$basket" 'buysEnabled()(bool)' --rpc-url "$fork_url")" == "false" ]]
[[ "$(cast call "$basket" 'sellsEnabled()(bool)' --rpc-url "$fork_url")" == "false" ]]
[[ "$(cast call "$basket" 'rebalancesEnabled()(bool)' --rpc-url "$fork_url")" == "false" ]]
[[ "$(cast call "$brain" 'purchasesEnabled()(bool)' --rpc-url "$fork_url")" == "false" ]]
[[ "$(cast call "$registry" 'isActive(address)(bool)' "$usdg" --rpc-url "$fork_url")" == "true" ]]
for token in $(jq -r '.preliminaryAssets[]' "$manifest"); do
  [[ "$(cast call "$registry" 'isActive(address)(bool)' "$token" --rpc-url "$fork_url")" == "false" ]]
  [[ "$(cast call "$registry" 'isCreatorApproved(address)(bool)' "$token" --rpc-url "$fork_url")" == "false" ]]
  [[ "$(cast call "$valuation" 'quoteStatus(address)(uint256,uint256,bool)' "$token" --rpc-url "$fork_url" | tail -1)" == "true" ]]
  [[ "$(cast call "$valuation" 'safetyStatus(address)(bool,uint128,uint128,int24,int24)' "$token" --rpc-url "$fork_url" | head -1)" == "true" ]]
done
for symbol in $(jq -r '.preliminarySymbols[]' "$candidate"); do
  factory="$(jq -r --arg symbol "$symbol" '.venueMappings[$symbol].factory' "$candidate")"
  for pool in $(jq -r --arg symbol "$symbol" '.venueMappings[$symbol].buyPools[].address' "$candidate"); do
    token0="$(cast call "$pool" 'token0()(address)' --rpc-url "$fork_url")"
    token1="$(cast call "$pool" 'token1()(address)' --rpc-url "$fork_url")"
    fee="$(cast call "$pool" 'fee()(uint24)' --rpc-url "$fork_url" | awk '{print $1}')"
    canonical_pool="$(cast call "$factory" 'getPool(address,address,uint24)(address)' "$token0" "$token1" "$fee" --rpc-url "$fork_url")"
    [[ "${canonical_pool,,}" == "${pool,,}" ]]
  done
done
[[ "$(jq -c '.preliminaryQualificationHours' "$manifest")" == "$(jq -c '[.preliminarySymbols[] as $symbol | .qualificationProgress[$symbol].qualificationHours]' "$candidate")" ]]
[[ "$(jq -c '.preliminaryMarketSessions' "$manifest")" == "$(jq -c '[.preliminarySymbols[] as $symbol | .qualificationProgress[$symbol].regularMarketSessions]' "$candidate")" ]]

forge script script/ExercisePausedMainnetFork.s.sol:ExercisePausedMainnetFork \
  --rpc-url "$fork_url" -vv

jq -n --argjson block "$fork_block" '{
  forkBlock: $block,
  checks: {
    pinnedFork: true,
    schemaV5Deployment: true,
    canonicalIdentitiesAndRoutes: true,
    canonicalFactoryPools: true,
    liveTwapAndTwalSafety: true,
    proxyImplementationsAndStorage: true,
    allValueControlsInitiallyDisabled: true,
    preliminaryAssetsRegisteredInactive: true,
    actualQualificationEvidencePreserved: true,
    noQualificationFabrication: true,
    overlappingNoticeAndQualificationEnforced: true,
    usdOnlyDepositAndAtomicRedemptionSimulated: true,
    aiRebalancePathSimulated: true,
    assetDeactivationSimulated: true,
    futureDaoAuthorityTransferSimulated: true,
    beginningEndAccountingReconciled: true,
    rollbackToPausedControlsVerified: true
  }
}' >"$checks"
cd "$repo_root"
node scripts/finalize-mainnet-fork-evidence.mjs "$manifest" "$checks"
