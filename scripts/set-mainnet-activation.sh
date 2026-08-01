#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
stage="${1:-}"
env_file="${MDB_MAINNET_ENV_FILE:-/etc/mdb/mainnet.env}"
manifest="$repo_root/packages/contracts/deployments/mainnet-v5.json"
candidate="$repo_root/var/releases/$(git rev-parse -C "$repo_root" HEAD)/mainnet-candidate-v5.json"
[[ "${MDB_MAINNET_ACTIVATION_APPROVED:-false}" == "true" ]] || {
  echo "Refusing activation change without MDB_MAINNET_ACTIVATION_APPROVED=true." >&2
  exit 1
}
[[ -r "$env_file" && -r "$manifest" ]]
set -a
# shellcheck disable=SC1090
source "$env_file"
set +a
export PATH="/home/hendo420/.foundry/bin:/home/hendo420/.local/node-v24.18.0-linux-x64/bin:/usr/bin:/bin"
[[ "$(cast chain-id --rpc-url "${MDB_RPC_URL:?}")" == "4663" ]]
basket="$(jq -r '.basket' "$manifest")"
brain="$(jq -r '.brain' "$manifest")"
case "$stage" in
  paused-canary) controls=(false false false); brain_enabled=false ;;
  user-actions) controls=(true true false); brain_enabled=true ;;
  automation) controls=(true true true); brain_enabled=true ;;
  emergency) controls=(false true false); brain_enabled=false ;;
  *)
    echo "Usage: $0 paused-canary|user-actions|automation|emergency" >&2
    exit 2
    ;;
esac
if [[ "$stage" == "user-actions" || "$stage" == "automation" ]]; then
  jq -e '.signed == true and .activationReady == true and .broadcastPermitted == false' "$candidate" >/dev/null || {
    echo "Activation gates are incomplete; the paused canary must remain closed." >&2
    exit 1
  }
fi
if [[ "$stage" == "automation" && "${MDB_SERVER_SIGNING_ENABLED:-false}" != "true" ]]; then
  echo "Automation requires MDB_SERVER_SIGNING_ENABLED=true in the protected mainnet environment." >&2
  exit 1
fi
signer=(--keystore "${MDB_OPERATOR_KEYSTORE:?}" --password-file "${MDB_OPERATOR_PASSWORD_FILE:?}")
cast send "$basket" 'setCanaryControls(bool,bool,bool)' \
  "${controls[0]}" "${controls[1]}" "${controls[2]}" \
  --rpc-url "$MDB_RPC_URL" "${signer[@]}"
cast send "$brain" 'setPurchasesEnabled(bool)' "$brain_enabled" \
  --rpc-url "$MDB_RPC_URL" "${signer[@]}"
if [[ "$stage" == "automation" ]]; then
  sudo systemctl restart mdb-web-mainnet.service
  sudo systemctl enable --now mdb-cycle-mainnet.timer
else
  sudo systemctl disable --now mdb-cycle-mainnet.timer 2>/dev/null || true
fi
echo "Mainnet activation stage is now $stage."
