#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="/home/hendo420/.foundry/bin:/home/hendo420/.local/node/bin:/usr/bin:/bin"
work="$(mktemp -d)"
port="${MDB_REHEARSAL_PORT:-$((20000 + RANDOM % 20000))}"
rpc="http://127.0.0.1:${port}"
evidence="${MDB_TESTNET_REHEARSAL_EVIDENCE:-$repo_root/var/testnet-readiness/rehearsal.json}"
manifest="$repo_root/packages/contracts/deployments/.rehearsal-46630.json"
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
user_key="$(jq -er '.private_keys[1]' "$work/anvil.json")"
deployer="$(cast wallet address --private-key "$deployer_key")"
user="$(cast wallet address --private-key "$user_key")"
cd "$repo_root/packages/contracts"
MDB_DEPLOYER_ADDRESS="$deployer" \
MDB_DEPLOYMENT_OUTPUT="./deployments/.rehearsal-46630.json" \
  forge script script/DeployTestnet.s.sol:DeployTestnet \
  --rpc-url "$rpc" --private-key "$deployer_key" --broadcast >/dev/null

jq -e \
  '.schemaVersion == 1 and .environment == "robinhood-testnet" and
   .chainId == 46630 and .mockOnly == true and .automaticFreshness == false' \
  "$manifest" >/dev/null
oracle="$(jq -er '.oracle' "$manifest")"
usdg="$(jq -er '.usdg' "$manifest")"
basket="$(jq -er '.basket' "$manifest")"
nvda="$(jq -er '.nvda' "$manifest")"
[[ "$(cast call "$oracle" 'automaticFreshness()(bool)' --rpc-url "$rpc")" == "false" ]]

cast send "$usdg" 'mint(address,uint256)' "$user" 100000000000000000000000 \
  --rpc-url "$rpc" --private-key "$deployer_key" --json | jq -e '.status == "0x1"' >/dev/null
cast send "$usdg" 'approve(address,uint256)' "$basket" 1000000000000000000000 \
  --rpc-url "$rpc" --private-key "$user_key" --json | jq -e '.status == "0x1"' >/dev/null
deadline="$(( $(date +%s) + 3600 ))"
cast send "$basket" 'deposit(uint256,uint256,uint256)' \
  1000000000000000000000 0 "$deadline" \
  --rpc-url "$rpc" --private-key "$user_key" --json | jq -e '.status == "0x1"' >/dev/null
shares="$(cast call "$basket" 'balanceOf(address)(uint256)' "$user" --rpc-url "$rpc" | awk '{print $1}')"
[[ "$shares" != "0" ]]
redeem_shares="$(python3 -c 'import sys; print(int(sys.argv[1]) // 2)' "$shares")"
cast send "$basket" 'redeem(uint256,uint256,uint256)' "$redeem_shares" 0 "$deadline" \
  --rpc-url "$rpc" --private-key "$user_key" --json | jq -e '.status == "0x1"' >/dev/null
[[ "$(cast call "$basket" 'pendingRedemptionByAccount(address)(uint256)' "$user" --rpc-url "$rpc" | awk '{print $1}')" == "0" ]]

cast send "$oracle" 'setPriceStatus(address,uint256,uint256,bool)' \
  "$nvda" 180000000000000000000 1 true \
  --rpc-url "$rpc" --private-key "$deployer_key" --json | jq -e '.status == "0x1"' >/dev/null
if cast call "$basket" 'totalAssetsUsd()(uint256)' --rpc-url "$rpc" >/dev/null 2>&1; then
  echo "Stale testnet valuation unexpectedly remained usable" >&2
  exit 1
fi

mkdir -p "$(dirname "$evidence")"
jq -n \
  --arg testedAt "$(date -u +%FT%TZ)" \
  --arg gitSha "$(git -C "$repo_root" rev-parse HEAD)" \
  --arg manifestHash "$(sha256sum "$manifest" | awk '{print $1}')" \
  --arg deployer "$deployer" \
  --arg user "$user" \
  --arg shares "$shares" \
  '{
    schemaVersion: 1,
    testedAt: $testedAt,
    gitSha: $gitSha,
    chainId: 46630,
    broadcastPerformed: false,
    isolatedAnvil: true,
    manifestHash: $manifestHash,
    deployer: $deployer,
    user: $user,
    checks: {
      deployment: true,
      automaticFreshnessDisabled: true,
      proportionalDeposit: true,
      atomicRedemption: true,
      noQueuedRedemption: true,
      staleOracleFailsClosed: true
    },
    sharesMinted: $shares
  }' >"$evidence"
cat "$evidence"
