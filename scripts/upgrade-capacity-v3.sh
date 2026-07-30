#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mode="${1:-}"
export PATH="/home/hendo420/.foundry/bin:/home/hendo420/.local/node/bin:/usr/bin:/bin"

case "$mode" in
  devnet)
    env_file="${MDB_DEVNET_ENV_FILE:-/etc/mdb/devnet.env}"
    rpc="${MDB_DEVNET_RPC_URL:-http://127.0.0.1:8545}"
    manifest="$repo_root/packages/contracts/deployments/local-v3.json"
    expected_chain=31337
    ;;
  testnet)
    env_file="${MDB_TESTNET_ENV_FILE:-/etc/mdb/testnet.env}"
    rpc="${MDB_TESTNET_RPC_URL:-http://127.0.0.1:18548}"
    manifest="$repo_root/packages/contracts/deployments/testnet-v3.json"
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
[[ "${MDB_CAPACITY_V3_MIGRATION:-false}" == "true" ]] || {
  echo "Refusing migration without MDB_CAPACITY_V3_MIGRATION=true." >&2
  exit 1
}

registry="$(jq -er '.contracts.assetRegistry' "$manifest")"
valuation="$(jq -er '.contracts.dexValuationAdapter' "$manifest")"
execution="$(jq -er '.contracts.dexExecutionAdapter' "$manifest")"
basket="$(jq -er '.contracts.basket' "$manifest")"
assets="$(jq -er '[.assets[].address] | join(",")' "$manifest")"
capacities="${MDB_CAPACITY_V3_CAPACITIES_USD_WAD:?Provide one capacity per manifest asset, including zero for USDG}"
[[ "$(tr ',' '\n' <<<"$assets" | wc -l)" == "$(tr ',' '\n' <<<"$capacities" | wc -l)" ]]

if [[ "$mode" == "devnet" ]]; then
  private_key="${MDB_DEV_PRIVATE_KEY:-${DEPLOYER_PRIVATE_KEY:-}}"
  [[ -n "$private_key" ]]
  signer=(--private-key "$private_key")
else
  [[ -z "$(git -c safe.directory="$repo_root" -C "$repo_root" status --porcelain)" ]]
  [[ "$(git -c safe.directory="$repo_root" -C "$repo_root" rev-parse HEAD)" == \
    "$(git -c safe.directory="$repo_root" -C "$repo_root" rev-parse '@{u}')" ]]
  signer=(
    --keystore "${MDB_OPERATOR_KEYSTORE:?}"
    --password-file "${MDB_OPERATOR_PASSWORD_FILE:?}"
  )
fi

cd "$repo_root/packages/contracts"
MDB_REGISTRY="$registry" \
  MDB_DEX_VALUATION_ADAPTER="$valuation" \
  MDB_DEX_EXECUTION_ADAPTER="$execution" \
  MDB_BASKET="$basket" \
  MDB_CAPACITY_V3_ASSETS="$assets" \
  MDB_CAPACITY_V3_CAPACITIES_USD_WAD="$capacities" \
  forge script script/UpgradeCapacityV3.s.sol:UpgradeCapacityV3 \
    --rpc-url "$rpc" "${signer[@]}" --broadcast --slow --gas-estimate-multiplier 175

[[ "$(cast call "$registry" 'qualificationSchemaVersion()(uint16)' --rpc-url "$rpc")" == "3" ]]
[[ "$(cast call "$registry" 'qualificationV3Enabled()(bool)' --rpc-url "$rpc")" == "true" ]]
[[ "$(cast call "$valuation" 'longTwapWindow()(uint32)' --rpc-url "$rpc")" == "14400" ]]
[[ "$(cast call "$valuation" 'dexSafetyV2Enabled()(bool)' --rpc-url "$rpc")" == "true" ]]
[[ "$(cast call "$execution" 'dexOnlySafetyEnabled()(bool)' --rpc-url "$rpc")" == "true" ]]
[[ "$(cast call "$basket" 'tvlCapUsdWad()(uint256)' --rpc-url "$rpc")" == \
  "60000000000000000000000" ]]

echo "DEX-native capacity V3 migration verified on chain $expected_chain."
