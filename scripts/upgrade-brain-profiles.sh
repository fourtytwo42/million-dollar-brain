#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mode="${1:-}"
export PATH="/home/hendo420/.foundry/bin:/home/hendo420/.local/node/bin:/usr/bin:/bin"

case "$mode" in
  local)
    env_file="${MDB_LOCAL_ENV_FILE:-/etc/mdb/local.env}"
    rpc="${MDB_LOCAL_RPC_URL:-http://127.0.0.1:8545}"
    manifest="$repo_root/packages/contracts/deployments/local-v3.json"
    ;;
  testnet)
    env_file="${MDB_TESTNET_ENV_FILE:-/etc/mdb/testnet.env}"
    rpc="${MDB_TESTNET_RPC_URL:-http://127.0.0.1:18548}"
    manifest="$repo_root/packages/contracts/deployments/testnet-v3.json"
    [[ "${MDB_TESTNET_BROADCAST:-false}" == "true" ]] || {
      echo "Refusing testnet upgrade without MDB_TESTNET_BROADCAST=true." >&2
      exit 1
    }
    ;;
  *)
    echo "Usage: $0 local|testnet" >&2
    exit 2
    ;;
esac

[[ -r "$env_file" ]]
set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

brain="$(jq -er '.contracts.brain // .brain' "$manifest")"
chain_id="$(cast chain-id --rpc-url "$rpc")"
if [[ "$mode" == "local" ]]; then
  [[ "$chain_id" == "31337" ]]
  private_key="${MDB_DEV_PRIVATE_KEY:-${DEPLOYER_PRIVATE_KEY:-}}"
  [[ -n "$private_key" ]]
  signer=(--private-key "$private_key")
else
  [[ "$chain_id" == "46630" ]]
  [[ -r "${MDB_OPERATOR_KEYSTORE:?}" ]]
  [[ -r "${MDB_OPERATOR_PASSWORD_FILE:?}" ]]
  [[ -z "$(git -C "$repo_root" status --porcelain)" ]]
  [[ "$(git -C "$repo_root" rev-parse HEAD)" == "$(git -C "$repo_root" rev-parse '@{u}')" ]]
  signer=(--keystore "$MDB_OPERATOR_KEYSTORE" --password-file "$MDB_OPERATOR_PASSWORD_FILE")
fi

cd "$repo_root/packages/contracts"
MDB_BRAIN="$brain" forge script \
  script/UpgradeBrainProfiles.s.sol:UpgradeBrainProfiles \
  --rpc-url "$rpc" \
  "${signer[@]}" \
  --broadcast \
  --slow \
  --gas-estimate-multiplier 175

cast call "$brain" 'customName(uint256)(string)' 1 --rpc-url "$rpc" >/dev/null
cast call "$brain" 'profileUrl(uint256)(string)' 1 --rpc-url "$rpc" >/dev/null
cast call "$brain" 'customTagline(uint256)(string)' 1 --rpc-url "$rpc" >/dev/null
cast call "$brain" 'personaPack(uint256)(uint64)' 1 --rpc-url "$rpc" >/dev/null
[[ "$(cast call "$brain" 'profileCatalogVersion()(uint16)' --rpc-url "$rpc" | awk '{print $1}')" == "1" ]]
[[ "$(cast call "$brain" 'profileV2Enabled()(bool)' --rpc-url "$rpc")" == "true" ]]
cast call "$brain" 'canChangeProfile(uint256,address)(bool)' 1 "$brain" --rpc-url "$rpc" >/dev/null
echo "Brain Profile V2 is active on chain $chain_id at $brain"
