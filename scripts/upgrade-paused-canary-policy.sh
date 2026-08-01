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
    expected_chain=31337
    ;;
  testnet)
    env_file="${MDB_TESTNET_ENV_FILE:-/etc/mdb/testnet.env}"
    rpc="${MDB_TESTNET_RPC_URL:-http://127.0.0.1:18548}"
    manifest="$repo_root/packages/contracts/deployments/testnet-v3.json"
    expected_chain=46630
    [[ "${MDB_TESTNET_BROADCAST:-false}" == "true" ]]
    ;;
  *) echo "Usage: $0 devnet|testnet" >&2; exit 2 ;;
esac
[[ "${MDB_PAUSED_CANARY_POLICY_UPGRADE:-false}" == "true" ]]
[[ -r "$env_file" && -r "$manifest" ]]
set -a
# shellcheck disable=SC1090
source "$env_file"
set +a
[[ "$(cast chain-id --rpc-url "$rpc")" == "$expected_chain" ]]
cd "$repo_root"
if [[ "$mode" == "testnet" ]]; then
  [[ -z "$(git status --porcelain)" ]]
  [[ "$(git rev-parse HEAD)" == "$(git rev-parse '@{u}')" ]]
fi

registry="$(jq -er '.contracts.assetRegistry // .assetRegistry' "$manifest")"
controller="$(jq -er '.contracts.riskController // .riskController' "$manifest")"
evidence_dir="$repo_root/var/$mode-readiness/paused-canary-policy"
mkdir -p "$evidence_dir"
raw_evidence="$evidence_dir/upgrade-raw.json"
evidence="$evidence_dir/upgrade.json"
before_status="$evidence_dir/status-before.json"
after_status="$evidence_dir/status-after.json"
status_url="http://127.0.0.1:$([[ "$mode" == "devnet" ]] && echo 3000 || echo 3001)/api/status"
curl --fail --silent --show-error "$status_url" >"$before_status"
implementation_slot=0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc
before_registry="0x$(cast storage "$registry" "$implementation_slot" --rpc-url "$rpc" | tail -c 41)"
before_controller="0x$(cast storage "$controller" "$implementation_slot" --rpc-url "$rpc" | tail -c 41)"
authority_before="$(cast call "$controller" 'riskAuthority()(address)' --rpc-url "$rpc")"
delay_before="$(cast call "$controller" 'riskIncreaseDelay()(uint64)' --rpc-url "$rpc" | awk '{print $1}')"
if [[ "$mode" == "devnet" ]]; then
  signer=(--private-key "${MDB_DEV_PRIVATE_KEY:-${DEPLOYER_PRIVATE_KEY:?}}")
else
  signer=(--keystore "${MDB_OPERATOR_KEYSTORE:?}" --password-file "${MDB_OPERATOR_PASSWORD_FILE:?}")
fi

cd "$repo_root/packages/contracts"
MDB_REGISTRY="$registry" MDB_RISK_CONTROLLER="$controller" \
MDB_PAUSED_CANARY_UPGRADE_EVIDENCE="$raw_evidence" \
forge script script/UpgradePausedCanaryPolicy.s.sol:UpgradePausedCanaryPolicy \
  --rpc-url "$rpc" "${signer[@]}" --broadcast --slow --gas-estimate-multiplier 175
cd "$repo_root"
after_registry="0x$(cast storage "$registry" "$implementation_slot" --rpc-url "$rpc" | tail -c 41)"
after_controller="0x$(cast storage "$controller" "$implementation_slot" --rpc-url "$rpc" | tail -c 41)"
[[ "$after_registry" != "$before_registry" && "$after_controller" != "$before_controller" ]]
[[ "$(cast call "$controller" 'riskAuthority()(address)' --rpc-url "$rpc")" == "$authority_before" ]]
[[ "$(cast call "$controller" 'riskIncreaseDelay()(uint64)' --rpc-url "$rpc" | awk '{print $1}')" == "$delay_before" ]]
for token in $(jq -r '.assets[].address' "$manifest"); do
  cast call "$registry" 'hasCanonicalIdentity(address)(bool)' "$token" --rpc-url "$rpc" >/dev/null
  cast call "$registry" 'hasCurrentDexEvidenceV3(address)(bool)' "$token" --rpc-url "$rpc" >/dev/null
done
curl --fail --silent --show-error "$status_url" >"$after_status"
jq -S '{supply,holdings,currentWeightsBps,pieces,tvlCapUsdWad,riskPolicy}' "$before_status" >"$evidence_dir/before-projection.json"
jq -S '{supply,holdings,currentWeightsBps,pieces,tvlCapUsdWad,riskPolicy}' "$after_status" >"$evidence_dir/after-projection.json"
cmp --silent "$evidence_dir/before-projection.json" "$evidence_dir/after-projection.json"
jq --arg gitSha "$(git rev-parse HEAD)" --arg mode "$mode" \
  --arg beforeRegistry "$before_registry" --arg afterRegistry "$after_registry" \
  --arg beforeController "$before_controller" --arg afterController "$after_controller" \
  '. + {schemaVersion:1,gitSha:$gitSha,environment:$mode,statePreserved:true,
    before:{registryImplementation:$beforeRegistry,riskControllerImplementation:$beforeController},
    after:{registryImplementation:$afterRegistry,riskControllerImplementation:$afterController}}' \
  "$raw_evidence" >"$evidence"
if [[ "$mode" == "devnet" ]]; then
  tmp_manifest="$(mktemp)"
  jq --arg registryImplementation "$after_registry" \
    --arg riskControllerImplementation "$after_controller" \
    --arg releaseSha "$(git rev-parse HEAD)" '
    .contracts.assetRegistryImplementation = $registryImplementation |
    .contracts.riskControllerImplementation = $riskControllerImplementation |
    .release.gitSha = $releaseSha
  ' "$manifest" >"$tmp_manifest"
  mv "$tmp_manifest" "$manifest"
else
  release_dir="$repo_root/var/releases/$(git rev-parse HEAD)"
  mkdir -p "$release_dir"
  cp "$evidence" "$release_dir/testnet-paused-canary-policy-upgrade.json"
fi
echo "$evidence"
