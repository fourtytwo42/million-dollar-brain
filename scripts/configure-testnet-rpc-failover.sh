#!/usr/bin/env bash
set -euo pipefail

env_file="${MDB_TESTNET_ENV_FILE:-/etc/mdb/testnet.env}"
primary_url="${MDB_RPC_PRIMARY_URL_OVERRIDE:-http://192.168.50.117:8547}"
gateway_url="http://127.0.0.1:18548"
health_url="$gateway_url/health"
public_rpc="https://rpc.testnet.chain.robinhood.com"

[[ "$(id -u)" == "0" ]] || {
  echo "Run with sudo" >&2
  exit 1
}
[[ -f "$env_file" ]] || {
  echo "Missing testnet environment: $env_file" >&2
  exit 1
}

current_rpc="$(sed -n 's/^MDB_RPC_URL=//p' "$env_file" | tail -n 1)"
secondary_url="$(
  sed -n 's/^MDB_RPC_SECONDARY_URL=//p' "$env_file" | tail -n 1
)"
if [[ -z "$secondary_url" && -n "$current_rpc" && "$current_rpc" != "$gateway_url" ]]; then
  secondary_url="$current_rpc"
fi
secondary_url="${MDB_RPC_SECONDARY_URL_OVERRIDE:-${secondary_url:-$public_rpc}}"
browser_rpc="$(sed -n 's/^MDB_BROWSER_RPC_URL=//p' "$env_file" | tail -n 1)"

[[ "$primary_url" == "http://192.168.50.117:8547" ]]
[[ "$secondary_url" =~ ^https:// ]]
[[ "$browser_rpc" == "$public_rpc" ]]
[[ "$secondary_url" != "$primary_url" ]]

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
grep -vE \
  '^(MDB_RPC_URL|MDB_RPC_HEALTH_URL|MDB_RPC_PRIMARY_URL|MDB_RPC_SECONDARY_URL|MDB_RPC_EXPECTED_CHAIN_ID|MDB_RPC_MAX_HEAD_LAG|MDB_RPC_RECOVERY_HEAD_LAG|MDB_RPC_CHECK_INTERVAL_MS|MDB_RPC_LAG_FAILURE_SAMPLES|MDB_RPC_RECOVERY_SAMPLES)=' \
  "$env_file" >"$tmp"
printf '%s\n' \
  "MDB_RPC_URL=$gateway_url" \
  "MDB_RPC_HEALTH_URL=$health_url" \
  "MDB_RPC_PRIMARY_URL=$primary_url" \
  "MDB_RPC_SECONDARY_URL=$secondary_url" \
  "MDB_RPC_EXPECTED_CHAIN_ID=46630" \
  "MDB_RPC_MAX_HEAD_LAG=3" \
  "MDB_RPC_RECOVERY_HEAD_LAG=1" \
  "MDB_RPC_CHECK_INTERVAL_MS=15000" \
  "MDB_RPC_LAG_FAILURE_SAMPLES=2" \
  "MDB_RPC_RECOVERY_SAMPLES=4" >>"$tmp"

backup="$env_file.pre-rpc-failover-$(date -u +%Y%m%dT%H%M%SZ)"
cp -a "$env_file" "$backup"
install -o root -g hendo420 -m 0640 "$tmp" "$env_file"
echo "Configured testnet RPC failover without printing provider credentials."
