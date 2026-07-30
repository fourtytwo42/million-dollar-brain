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
    output="$repo_root/var/devnet/capacity-candidates-v1.json"
    expected_chain=31337
    ;;
  testnet)
    env_file="${MDB_TESTNET_ENV_FILE:-/etc/mdb/testnet.env}"
    rpc="${MDB_TESTNET_RPC_URL:-http://127.0.0.1:18548}"
    manifest="$repo_root/packages/contracts/deployments/testnet-v3.json"
    output="$repo_root/var/testnet-v3/capacity-candidates-v1.json"
    expected_chain=46630
    [[ "${MDB_TESTNET_BROADCAST:-false}" == "true" ]] || {
      echo "Refusing testnet candidate deployment without MDB_TESTNET_BROADCAST=true." >&2
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

[[ "${MDB_CAPACITY_CANDIDATE_DEPLOY:-false}" == "true" ]] || {
  echo "Refusing deployment without MDB_CAPACITY_CANDIDATE_DEPLOY=true." >&2
  exit 1
}
[[ "$(cast chain-id --rpc-url "$rpc")" == "$expected_chain" ]]

registry="$(jq -er '.contracts.assetRegistry' "$manifest")"
valuation="$(jq -er '.contracts.dexValuationAdapter' "$manifest")"
execution="$(jq -er '.contracts.dexExecutionAdapter' "$manifest")"
reserve="$(jq -er '.assets[] | select(.symbol == "USDG") | .address' "$manifest")"
factory="$(jq -er '.dexVenue.factory' "$manifest")"
prices="${MDB_CAPACITY_CANDIDATE_PRICES_WAD:?GME,SPCX,VIRTUAL prices required}"
deployer="${MDB_DEPLOYER_ADDRESS:?}"
mkdir -p "$(dirname "$output")"

for id in 13 14 15; do
  [[ "$(cast call "$registry" 'tokenForAssetId(uint32)(address)' "$id" --rpc-url "$rpc")" == \
    "0x0000000000000000000000000000000000000000" ]]
done

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
MDB_DEPLOYER_ADDRESS="$deployer" \
  MDB_RESERVE="$reserve" \
  MDB_DEX_FACTORY="$factory" \
  MDB_REGISTRY="$registry" \
  MDB_DEX_VALUATION_ADAPTER="$valuation" \
  MDB_DEX_EXECUTION_ADAPTER="$execution" \
  MDB_CAPACITY_CANDIDATE_PRICES_WAD="$prices" \
  MDB_CAPACITY_CANDIDATE_OUTPUT="$output" \
  forge script script/DeployCapacityCandidates.s.sol:DeployCapacityCandidates \
    --rpc-url "$rpc" "${signer[@]}" --broadcast --slow --gas-estimate-multiplier 175

for id in 13 14 15; do
  token="$(cast call "$registry" 'tokenForAssetId(uint32)(address)' "$id" --rpc-url "$rpc")"
  [[ "$token" != "0x0000000000000000000000000000000000000000" ]]
  [[ "$(cast call "$registry" 'isActive(address)(bool)' "$token" --rpc-url "$rpc")" == "false" ]]
done

echo "Inactive capacity candidates deployed on chain $expected_chain: $output"
