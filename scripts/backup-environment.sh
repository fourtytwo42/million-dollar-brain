#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
environment="${1:-}"
case "$environment" in
  devnet)
    state="$repo_root/var/devnet"
    database="milliondollarbrain_devnet"
    manifest="$repo_root/packages/contracts/deployments/local-v3.json"
    env_file="/etc/mdb/devnet.env"
    ;;
  testnet)
    state="$repo_root/var/testnet-v3"
    database="milliondollarbrain_testnet"
    manifest="$repo_root/packages/contracts/deployments/testnet-v3.json"
    env_file="/etc/mdb/testnet.env"
    ;;
  mainnet)
    state="$repo_root/var/mainnet"
    database="milliondollarbrain_mainnet"
    manifest="$repo_root/packages/contracts/deployments/mainnet-v5.json"
    env_file="/etc/mdb/mainnet.env"
    ;;
  *)
    echo "Usage: $0 devnet|testnet|mainnet" >&2
    exit 2
    ;;
esac

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
target="${MDB_BACKUP_ROOT:-$repo_root/var/backups}/$environment/$timestamp"
install -d -m 0750 "$target"
pg_dump -Fc "$database" >"$target/database.dump"
install -m 0640 "$manifest" "$target/deployment-manifest.json"
for name in cycles.jsonl brain-portraits portrait-store; do
  [[ -e "$state/$name" ]] && cp -a "$state/$name" "$target/$name"
done
if [[ "${MDB_INCLUDE_ENCRYPTED_KEYSTORE_BACKUP:-false}" == "true" ]]; then
  # The password file is deliberately never copied with the encrypted keystore.
  keystore="$(grep -E '^MDB_OPERATOR_KEYSTORE=' "$env_file" | cut -d= -f2-)"
  [[ -r "$keystore" ]]
  install -m 0600 "$keystore" "$target/operator.keystore"
fi
(
  cd "$target"
  sha256sum database.dump deployment-manifest.json >SHA256SUMS
  find . -type f ! -name SHA256SUMS -print0 |
    sort -z |
    xargs -0 sha256sum >>SHA256SUMS
)
echo "$target"
