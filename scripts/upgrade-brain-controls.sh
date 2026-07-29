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
    status_url="${MDB_LOCAL_STATUS_URL:-http://127.0.0.1:3000/api/status}"
    ;;
  testnet)
    env_file="${MDB_TESTNET_ENV_FILE:-/etc/mdb/testnet.env}"
    rpc="${MDB_TESTNET_RPC_URL:-http://127.0.0.1:18548}"
    manifest="$repo_root/packages/contracts/deployments/testnet-v3.json"
    status_url="${MDB_TESTNET_STATUS_URL:-http://127.0.0.1:3001/api/status}"
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
brain="$(jq -er '.contracts.brain // .brain' "$manifest")"
asset_registry="$(jq -r '.contracts.assetRegistry // .assetRegistry // empty' "$manifest")"
if [[ "$mode" == "local" ]]; then
  [[ "$chain_id" == "31337" ]]
  private_key="${MDB_DEV_PRIVATE_KEY:-${DEPLOYER_PRIVATE_KEY:-}}"
  [[ -n "$private_key" ]]
  deployer="$(cast wallet address "$private_key")"
  signer=(--private-key "$private_key")
  assets="$(jq -r '[.usdg,.aapl,.nvda,.ethx] | join(",")' "$manifest")"
  asset_ids="1,2,3,12"
else
  [[ "$chain_id" == "46630" ]]
  [[ -n "$asset_registry" ]]
  [[ -r "${MDB_OPERATOR_KEYSTORE:?}" ]]
  [[ -r "${MDB_OPERATOR_PASSWORD_FILE:?}" ]]
  [[ -z "$(git -C "$repo_root" status --porcelain)" ]]
  [[ "$(git -C "$repo_root" rev-parse HEAD)" == "$(git -C "$repo_root" rev-parse '@{u}')" ]]
  deployer="${MDB_DEPLOYER_ADDRESS:-$(jq -er '.deployer' "$manifest")}"
  signer=(--keystore "$MDB_OPERATOR_KEYSTORE" --password-file "$MDB_OPERATOR_PASSWORD_FILE")
  assets="$(jq -r '[.assets[].address] | join(",")' "$manifest")"
  asset_ids="$(seq -s, 1 "$(jq '.assets | length' "$manifest")")"
fi

node --experimental-strip-types \
  "$repo_root/scripts/generate-control-catalog.mjs" \
  "$repo_root/packages/contracts/deployments/control-catalog-v1.json" >/dev/null

evidence_dir="$repo_root/var/release-evidence/control-v1/$mode"
mkdir -p "$evidence_dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
cp "$manifest" "$evidence_dir/${stamp}-manifest-before.json"
curl -fsS "$status_url" >"$evidence_dir/${stamp}-status-before.json"
jq '{
  activation,
  pieces: [.pieces[] | {
    id, owner, unowned, price, preset, portraitHash, ownershipSerial,
    profileChangeAvailable, customName, profileUrl
  }],
  rewards,
  nav,
  navPerShare,
  supply,
  holdings,
  currentWeightsBps,
  portfolioAccounting: (.portfolioAccounting | del(.observedAt, .sourceHash))
}' "$evidence_dir/${stamp}-status-before.json" \
  >"$evidence_dir/${stamp}-state-before.json"
{
  jq -r '.contracts // {} | to_entries[] | [.key,.value] | @tsv' "$manifest"
  jq -r '.assets[]? | [("asset:" + .symbol),.address] | @tsv' "$manifest"
} | while IFS=$'\t' read -r label address; do
  [[ "$address" =~ ^0x[0-9a-fA-F]{40}$ ]] || continue
  code_hash="$(cast code "$address" --rpc-url "$rpc" | cast keccak)"
  implementation="$(
    cast storage "$address" \
      0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc \
      --rpc-url "$rpc" 2>/dev/null || true
  )"
  printf '%s\t%s\t%s\t%s\n' "$label" "$address" "$code_hash" "$implementation"
done >"$evidence_dir/${stamp}-contracts-before.tsv"
{
  echo "{\"chainId\":$chain_id,\"brain\":\"$brain\",\"block\":\"$(cast block-number --rpc-url "$rpc")\"}"
  for piece_id in $(seq 1 42); do
    owner="$(cast call "$brain" 'ownerOf(uint256)(address)' "$piece_id" --rpc-url "$rpc")"
    price="$(cast call "$brain" 'currentPrice(uint256)(uint256)' "$piece_id" --rpc-url "$rpc")"
    preset="$(cast call "$brain" 'selectedPreset(uint256)(uint8)' "$piece_id" --rpc-url "$rpc")"
    printf '%s %s %s %s\n' "$piece_id" "$owner" "$price" "$preset"
  done
} >"$evidence_dir/${stamp}-brain-before.txt"

cd "$repo_root/packages/contracts"
log="$evidence_dir/${stamp}-upgrade.log"
MDB_DEPLOYER_ADDRESS="$deployer" \
MDB_BRAIN="$brain" \
MDB_ASSET_REGISTRY="$asset_registry" \
MDB_CONTROL_ASSETS="$assets" \
MDB_CONTROL_ASSET_IDS="$asset_ids" \
  forge script script/UpgradeBrainControls.s.sol:UpgradeBrainControls \
    --rpc-url "$rpc" \
    "${signer[@]}" \
    --broadcast \
    --slow \
    --gas-estimate-multiplier 175 | tee "$log"

control_registry="$(awk '$1=="BRAIN_CONTROL_REGISTRY" {print $2}' "$log" | tail -1)"
resolved_asset_registry="$(awk '$1=="ASSET_REGISTRY" {print $2}' "$log" | tail -1)"
[[ "$control_registry" =~ ^0x[0-9a-fA-F]{40}$ ]]
[[ "$resolved_asset_registry" =~ ^0x[0-9a-fA-F]{40}$ ]]
catalog_hash="$(jq -er '.catalogHash' deployments/control-catalog-v1.json)"

tmp_manifest="$(mktemp)"
if [[ "$mode" == "local" ]]; then
  jq \
    --arg registry "$resolved_asset_registry" \
    --arg controls "$control_registry" \
    --arg hash "$catalog_hash" \
    '.assetRegistry=$registry
     | .brainControlRegistry=$controls
     | .controlCatalogHash=$hash
     | .controlSchemaVersion=1
     | .controlCatalogVersion=1' \
    "$manifest" >"$tmp_manifest"
else
  jq \
    --arg registry "$resolved_asset_registry" \
    --arg controls "$control_registry" \
    --arg hash "$catalog_hash" \
    --arg sha "$(git -C "$repo_root" rev-parse HEAD)" \
    '.contracts.assetRegistry=$registry
     | .contracts.brainControlRegistry=$controls
     | .assetRegistry=$registry
     | .brainControlRegistry=$controls
     | .controlCatalogHash=$hash
     | .controlSchemaVersion=1
     | .controlCatalogVersion=1
     | .releaseCommit=$sha
     | .assets |= to_entries | .assets |= map(
         .value
         + {controlId:(.key+1)}
         + {tags:
             (if .value.symbol=="USDG" then ["reserve"]
              elif .value.symbol=="AAPL" then ["technology"]
              elif (.value.symbol=="NVDA" or .value.symbol=="MSFT") then ["technology","ai_semiconductor"]
              elif .value.symbol=="AMZN" then ["technology","consumer_discretionary"]
              elif (.value.symbol=="GOOGL" or .value.symbol=="META") then ["technology","communications"]
              elif .value.symbol=="TSLA" then ["consumer_discretionary"]
              elif .value.symbol=="SPY" then ["broad_market"]
              elif .value.symbol=="QQQ" then ["broad_market","technology"]
              elif .value.symbol=="SOXX" then ["broad_market","technology","ai_semiconductor"]
              elif .value.symbol=="WETH" then ["crypto_major"]
              else [] end)}
       )' \
    "$manifest" >"$tmp_manifest"
fi
mv "$tmp_manifest" "$manifest"

cast call "$brain" 'controlBundlesEnabled()(bool)' --rpc-url "$rpc" | grep -qx true
cast call "$control_registry" \
  'controlBundle(uint256)(uint16,bytes32,bytes32,bytes32,uint64,uint64)' \
  42 --rpc-url "$rpc" >/dev/null
curl -fsS "$status_url" >"$evidence_dir/${stamp}-status-after.json"
jq '{
  activation,
  pieces: [.pieces[] | {
    id, owner, unowned, price, preset, portraitHash, ownershipSerial,
    profileChangeAvailable, customName, profileUrl
  }],
  rewards,
  nav,
  navPerShare,
  supply,
  holdings,
  currentWeightsBps,
  portfolioAccounting: (.portfolioAccounting | del(.observedAt, .sourceHash))
}' "$evidence_dir/${stamp}-status-after.json" \
  >"$evidence_dir/${stamp}-state-after.json"
diff -u \
  "$evidence_dir/${stamp}-state-before.json" \
  "$evidence_dir/${stamp}-state-after.json" \
  >"$evidence_dir/${stamp}-state-reconciliation.diff"
cp "$manifest" "$evidence_dir/${stamp}-manifest-after.json"
echo "Control Catalog v1 active on chain $chain_id at $control_registry"
