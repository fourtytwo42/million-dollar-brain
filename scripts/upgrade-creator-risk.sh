#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mode="${1:-}"
export PATH="/home/hendo420/.foundry/bin:/home/hendo420/.local/node-v24.18.0-linux-x64/bin:/usr/bin:/bin"

case "$mode" in
  devnet)
    env_file="${MDB_DEVNET_ENV_FILE:-/etc/mdb/devnet.env}"
    rpc="${MDB_DEVNET_RPC_URL:-http://127.0.0.1:8545}"
    manifest="$repo_root/packages/contracts/deployments/local-v3.json"
    status_url="${MDB_DEVNET_STATUS_URL:-http://127.0.0.1:3000/api/status}"
    expected_chain=31337
    ;;
  testnet)
    env_file="${MDB_TESTNET_ENV_FILE:-/etc/mdb/testnet.env}"
    rpc="${MDB_TESTNET_RPC_URL:-http://127.0.0.1:18548}"
    manifest="$repo_root/packages/contracts/deployments/testnet-v3.json"
    status_url="${MDB_TESTNET_STATUS_URL:-http://127.0.0.1:3001/api/status}"
    expected_chain=46630
    [[ "${MDB_TESTNET_BROADCAST:-false}" == "true" ]] || {
      echo "Refusing testnet upgrade without MDB_TESTNET_BROADCAST=true." >&2
      exit 1
    }
    ;;
  *)
    echo "Usage: $0 devnet|testnet" >&2
    exit 2
    ;;
esac

[[ -r "$env_file" && -r "$manifest" ]]
set -a
# shellcheck disable=SC1090
source "$env_file"
set +a
[[ "$(cast chain-id --rpc-url "$rpc")" == "$expected_chain" ]]
[[ "${MDB_CREATOR_RISK_MIGRATION:-false}" == "true" ]] || {
  echo "Refusing migration without MDB_CREATOR_RISK_MIGRATION=true." >&2
  exit 1
}

basket="$(jq -er '.contracts.basket // .basket' "$manifest")"
registry="$(jq -er '.contracts.assetRegistry // .assetRegistry' "$manifest")"
approved_assets="$(jq -er '[.assets[] | select(.active // true) | .address] | join(",")' "$manifest")"
evidence_dir="$repo_root/var/$mode-readiness/creator-risk"
mkdir -p "$evidence_dir"
evidence="$evidence_dir/migration.json"
before_status="$evidence_dir/status-before.json"
after_status="$evidence_dir/status-after.json"
before_projection="$evidence_dir/state-before.json"
after_projection="$evidence_dir/state-after.json"
curl --fail --silent --show-error --max-time 30 "$status_url" > "$before_status"
jq -S '{supply, holdings, currentWeightsBps, pieces}' "$before_status" > "$before_projection"

if [[ "$mode" == "devnet" ]]; then
  private_key="${MDB_DEV_PRIVATE_KEY:-${DEPLOYER_PRIVATE_KEY:-}}"
  [[ -n "$private_key" ]]
  creator="${MDB_CREATOR_RISK_AUTHORITY:-$(cast wallet address --private-key "$private_key")}" 
  signer=(--private-key "$private_key")
else
  [[ -z "$(git -c safe.directory="$repo_root" -C "$repo_root" status --porcelain)" ]]
  [[ "$(git -c safe.directory="$repo_root" -C "$repo_root" rev-parse HEAD)" == \
    "$(git -c safe.directory="$repo_root" -C "$repo_root" rev-parse '@{u}')" ]]
  creator="${MDB_CREATOR_RISK_AUTHORITY:?}"
  signer=(--keystore "${MDB_OPERATOR_KEYSTORE:?}" --password-file "${MDB_OPERATOR_PASSWORD_FILE:?}")
fi

before_supply="$(cast call "$basket" 'totalSupply()(uint256)' --rpc-url "$rpc" | awk '{print $1}')"
before_nav="$(cast call "$basket" 'totalAssetsUsd()(uint256)' --rpc-url "$rpc" | awk '{print $1}')"
before_cap="$(cast call "$basket" 'tvlCapUsdWad()(uint256)' --rpc-url "$rpc" | awk '{print $1}')"
implementation_slot="0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
before_basket_implementation="0x$(cast storage "$basket" "$implementation_slot" --rpc-url "$rpc" | tail -c 41)"
before_registry_implementation="0x$(cast storage "$registry" "$implementation_slot" --rpc-url "$rpc" | tail -c 41)"
before_basket_code_hash="$(cast keccak "$(cast code "$before_basket_implementation" --rpc-url "$rpc")")"
before_registry_code_hash="$(cast keccak "$(cast code "$before_registry_implementation" --rpc-url "$rpc")")"

cd "$repo_root/packages/contracts"
MDB_CREATOR_RISK_MIGRATION=true \
MDB_BASKET="$basket" \
MDB_REGISTRY="$registry" \
MDB_CREATOR_RISK_AUTHORITY="$creator" \
MDB_CREATOR_APPROVED_ASSETS="$approved_assets" \
MDB_CREATOR_RISK_EVIDENCE="$evidence" \
forge script script/UpgradeCreatorRisk.s.sol:UpgradeCreatorRisk \
  --rpc-url "$rpc" "${signer[@]}" --broadcast --slow --gas-estimate-multiplier 175

controller="$(jq -er '.riskController' "$evidence")"
risk_role="$(cast keccak 'RISK_ADMIN_ROLE')"
controller_implementation="0x$(cast storage "$controller" "$implementation_slot" --rpc-url "$rpc" | tail -c 41)"
controller_code_hash="$(cast keccak "$(cast code "$controller_implementation" --rpc-url "$rpc")")"
[[ "$(cast call "$registry" 'riskPolicySchemaVersion()(uint16)' --rpc-url "$rpc" | awk '{print $1}')" == "1" ]]
[[ "$(cast call "$controller" 'riskAuthority()(address)' --rpc-url "$rpc" | tr '[:upper:]' '[:lower:]')" == "$(tr '[:upper:]' '[:lower:]' <<<"$creator")" ]]
[[ "$(cast call "$controller" 'riskIncreaseDelay()(uint64)' --rpc-url "$rpc" | awk '{print $1}')" == "172800" ]]
[[ "$(cast call "$basket" 'hasRole(bytes32,address)(bool)' "$risk_role" "$controller" --rpc-url "$rpc")" == "true" ]]
[[ "$(cast call "$registry" 'hasRole(bytes32,address)(bool)' "$risk_role" "$controller" --rpc-url "$rpc")" == "true" ]]
[[ "$(cast call "$basket" 'tvlCapUsdWad()(uint256)' --rpc-url "$rpc" | awk '{print $1}')" == "60000000000000000000000" ]]
[[ "$(cast call "$basket" 'totalSupply()(uint256)' --rpc-url "$rpc" | awk '{print $1}')" == "$before_supply" ]]
[[ "$(cast call "$basket" 'totalAssetsUsd()(uint256)' --rpc-url "$rpc" | awk '{print $1}')" == "$before_nav" ]]
IFS=',' read -r -a approved_asset_list <<<"$approved_assets"
for token in "${approved_asset_list[@]}"; do
  [[ "$(cast call "$registry" 'isCreatorApproved(address)(bool)' "$token" --rpc-url "$rpc")" == "true" ]]
  [[ "$(cast call "$registry" 'isActive(address)(bool)' "$token" --rpc-url "$rpc")" == "true" ]]
done
after_basket_implementation="0x$(cast storage "$basket" "$implementation_slot" --rpc-url "$rpc" | tail -c 41)"
after_registry_implementation="0x$(cast storage "$registry" "$implementation_slot" --rpc-url "$rpc" | tail -c 41)"
[[ "$after_basket_implementation" != "$before_basket_implementation" ]]
[[ "$after_registry_implementation" != "$before_registry_implementation" ]]
after_basket_code_hash="$(cast keccak "$(cast code "$after_basket_implementation" --rpc-url "$rpc")")"
after_registry_code_hash="$(cast keccak "$(cast code "$after_registry_implementation" --rpc-url "$rpc")")"
curl --fail --silent --show-error --max-time 30 "$status_url" > "$after_status"
jq -S '{supply, holdings, currentWeightsBps, pieces}' "$after_status" > "$after_projection"
cmp --silent "$before_projection" "$after_projection"
state_snapshot_hash="$(sha256sum "$after_projection" | awk '{print $1}')"

tmp_evidence="$(mktemp)"
jq --arg stateSnapshotHash "$state_snapshot_hash" \
  --arg beforeBasketImplementation "$before_basket_implementation" \
  --arg afterBasketImplementation "$after_basket_implementation" \
  --arg beforeBasketCodeHash "$before_basket_code_hash" \
  --arg afterBasketCodeHash "$after_basket_code_hash" \
  --arg beforeRegistryImplementation "$before_registry_implementation" \
  --arg afterRegistryImplementation "$after_registry_implementation" \
  --arg beforeRegistryCodeHash "$before_registry_code_hash" \
  --arg afterRegistryCodeHash "$after_registry_code_hash" \
  --arg controllerImplementation "$controller_implementation" \
  --arg controllerCodeHash "$controller_code_hash" \
  '.stateSnapshotHash = $stateSnapshotHash |
   .statePreserved = true |
   .implementations = {
     riskController: {
       current: $controllerImplementation,
       codeHash: $controllerCodeHash
     },
     basket: {
       before: $beforeBasketImplementation,
       after: $afterBasketImplementation,
       beforeCodeHash: $beforeBasketCodeHash,
       afterCodeHash: $afterBasketCodeHash
     },
     assetRegistry: {
       before: $beforeRegistryImplementation,
       after: $afterRegistryImplementation,
       beforeCodeHash: $beforeRegistryCodeHash,
       afterCodeHash: $afterRegistryCodeHash
     }
   }' \
  "$evidence" > "$tmp_evidence"
mv "$tmp_evidence" "$evidence"

tmp_manifest="$(mktemp)"
jq --arg controller "$controller" --arg creator "$creator" --arg beforeCap "$before_cap" \
  --arg basketImplementation "$after_basket_implementation" \
  --arg assetRegistryImplementation "$after_registry_implementation" \
  --arg stateSnapshotHash "$state_snapshot_hash" '
  .riskController = $controller |
  .contracts.riskController = $controller |
  .contracts.basketImplementation = $basketImplementation |
  .contracts.assetRegistryImplementation = $assetRegistryImplementation |
  .riskPolicy = {
    schemaVersion: 1,
    authority: $creator,
    increaseDelaySeconds: 172800,
    initialTvlCapUsdWad: "60000000000000000000000",
    previousTvlCapUsdWad: $beforeCap,
    preservedStateHash: $stateSnapshotHash
  }
' "$manifest" > "$tmp_manifest"
mv "$tmp_manifest" "$manifest"

echo "Creator risk controls verified on chain $expected_chain at $controller."
