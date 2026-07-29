#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
[[ "$repo_root" == "/home/hendo420/projects/million-dollar-brain" ]] || {
  echo "Run this only from the authoritative VM repository." >&2
  exit 1
}
[[ "$(id -u)" == "0" ]] || {
  echo "Run with sudo; database, environment, and systemd migration require root." >&2
  exit 1
}

owner="hendo420"
group="hendo420"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
archive="$repo_root/var/environment-archive/$timestamp"
devnet="$repo_root/var/devnet"
testnet="$repo_root/var/testnet-v3"
mainnet="$repo_root/var/mainnet"
contracts="$repo_root/packages/contracts/deployments"
release_sha="$(git -C "$repo_root" rev-parse HEAD)"

install -d -o "$owner" -g "$group" "$archive" "$devnet" "$testnet" "$mainnet"

copy_if_present() {
  local source="$1"
  local destination="$2"
  [[ -e "$source" ]] || return 0
  [[ ! -e "$destination" ]] || return 0
  cp -a "$source" "$destination"
  chown -R "$owner:$group" "$destination"
}

# Archive and copy only known devnet state. Never move or delete broad paths.
for name in cycles.jsonl brain-portraits source-cache local-anvil; do
  if [[ -e "$repo_root/var/$name" ]]; then
    cp -a "$repo_root/var/$name" "$archive/$name"
  fi
done
copy_if_present "$repo_root/var/cycles.jsonl" "$devnet/cycles.jsonl"
copy_if_present "$repo_root/var/brain-portraits" "$devnet/brain-portraits"
copy_if_present "$repo_root/var/source-cache" "$devnet/source-cache"
copy_if_present "$repo_root/var/local-anvil" "$devnet/anvil"

if [[ ! -f "$contracts/local-v3.json" ]]; then
  install -o "$owner" -g "$group" -m 0644 "$contracts/local.json" "$contracts/local-v3.json"
fi

if sudo -u postgres psql -Atc "select 1 from pg_database where datname='milliondollarbrain_devnet'" | grep -qx 1; then
  devnet_table_count="$(
    sudo -u postgres psql -d milliondollarbrain_devnet -Atc \
      "select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind='r' and n.nspname not in ('pg_catalog','information_schema')"
  )"
  if [[ "$devnet_table_count" == "0" ]]; then
    sudo -u postgres dropdb milliondollarbrain_devnet
  fi
fi
if ! sudo -u postgres psql -Atc "select 1 from pg_database where datname='milliondollarbrain_devnet'" | grep -qx 1; then
  dump="$(mktemp /tmp/mdb-devnet.XXXXXX.dump)"
  trap 'rm -f "$dump"' EXIT
  sudo -u postgres pg_dump -Fc milliondollarbrain >"$dump"
  chmod 0644 "$dump"
  sudo -u postgres createdb -O "$owner" milliondollarbrain_devnet
  sudo -u postgres pg_restore --no-owner --role="$owner" -d milliondollarbrain_devnet "$dump"
  rm -f "$dump"
  trap - EXIT
fi
if ! sudo -u postgres psql -Atc "select 1 from pg_database where datname='milliondollarbrain_mainnet'" | grep -qx 1; then
  sudo -u postgres createdb -O "$owner" milliondollarbrain_mainnet
fi

install -d -o root -g root -m 0755 /etc/mdb
sed \
  -e 's#postgresql:///milliondollarbrain?#postgresql:///milliondollarbrain_devnet?#' \
  -e "s#^MDB_STATE_DIR=.*#MDB_STATE_DIR=$devnet#" \
  -e "s#^MDB_DEPLOYMENT_FILE=.*#MDB_DEPLOYMENT_FILE=$contracts/local-v3.json#" \
  /etc/mdb/local.env >/etc/mdb/devnet.env
grep -q '^MDB_STATE_DIR=' /etc/mdb/devnet.env || echo "MDB_STATE_DIR=$devnet" >>/etc/mdb/devnet.env
grep -q '^MDB_DEPLOYMENT_FILE=' /etc/mdb/devnet.env || echo "MDB_DEPLOYMENT_FILE=$contracts/local-v3.json" >>/etc/mdb/devnet.env
grep -q '^MDB_SERVER_SIGNING_ENABLED=' /etc/mdb/devnet.env || echo "MDB_SERVER_SIGNING_ENABLED=false" >>/etc/mdb/devnet.env
sed -i '/^MDB_RELEASE_SHA=/d' /etc/mdb/devnet.env
echo "MDB_RELEASE_SHA=$release_sha" >>/etc/mdb/devnet.env
chmod 0600 /etc/mdb/devnet.env

if ! grep -q '^MDB_SERVER_SIGNING_ENABLED=' /etc/mdb/testnet.env; then
  echo "MDB_SERVER_SIGNING_ENABLED=true" >>/etc/mdb/testnet.env
fi
sed -i '/^MDB_RELEASE_SHA=/d' /etc/mdb/testnet.env
echo "MDB_RELEASE_SHA=$release_sha" >>/etc/mdb/testnet.env
chmod 0600 /etc/mdb/testnet.env

install -o root -g root -m 0644 "$repo_root/infrastructure/systemd/"* /etc/systemd/system/
systemctl daemon-reload
systemctl stop mdb-web.service mdb-cycle.timer mdb-market-collector.timer mdb-anvil.service
systemctl disable mdb-web.service mdb-cycle.timer mdb-market-collector.timer mdb-deploy.service 2>/dev/null || true
systemctl enable mdb-anvil.service mdb-web-devnet.service mdb-cycle-devnet.timer mdb-market-collector-devnet.timer mdb-runtime-health.timer
systemctl enable mdb-rpc-failover-testnet.service mdb-web-testnet.service mdb-cycle-testnet.timer mdb-market-collector-testnet.timer
systemctl disable mdb-web-mainnet.service mdb-cycle-mainnet.timer mdb-market-collector-mainnet.timer 2>/dev/null || true
systemctl restart mdb-anvil.service
systemctl restart mdb-web-devnet.service mdb-cycle-devnet.timer mdb-market-collector-devnet.timer mdb-runtime-health.timer
systemctl restart mdb-rpc-failover-testnet.service
systemctl restart mdb-web-testnet.service mdb-cycle-testnet.timer mdb-market-collector-testnet.timer

for unit in \
  mdb-anvil.service mdb-web-devnet.service mdb-cycle-devnet.timer \
  mdb-market-collector-devnet.timer mdb-runtime-health.timer \
  mdb-rpc-failover-testnet.service mdb-web-testnet.service \
  mdb-cycle-testnet.timer mdb-market-collector-testnet.timer; do
  systemctl is-active --quiet "$unit"
done

cat >"$archive/migration.json" <<EOF
{"schemaVersion":1,"at":"$(date -u +%FT%TZ)","devnetState":"var/devnet","testnetState":"var/testnet-v3","mainnetState":"var/mainnet","devnetDatabase":"milliondollarbrain_devnet","testnetDatabase":"milliondollarbrain_testnet","mainnetDatabase":"milliondollarbrain_mainnet"}
EOF
chown -R "$owner:$group" "$archive"
echo "$archive/migration.json"
