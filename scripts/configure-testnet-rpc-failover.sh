#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
rpc_env="${MDB_TESTNET_RPC_ENV_FILE:-/etc/mdb/testnet-rpc.env}"
runtime_env="${MDB_TESTNET_ENV_FILE:-/etc/mdb/testnet.env}"
primary_url="${MDB_RPC_PRIMARY_URL_OVERRIDE:-http://192.168.50.117:8547}"
comparison_url="${MDB_RPC_SECONDARY_URL_OVERRIDE:-${MDB_ALCHEMY_TESTNET_RPC_URL:-}}"
gateway_url="http://127.0.0.1:18548"
health_url="$gateway_url/health"
public_rpc="https://rpc.testnet.chain.robinhood.com"
unit_source="$repo_root/infrastructure/systemd/mdb-rpc-failover-testnet.service"
unit_target="/etc/systemd/system/mdb-rpc-failover-testnet.service"

[[ "$(id -u)" == "0" ]] || {
  echo "Run with sudo." >&2
  exit 1
}
[[ -f "$runtime_env" ]] || {
  echo "Missing testnet environment: $runtime_env" >&2
  exit 1
}
[[ "$primary_url" == "http://192.168.50.117:8547" ]]
[[ "$comparison_url" =~ ^https://[^/]*alchemy\.com/ ]] || {
  echo "Set MDB_ALCHEMY_TESTNET_RPC_URL to the HTTPS Robinhood testnet Alchemy endpoint." >&2
  exit 1
}
[[ "$comparison_url" != "$primary_url" ]]
[[ -r "$unit_source" ]]

rpc() {
  local url="$1"
  local method="$2"
  curl --fail --silent --show-error --max-time 30 \
    -H "content-type: application/json" \
    --data "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$method\",\"params\":[]}" \
    "$url"
}

chain_id() {
  rpc "$1" eth_chainId | jq -r '.result' | xargs printf '%d\n'
}

[[ "$(chain_id "$primary_url")" == "46630" ]]
[[ "$(chain_id "$comparison_url")" == "46630" ]]

tmp_rpc="$(mktemp)"
tmp_runtime="$(mktemp)"
trap 'rm -f "$tmp_rpc" "$tmp_runtime"' EXIT
cat >"$tmp_rpc" <<EOF
MDB_RPC_PRIMARY_URL=$primary_url
MDB_RPC_SECONDARY_URL=$comparison_url
MDB_RPC_ROUTING_MODE=primary_only
MDB_RPC_SECONDARY_ROUTING_AUTHORIZED=false
MDB_RPC_EXPECTED_CHAIN_ID=46630
MDB_RPC_LISTEN_HOST=127.0.0.1
MDB_RPC_LISTEN_PORT=18548
MDB_RPC_MAX_HEAD_LAG=3
MDB_RPC_RECOVERY_HEAD_LAG=1
MDB_RPC_CHECK_INTERVAL_MS=15000
MDB_RPC_LAG_FAILURE_SAMPLES=2
MDB_RPC_RECOVERY_SAMPLES=5
MDB_RPC_REQUEST_TIMEOUT_MS=30000
EOF

grep -vE \
  '^(MDB_RPC_URL|MDB_RPC_HEALTH_URL|MDB_RPC_PRIMARY_URL|MDB_RPC_ROUTING_MODE|MDB_RPC_SECONDARY_URL|MDB_RPC_SECONDARY_ROUTING_AUTHORIZED|MDB_BACKUP_RPC_URL|MDB_RPC_EXPECTED_CHAIN_ID|MDB_RPC_LISTEN_HOST|MDB_RPC_LISTEN_PORT|MDB_RPC_MAX_HEAD_LAG|MDB_RPC_RECOVERY_HEAD_LAG|MDB_RPC_CHECK_INTERVAL_MS|MDB_RPC_LAG_FAILURE_SAMPLES|MDB_RPC_RECOVERY_SAMPLES|MDB_RPC_REQUEST_TIMEOUT_MS|MDB_WEBSOCKET_URL|MDB_BACKUP_WEBSOCKET_URL)=' \
  "$runtime_env" >"$tmp_runtime"
cat >>"$tmp_runtime" <<EOF
MDB_RPC_URL=$gateway_url
MDB_RPC_HEALTH_URL=$health_url
MDB_RPC_PRIMARY_URL=$primary_url
MDB_RPC_ROUTING_MODE=primary_only
EOF

browser_rpc="$(sed -n 's/^MDB_BROWSER_RPC_URL=//p' "$tmp_runtime" | tail -n 1)"
[[ "$browser_rpc" == "$public_rpc" ]]

install -d -o root -g hendo420 -m 0750 "$(dirname "$rpc_env")"
if [[ -f "$rpc_env" ]]; then
  cp -a "$rpc_env" "$rpc_env.pre-update-$(date -u +%Y%m%dT%H%M%SZ)"
fi
cp -a "$runtime_env" "$runtime_env.pre-rpc-policy-$(date -u +%Y%m%dT%H%M%SZ)"
install -o root -g hendo420 -m 0640 "$tmp_rpc" "$rpc_env"
install -o root -g hendo420 -m 0640 "$tmp_runtime" "$runtime_env"
install -o root -g root -m 0644 "$unit_source" "$unit_target"

systemctl daemon-reload
systemctl enable --now mdb-rpc-failover-testnet.service
systemctl restart mdb-rpc-failover-testnet.service
sleep 2
health="$(curl --fail --silent --show-error "$health_url")"
[[ "$(jq -r '.status' <<<"$health")" == "ok" ]]
[[ "$(jq -r '.expectedChainId' <<<"$health")" == "46630" ]]
[[ "$(jq -r '.primary.chainId' <<<"$health")" == "46630" ]]
[[ "$(jq -r '.secondary.chainId' <<<"$health")" == "46630" ]]
[[ "$(jq -r '.routingMode' <<<"$health")" == "primary_only" ]]
[[ "$(jq -r '.secondaryUsagePermitted' <<<"$health")" == "false" ]]
echo "Configured testnet LAN-only routing with passive Alchemy comparison."
