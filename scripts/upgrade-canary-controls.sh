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
    rpc="https://rpc.testnet.chain.robinhood.com"
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

set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

basket="$(jq -er '.contracts.basket // .basket' "$manifest")"
brain="$(jq -er '.contracts.brain // .brain' "$manifest")"
registry="$(
  jq -r \
    '.contracts.assetRegistry // .contracts.registry // .assetRegistry // .registry // "0x0000000000000000000000000000000000000000"' \
    "$manifest"
)"
[[ "$(cast chain-id --rpc-url "$rpc")" == "$expected_chain" ]]

if [[ "$mode" == "devnet" ]]; then
  private_key="${MDB_DEV_PRIVATE_KEY:-${DEPLOYER_PRIVATE_KEY:-}}"
  [[ -n "$private_key" ]]
  signer=(--private-key "$private_key")
else
  [[ -z "$(git -c safe.directory="$repo_root" -C "$repo_root" status --porcelain)" ]]
  [[
    "$(git -c safe.directory="$repo_root" -C "$repo_root" rev-parse HEAD)"
      == "$(git -c safe.directory="$repo_root" -C "$repo_root" rev-parse '@{u}')"
  ]]
  signer=(--keystore "${MDB_OPERATOR_KEYSTORE:?}" --password-file "${MDB_OPERATOR_PASSWORD_FILE:?}")
fi

cd "$repo_root/packages/contracts"
MDB_BASKET="$basket" MDB_BRAIN="$brain" MDB_REGISTRY="$registry" \
  MDB_CANARY_BUYS_ENABLED=true MDB_CANARY_SELLS_ENABLED=true \
  MDB_CANARY_REBALANCES_ENABLED=true MDB_CANARY_BRAIN_PURCHASES_ENABLED=true \
  forge script script/UpgradeCanaryControls.s.sol:UpgradeCanaryControls \
    --rpc-url "$rpc" "${signer[@]}" --broadcast --slow --gas-estimate-multiplier 175

[[ "$(cast call "$basket" 'canaryControlsConfigured()(bool)' --rpc-url "$rpc")" == "true" ]]
[[ "$(cast call "$basket" 'buysEnabled()(bool)' --rpc-url "$rpc")" == "true" ]]
[[ "$(cast call "$basket" 'sellsEnabled()(bool)' --rpc-url "$rpc")" == "true" ]]
[[ "$(cast call "$basket" 'rebalancesEnabled()(bool)' --rpc-url "$rpc")" == "true" ]]
[[ "$(cast call "$brain" 'marketControlsConfigured()(bool)' --rpc-url "$rpc")" == "true" ]]
[[ "$(cast call "$brain" 'purchasesEnabled()(bool)' --rpc-url "$rpc")" == "true" ]]
echo "Canary controls upgraded and enabled on chain $expected_chain."
