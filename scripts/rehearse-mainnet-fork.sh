#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${MDB_MAINNET_ENV_FILE:-/etc/mdb/mainnet.env}"
fork_rpc="${MDB_MAINNET_SHADOW_RPC_URL:-https://rpc.mainnet.chain.robinhood.com}"
fork_port="${MDB_MAINNET_FORK_PORT:-8555}"
output="$repo_root/var/mainnet-shadow/fork-deployment.json"
log="$repo_root/var/mainnet-shadow/anvil-fork.log"
export PATH="/home/hendo420/.foundry/bin:/home/hendo420/.local/node-v24.18.0-linux-x64/bin:/usr/bin:/bin"

[[ -r "$env_file" ]]
set -a
# shellcheck disable=SC1090
source "$env_file"
set +a
[[ "$(cast chain-id --rpc-url "$fork_rpc")" == "4663" ]]
mkdir -p "$(dirname "$output")"
rm -f "$output"

anvil --fork-url "$fork_rpc" --port "$fork_port" --chain-id 4663 --auto-impersonate >"$log" 2>&1 &
anvil_pid=$!
trap 'kill "$anvil_pid" 2>/dev/null || true' EXIT
for _ in $(seq 1 30); do
  cast chain-id --rpc-url "http://127.0.0.1:$fork_port" >/dev/null 2>&1 && break
  sleep 1
done
[[ "$(cast chain-id --rpc-url "http://127.0.0.1:$fork_port")" == "4663" ]]
cast rpc --rpc-url "http://127.0.0.1:$fork_port" anvil_setBalance \
  "${MDB_DEPLOYER_ADDRESS:?}" 0x56BC75E2D63100000 >/dev/null

cd "$repo_root/packages/contracts"
MDB_DEPLOYMENT_OUTPUT="$output" \
  forge script script/DeployMainnet.s.sol:DeployMainnet \
    --rpc-url "http://127.0.0.1:$fork_port" \
    --unlocked \
    --sender "${MDB_DEPLOYER_ADDRESS:?}" \
    --broadcast

jq -e '.schemaVersion == 3 and .chainId == 4663 and .canonicalAssets == true' "$output" >/dev/null
echo "$output"
