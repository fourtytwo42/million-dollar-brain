#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$repo_root/infrastructure/systemd"
target_dir="/etc/systemd/system"

[[ -f /etc/mdb/local.env ]] || {
  echo "/etc/mdb/local.env must exist before service installation" >&2
  exit 1
}
[[ -f /etc/mdb/testnet.env ]] || {
  echo "/etc/mdb/testnet.env must exist before service installation" >&2
  exit 1
}

for unit in "$source_dir"/*; do
  name="$(basename "$unit")"
  if [[ -f "$target_dir/$name" ]]; then
    cp -a "$target_dir/$name" "$target_dir/$name.pre-readiness"
  fi
  install -o root -g root -m 0644 "$unit" "$target_dir/$name"
done
systemctl daemon-reload
systemctl enable mdb-web.service mdb-cycle.timer mdb-market-collector.timer
systemctl disable mdb-web-testnet.service mdb-cycle-testnet.timer mdb-market-collector-testnet.timer 2>/dev/null || true
systemctl restart mdb-web.service
systemctl restart mdb-cycle.timer mdb-market-collector.timer
systemctl is-active mdb-web.service mdb-cycle.timer mdb-market-collector.timer
for unit in mdb-web-testnet.service mdb-cycle-testnet.timer mdb-market-collector-testnet.timer; do
  [[ "$(systemctl is-enabled "$unit" 2>/dev/null || true)" == "disabled" ]]
done
