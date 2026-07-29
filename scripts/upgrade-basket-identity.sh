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

[[ -r "$env_file" && -r "$manifest" ]]
set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

chain_id="$(cast chain-id --rpc-url "$rpc")"
basket="$(jq -er '.contracts.basket // .basket' "$manifest")"
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

evidence_dir="$repo_root/var/release-evidence/basket-identity/$mode"
mkdir -p "$evidence_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
before="$evidence_dir/${stamp}-before.json"
after="$evidence_dir/${stamp}-after.json"
implementation_slot="0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"

snapshot() {
  local output="$1"
  jq -n \
    --arg chainId "$chain_id" \
    --arg basket "$basket" \
    --arg implementation "$(cast storage "$basket" "$implementation_slot" --rpc-url "$rpc")" \
    --arg name "$(cast call "$basket" 'name()(string)' --rpc-url "$rpc")" \
    --arg symbol "$(cast call "$basket" 'symbol()(string)' --rpc-url "$rpc")" \
    --arg supply "$(cast call "$basket" 'totalSupply()(uint256)' --rpc-url "$rpc")" \
    --arg nextRedemptionRequestId "$(cast call "$basket" 'nextRedemptionRequestId()(uint256)' --rpc-url "$rpc")" \
    --arg nextRedemptionToProcess "$(cast call "$basket" 'nextRedemptionToProcess()(uint256)' --rpc-url "$rpc")" \
    --arg buysEnabled "$(cast call "$basket" 'buysEnabled()(bool)' --rpc-url "$rpc")" \
    --arg sellsEnabled "$(cast call "$basket" 'sellsEnabled()(bool)' --rpc-url "$rpc")" \
    --arg rebalancesEnabled "$(cast call "$basket" 'rebalancesEnabled()(bool)' --rpc-url "$rpc")" \
    '{
      chainId: ($chainId | tonumber),
      basket: $basket,
      implementation: $implementation,
      name: $name,
      symbol: $symbol,
      totalSupply: $supply,
      nextRedemptionRequestId: $nextRedemptionRequestId,
      nextRedemptionToProcess: $nextRedemptionToProcess,
      buysEnabled: ($buysEnabled == "true"),
      sellsEnabled: ($sellsEnabled == "true"),
      rebalancesEnabled: ($rebalancesEnabled == "true")
    }' >"$output"
}

snapshot "$before"
cd "$repo_root/packages/contracts"
MDB_BASKET="$basket" forge script \
  script/UpgradeBasketIdentity.s.sol:UpgradeBasketIdentity \
  --rpc-url "$rpc" \
  "${signer[@]}" \
  --broadcast \
  --slow \
  --gas-estimate-multiplier 175
cd "$repo_root"
snapshot "$after"

jq -e --slurp '
  .[1].name == "\"42 Braincells\"" and
  .[1].symbol == "\"BRAINS\"" and
  .[1].implementation != .[0].implementation and
  .[1].totalSupply == .[0].totalSupply and
  .[1].nextRedemptionRequestId == .[0].nextRedemptionRequestId and
  .[1].nextRedemptionToProcess == .[0].nextRedemptionToProcess and
  .[1].buysEnabled == .[0].buysEnabled and
  .[1].sellsEnabled == .[0].sellsEnabled and
  .[1].rebalancesEnabled == .[0].rebalancesEnabled
' "$before" "$after" >/dev/null

echo "$before"
echo "$after"
