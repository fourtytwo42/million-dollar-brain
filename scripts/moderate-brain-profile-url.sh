#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mode="${1:-}"
piece_id="${2:-}"
export PATH="/home/hendo420/.foundry/bin:/home/hendo420/.local/node/bin:/usr/bin:/bin"

[[ "$piece_id" =~ ^([1-9]|[1-3][0-9]|4[0-2])$ ]] || {
  echo "Usage: $0 local|testnet PIECE_ID_1_TO_42" >&2
  exit 2
}

case "$mode" in
  local)
    env_file="${MDB_LOCAL_ENV_FILE:-/etc/mdb/local.env}"
    rpc="${MDB_LOCAL_RPC_URL:-http://127.0.0.1:8545}"
    manifest="$repo_root/packages/contracts/deployments/local-v3.json"
    ;;
  testnet)
    env_file="${MDB_TESTNET_ENV_FILE:-/etc/mdb/testnet.env}"
    rpc="${MDB_TESTNET_RPC_URL:-http://127.0.0.1:18548}"
    manifest="$repo_root/packages/contracts/deployments/testnet-v3.json"
    [[ "${MDB_TESTNET_BROADCAST:-false}" == "true" ]] || {
      echo "Refusing testnet moderation without MDB_TESTNET_BROADCAST=true." >&2
      exit 1
    }
    ;;
  *)
    echo "Usage: $0 local|testnet PIECE_ID_1_TO_42" >&2
    exit 2
    ;;
esac

[[ -r "$env_file" ]]
set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

brain="$(jq -er '.contracts.brain // .brain' "$manifest")"
if [[ "$mode" == "local" ]]; then
  private_key="${MDB_DEV_PRIVATE_KEY:-${DEPLOYER_PRIVATE_KEY:-}}"
  [[ -n "$private_key" ]]
  signer=(--private-key "$private_key")
else
  [[ -r "${MDB_OPERATOR_KEYSTORE:?}" ]]
  [[ -r "${MDB_OPERATOR_PASSWORD_FILE:?}" ]]
  signer=(--keystore "$MDB_OPERATOR_KEYSTORE" --password-file "$MDB_OPERATOR_PASSWORD_FILE")
fi

cast send "$brain" 'resetProfileUrl(uint256)' "$piece_id" \
  --rpc-url "$rpc" \
  "${signer[@]}"

actual_url="$(cast call "$brain" 'profileUrl(uint256)(string)' "$piece_id" --rpc-url "$rpc")"
[[ "$actual_url" == '""' ]]
echo "Piece $piece_id profile link was removed; the owner's profile allowance was not restored."
