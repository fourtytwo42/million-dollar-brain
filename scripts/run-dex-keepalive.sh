#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="/home/hendo420/.local/node/bin:/home/hendo420/.foundry/bin:/usr/bin:/bin"

mode="${MDB_NETWORK_MODE:-local}"
case "$mode" in
  local)
    config_key="local"
    default_deployer="0xa0Ee7A142d267C1f36714E4a8F75612F20a79720"
    default_private_key="0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6"
    ;;
  testnet)
    config_key="testnet"
    default_deployer=""
    default_private_key=""
    ;;
  *)
    echo "DEX keepalive is prohibited for network mode $mode" >&2
    exit 1
    ;;
esac

network_config="$repo_root/config/networks.json"
rpc_url="$(jq -r --arg key "$config_key" '.[$key].serverRpcUrl' "$network_config")"
manifest="$(jq -r --arg key "$config_key" '.[$key].deploymentFile' "$network_config")"
(( $(jq -r '.schemaVersion // 0' "$manifest") >= 4 )) || {
  echo "DEX manifest V4 or newer is not active for $mode" >&2
  exit 1
}
execution_mode="$(jq -r '.executionMode' "$manifest")"
case "$execution_mode" in
  uniswap-v3-structured|uniswap-v3-capacity-v3)
    ;;
  *)
    echo "structured DEX execution is not active for $mode" >&2
    exit 1
    ;;
esac

reserve="$(jq -r '.assets[] | select(.kind == "reserve") | .address' "$manifest")"
mapfile -t assets < <(jq -r '.assets[] | select(.kind != "reserve") | .address' "$manifest")
router="$(jq -r '.dexVenue.router' "$manifest")"
deployer="${MDB_DEX_KEEPALIVE_ADDRESS:-$default_deployer}"

signer=()
if [[ -n "${MDB_DEX_KEEPALIVE_PRIVATE_KEY:-$default_private_key}" ]]; then
  signer=(--private-key "${MDB_DEX_KEEPALIVE_PRIVATE_KEY:-$default_private_key}")
elif [[ -n "${MDB_DEX_KEEPALIVE_KEYSTORE:-}" && -n "${MDB_DEX_KEEPALIVE_PASSWORD_FILE:-}" ]]; then
  signer=(--keystore "$MDB_DEX_KEEPALIVE_KEYSTORE" --password-file "$MDB_DEX_KEEPALIVE_PASSWORD_FILE")
  if [[ -z "$deployer" ]]; then
    deployer="$(
      cast wallet address \
        --keystore "$MDB_DEX_KEEPALIVE_KEYSTORE" \
        --password-file "$MDB_DEX_KEEPALIVE_PASSWORD_FILE"
    )"
  fi
else
  echo "DEX keepalive signer is not configured for $mode" >&2
  exit 1
fi

[[ -n "$deployer" && -n "$reserve" && "${#assets[@]}" -gt 0 && -n "$router" ]] || {
  echo "DEX keepalive manifest is incomplete" >&2
  exit 1
}

export MDB_DEPLOYER_ADDRESS="$deployer"
export MDB_RESERVE="$reserve"
export MDB_DEX_ROUTER="$router"

cd "$repo_root/packages/contracts"
exec 9>"/tmp/42-braincells-dex-keepalive-$mode.lock"
flock --nonblock 9 || exit 0

observation_index() {
  cast call "$1" "slot0()(uint160,int24,uint16,uint16,uint16,uint8,bool)" \
    --rpc-url "$rpc_url" | sed -n '3p' | awk '{print $1}'
}

warm_asset() {
  local asset="$1"
  local pool before after amount
  pool="$(
    jq -r --arg asset "${asset,,}" \
      '.dexVenue.pools[]
       | select((.token0 | ascii_downcase) == $asset or (.token1 | ascii_downcase) == $asset)
       | .address' "$manifest" | head -1
  )"
  [[ -n "$pool" ]] || {
    echo "No approved DEX pool found for heartbeat asset $asset" >&2
    return 1
  }

  before="$(observation_index "$pool")"
  for amount in \
    "${MDB_DEX_KEEPALIVE_AMOUNT:-500000000000000000000}" \
    "${MDB_DEX_KEEPALIVE_ESCALATED_AMOUNT:-2500000000000000000000}" \
    "${MDB_DEX_KEEPALIVE_MAX_AMOUNT:-10000000000000000000000}"
  do
    export MDB_DEX_ASSETS="$asset"
    export MDB_DEX_KEEPALIVE_AMOUNT="$amount"
    forge script script/WarmDexPools.s.sol:WarmDexPools \
      --rpc-url "$rpc_url" \
      "${signer[@]}" \
      --broadcast \
      --slow \
      --non-interactive
    after="$(observation_index "$pool")"
    if [[ "$after" != "$before" ]]; then
      echo "DEX observation advanced asset=$asset pool=$pool index=$before->$after amount=$amount"
      return 0
    fi
  done

  echo "DEX observation did not advance for asset=$asset pool=$pool after bounded attempts" >&2
  return 1
}

for asset in "${assets[@]}"; do
  warm_asset "$asset"
done
