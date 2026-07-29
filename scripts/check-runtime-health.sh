#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
alerts="$repo_root/var/alerts"
install -d -m 0750 "$alerts"
failures=()

check_app() {
  local environment="$1"
  local port="$2"
  local service="$3"
  local expected_mode="$4"
  local response
  if ! systemctl is-active --quiet "$service"; then
    failures+=("$environment web service inactive")
    return
  fi
  if ! response="$(curl --fail --silent --show-error --max-time 20 "http://127.0.0.1:$port/api/status")"; then
    failures+=("$environment status unavailable")
    return
  fi
  [[ "$(jq -r '.network.mode' <<<"$response")" == "$expected_mode" ]] ||
    failures+=("$environment identity mismatch")
  [[ "$(jq -r '.oracle.fresh' <<<"$response")" == "true" ]] ||
    failures+=("$environment stale oracle")
  [[ "$(jq -r '.redemption.pendingRequestId' <<<"$response")" == "0" ]] ||
    failures+=("$environment unexpected queued sale")
  [[ "$(jq -r '.nav | tonumber >= 0' <<<"$response")" == "true" ]] ||
    failures+=("$environment NAV invalid")
  if [[ "$environment" == "testnet" ]]; then
    systemctl is-active --quiet mdb-rpc-failover-testnet.service ||
      failures+=("testnet RPC failover service inactive")
    [[ "$(jq -r '.rpcFailover.status' <<<"$response")" == "ok" ]] ||
      failures+=("testnet RPC failover degraded")
    [[ "$(jq -r '.rpcFailover.expectedChainId' <<<"$response")" == "46630" ]] ||
      failures+=("testnet RPC chain mismatch")
  fi
}

check_app devnet 3000 mdb-web-devnet.service local
check_app testnet 3001 mdb-web-testnet.service testnet
if [[ -f "$repo_root/packages/contracts/deployments/mainnet-v3.json" ]]; then
  check_app mainnet 3003 mdb-web-mainnet.service mainnet
fi

shadow="$repo_root/var/mainnet-shadow/state.json"
if [[ -r "$shadow" ]]; then
  [[ "$(jq -r '.chainId' "$shadow")" == "4663" ]] ||
    failures+=("mainnet shadow chain mismatch")
  [[ "$(jq -r '.broadcastPermitted' "$shadow")" == "false" ]] ||
    failures+=("mainnet shadow broadcast policy violated")
fi

if [[ ${#failures[@]} -gt 0 ]]; then
  file="$alerts/$(date -u +%Y%m%dT%H%M%SZ)-runtime-health.json"
  jq -n \
    --arg at "$(date -u +%FT%TZ)" \
    --argjson failures "$(printf '%s\n' "${failures[@]}" | jq -R . | jq -s .)" \
    '{schemaVersion:1,at:$at,status:"failed",failures:$failures}' >"$file"
  printf '42 Braincells runtime alert: %s\n' "${failures[*]}" >&2
  exit 1
fi
echo "42 Braincells runtime health passed."
