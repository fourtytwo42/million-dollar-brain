#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="/home/hendo420/.local/node/bin:/home/hendo420/.foundry/bin:/usr/bin:/bin"

if [[ "${MDB_NETWORK_MODE:-local}" != "local" ]]; then
  : "${MDB_OPERATOR_KEYSTORE:?MDB_OPERATOR_KEYSTORE is required}"
  : "${MDB_OPERATOR_PASSWORD_FILE:?MDB_OPERATOR_PASSWORD_FILE is required}"
  export MDB_OPERATOR_PRIVATE_KEY="$(
    cast wallet private-key \
      --keystore "$MDB_OPERATOR_KEYSTORE" \
      --password-file "$MDB_OPERATOR_PASSWORD_FILE"
  )"
fi

cd "$repo_root"
exec npm run start -w @million-dollar-brain/web
