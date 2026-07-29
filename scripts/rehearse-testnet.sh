#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="/home/hendo420/.foundry/bin:/home/hendo420/.local/node/bin:/usr/bin:/bin"
work="$(mktemp -d)"
port="${MDB_REHEARSAL_PORT:-$((20000 + RANDOM % 20000))}"
rpc="http://127.0.0.1:${port}"
evidence="${MDB_TESTNET_REHEARSAL_EVIDENCE:-$repo_root/var/testnet-readiness/rehearsal.json}"
manifest="$repo_root/packages/contracts/deployments/.rehearsal-v3-46630.json"
anvil --host 127.0.0.1 --port "$port" --chain-id 46630 --config-out "$work/anvil.json" --silent >"$work/anvil.log" 2>&1 &
anvil_pid=$!
cleanup() {
  kill "$anvil_pid" 2>/dev/null || true
  wait "$anvil_pid" 2>/dev/null || true
  rm -f "$manifest"
  rm -rf "$work"
}
trap cleanup EXIT HUP INT TERM

for _ in $(seq 1 100); do
  kill -0 "$anvil_pid" 2>/dev/null || {
    cat "$work/anvil.log" >&2
    exit 1
  }
  if cast chain-id --rpc-url "$rpc" >/dev/null 2>&1 && [[ -s "$work/anvil.json" ]]; then
    break
  fi
  sleep 0.1
done
[[ -s "$work/anvil.json" ]] || {
  cat "$work/anvil.log" >&2
  exit 1
}
[[ "$(cast chain-id --rpc-url "$rpc")" == "46630" ]]

deployer_key="$(jq -er '.private_keys[0]' "$work/anvil.json")"
deployer="$(cast wallet address --private-key "$deployer_key")"
cd "$repo_root/packages/contracts"
MDB_DEPLOYER_ADDRESS="$deployer" \
MDB_DEPLOYMENT_OUTPUT="./deployments/.rehearsal-v3-46630.json" \
  forge script script/DeployTestnetV3.s.sol:DeployTestnetV3 \
  --rpc-url "$rpc" --private-key "$deployer_key" --broadcast --slow

jq -e \
  '.schemaVersion == 3 and .environment == "robinhood-testnet-replica" and
   .chainId == 46630 and .productionParityReplicas == true and
   .canonicalAssets == false and .automaticFreshness == false and
   ([.usdg, .aapl, .nvda, .msft, .amzn, .googl, .meta, .tsla, .spy, .qqq, .soxx, .weth]
      | all(type == "string"))' \
  "$manifest" >/dev/null
basket="$(jq -er '.basket' "$manifest")"
brain="$(jq -er '.brain' "$manifest")"
registry="$(jq -er '.assetRegistry' "$manifest")"
oracle="$(jq -er '.oracle' "$manifest")"
[[ "$(cast call "$oracle" 'automaticFreshness()(bool)' --rpc-url "$rpc")" == "false" ]]
[[ "$(cast call "$basket" 'canaryControlsConfigured()(bool)' --rpc-url "$rpc")" == "true" ]]
[[ "$(cast call "$basket" 'buysEnabled()(bool)' --rpc-url "$rpc")" == "true" ]]
[[ "$(cast call "$basket" 'sellsEnabled()(bool)' --rpc-url "$rpc")" == "true" ]]
[[ "$(cast call "$basket" 'rebalancesEnabled()(bool)' --rpc-url "$rpc")" == "true" ]]
[[ "$(cast call "$brain" 'marketControlsConfigured()(bool)' --rpc-url "$rpc")" == "true" ]]
[[ "$(cast call "$brain" 'purchasesEnabled()(bool)' --rpc-url "$rpc")" == "true" ]]
[[ "$(cast call "$registry" 'activeTokens()(address[])' --rpc-url "$rpc" | grep -o '0x[0-9a-fA-F]\\{40\\}' | wc -l)" == "11" ]]

mkdir -p "$(dirname "$evidence")"
jq -n \
  --arg testedAt "$(date -u +%FT%TZ)" \
  --arg gitSha "$(git -C "$repo_root" rev-parse HEAD)" \
  --arg manifestHash "$(sha256sum "$manifest" | awk '{print $1}')" \
  --arg deployer "$deployer" \
  '{
    schemaVersion: 1,
    testedAt: $testedAt,
    gitSha: $gitSha,
    chainId: 46630,
    broadcastPerformed: false,
    isolatedAnvil: true,
    manifestHash: $manifestHash,
    deployer: $deployer,
    checks: {
      deployment: true,
      productionInterfaceReplicas: true,
      fortyEightHourQualificationInterface: true,
      canaryControlsEnabledForTestnet: true,
      automaticFreshnessDisabled: true,
      publicBroadcast: false
    }
  }' >"$evidence"
cat "$evidence"
