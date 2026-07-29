#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source_dir="$repo_root/infrastructure/systemd"
target_dir="/etc/systemd/system"

[[ -f /etc/mdb/devnet.env ]] || {
  echo "/etc/mdb/devnet.env must exist before service installation" >&2
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
systemctl disable mdb-web.service mdb-cycle.timer mdb-market-collector.timer mdb-deploy.service 2>/dev/null || true
systemctl enable mdb-web-devnet.service mdb-cycle-devnet.timer mdb-market-collector-devnet.timer mdb-runtime-health.timer
systemctl enable mdb-rpc-failover-testnet.service mdb-web-testnet.service mdb-cycle-testnet.timer mdb-market-collector-testnet.timer
systemctl disable mdb-web-mainnet.service mdb-cycle-mainnet.timer mdb-market-collector-mainnet.timer 2>/dev/null || true
systemctl stop mdb-web.service mdb-cycle.timer mdb-market-collector.timer 2>/dev/null || true
systemctl restart mdb-web-devnet.service mdb-cycle-devnet.timer mdb-market-collector-devnet.timer mdb-runtime-health.timer
systemctl restart mdb-rpc-failover-testnet.service
systemctl restart mdb-web-testnet.service mdb-cycle-testnet.timer mdb-market-collector-testnet.timer
systemctl is-active mdb-web-devnet.service mdb-cycle-devnet.timer mdb-market-collector-devnet.timer mdb-runtime-health.timer
systemctl is-active mdb-rpc-failover-testnet.service mdb-web-testnet.service mdb-cycle-testnet.timer mdb-market-collector-testnet.timer
