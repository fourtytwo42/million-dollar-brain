#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${MDB_TESTNET_ENV_FILE:-/etc/mdb/testnet.env}"
archive="$repo_root/var/testnet-archive/pre-v3-20260728"
state="$repo_root/var/testnet-v3"
manifest="$repo_root/packages/contracts/deployments/testnet-v3.json"

[[ -r "$manifest" ]]
sudo systemctl stop \
  mdb-cycle-testnet.timer \
  mdb-market-collector-testnet.timer \
  mdb-cycle-testnet.service \
  mdb-market-collector-testnet.service
mkdir -p "$archive" "$state"
if [[ -d "$repo_root/var/testnet" && ! -e "$archive/.archive-complete" ]]; then
  cp -a "$repo_root/var/testnet/." "$archive/"
  touch "$archive/.archive-complete"
fi
sudo cp -n "$env_file" "$env_file.pre-v3-20260728" || true
sudo -u postgres psql -tAc \
  "SELECT 1 FROM pg_database WHERE datname='milliondollarbrain_testnet_v3'" |
  grep -q 1 ||
  sudo -u postgres createdb -O hendo420 milliondollarbrain_testnet_v3
sudo sed -i \
  's#^MDB_DEPLOYMENT_FILE=.*#MDB_DEPLOYMENT_FILE=/home/hendo420/projects/million-dollar-brain/packages/contracts/deployments/testnet-v3.json#' \
  "$env_file"
sudo sed -i \
  's#^MDB_STATE_DIR=.*#MDB_STATE_DIR=/home/hendo420/projects/million-dollar-brain/var/testnet-v3#' \
  "$env_file"
sudo sed -i \
  's#/milliondollarbrain_testnet\(_v3\)\?$#/milliondollarbrain_testnet_v3#' \
  "$env_file"
sudo systemctl restart mdb-rpc-failover-testnet.service
sudo systemctl restart mdb-web-testnet.service
echo "V3 testnet web cutover complete; transaction timers remain stopped."
