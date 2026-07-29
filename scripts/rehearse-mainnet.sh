#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export MDB_MAINNET_BROADCAST=false
exec "$repo_root/scripts/rehearse-mainnet-fork.sh"
