#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
rpc_env="${MDB_MAINNET_RPC_ENV_FILE:-/etc/mdb/mainnet-rpc.env}"
runtime_env="${MDB_MAINNET_ENV_FILE:-/etc/mdb/mainnet.env}"
shadow_env="${MDB_MAINNET_SHADOW_ENV_FILE:-/etc/mdb/mainnet-shadow.env}"
primary_url="${MDB_RPC_PRIMARY_URL_OVERRIDE:-http://192.168.50.173:8547}"
secondary_url="${MDB_RPC_SECONDARY_URL_OVERRIDE:-${MDB_ALCHEMY_MAINNET_RPC_URL:-}}"
gateway_url="http://127.0.0.1:18549"
health_url="$gateway_url/health"
unit_source="$repo_root/infrastructure/systemd/mdb-rpc-failover-mainnet.service"
unit_target="/etc/systemd/system/mdb-rpc-failover-mainnet.service"

[[ "$(id -u)" == "0" ]] || {
  echo "Run with sudo." >&2
  exit 1
}
[[ "$primary_url" == "http://192.168.50.173:8547" ]] || {
  echo "Mainnet LAN primary must be 192.168.50.173:8547." >&2
  exit 1
}
[[ "$secondary_url" =~ ^https://[^/]*alchemy\.com/ ]] || {
  echo "Set MDB_ALCHEMY_MAINNET_RPC_URL to the HTTPS Robinhood mainnet Alchemy endpoint." >&2
  exit 1
}
[[ "$secondary_url" != "$primary_url" ]]
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

[[ "$(chain_id "$primary_url")" == "4663" ]]
[[ "$(chain_id "$secondary_url")" == "4663" ]]

tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT
cat >"$tmp" <<EOF
MDB_RPC_PRIMARY_URL=$primary_url
MDB_RPC_SECONDARY_URL=$secondary_url
MDB_RPC_EXPECTED_CHAIN_ID=4663
MDB_RPC_LISTEN_HOST=127.0.0.1
MDB_RPC_LISTEN_PORT=18549
MDB_RPC_MAX_HEAD_LAG=3
MDB_RPC_RECOVERY_HEAD_LAG=1
MDB_RPC_CHECK_INTERVAL_MS=15000
MDB_RPC_LAG_FAILURE_SAMPLES=2
MDB_RPC_RECOVERY_SAMPLES=4
MDB_RPC_REQUEST_TIMEOUT_MS=30000
EOF

install -d -o root -g hendo420 -m 0750 "$(dirname "$rpc_env")"
if [[ -f "$rpc_env" ]]; then
  cp -a "$rpc_env" "$rpc_env.pre-update-$(date -u +%Y%m%dT%H%M%SZ)"
fi
install -o root -g hendo420 -m 0640 "$tmp" "$rpc_env"
install -o root -g root -m 0644 "$unit_source" "$unit_target"

replace_env_keys() {
  local file="$1"
  shift
  [[ -f "$file" ]] || return 0
  local edited
  edited="$(mktemp)"
  local pattern
  pattern="^($(printf '%s|' "$@" | sed 's/|$//'))="
  grep -vE "$pattern" "$file" >"$edited"
  cat >>"$edited"
  cp -a "$file" "$file.pre-rpc-failover-$(date -u +%Y%m%dT%H%M%SZ)"
  install -o root -g hendo420 -m 0640 "$edited" "$file"
  rm -f "$edited"
}

replace_env_keys "$runtime_env" \
  MDB_RPC_URL MDB_RPC_HEALTH_URL MDB_RPC_PRIMARY_URL \
  MDB_RPC_SECONDARY_URL MDB_BACKUP_RPC_URL <<EOF
MDB_RPC_URL=$gateway_url
MDB_RPC_HEALTH_URL=$health_url
MDB_RPC_PRIMARY_URL=$primary_url
MDB_RPC_SECONDARY_URL=$secondary_url
MDB_BACKUP_RPC_URL=$secondary_url
EOF

replace_env_keys "$shadow_env" MDB_MAINNET_SHADOW_RPC_URL <<EOF
MDB_MAINNET_SHADOW_RPC_URL=$gateway_url
EOF

systemctl daemon-reload
systemctl enable --now mdb-rpc-failover-mainnet.service
sleep 2
health="$(curl --fail --silent --show-error "$health_url")"
[[ "$(jq -r '.expectedChainId' <<<"$health")" == "4663" ]]
[[ "$(jq -r '.status' <<<"$health")" == "ok" ]]
[[ "$(jq -r '.primary.chainId' <<<"$health")" == "4663" ]]
[[ "$(jq -r '.secondary.chainId' <<<"$health")" == "4663" ]]
echo "Configured mainnet RPC failover without printing provider credentials."
