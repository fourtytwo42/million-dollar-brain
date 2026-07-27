#!/usr/bin/env bash
set -euo pipefail

repo_root="/home/hendo420/projects/million-dollar-brain"
local_env="/etc/mdb/local.env"
testnet_env="/etc/mdb/testnet.env"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

[[ "$(id -u)" == "0" ]] || {
  echo "Run with sudo" >&2
  exit 1
}
install -d -o root -g hendo420 -m 0750 /etc/mdb

if [[ ! -f "$local_env" ]]; then
  {
    grep '^Environment=' /etc/systemd/system/mdb-web.service | sed 's/^Environment=//'
    grep '^Environment=' /etc/systemd/system/mdb-deploy.service | sed 's/^Environment=//'
    cycle_token="$(
      sed -n 's/.*x-mdb-cycle-token:\([^ "]*\).*/\1/p' \
        /etc/systemd/system/mdb-cycle.service
    )"
    collector_token="$(
      sed -n 's/.*x-mdb-collector-token:\([^ "]*\).*/\1/p' \
        /etc/systemd/system/mdb-market-collector.service
    )"
    [[ -n "$cycle_token" ]] && printf 'MDB_CYCLE_TOKEN=%s\n' "$cycle_token"
    [[ -n "$collector_token" ]] && printf 'MDB_COLLECTOR_TOKEN=%s\n' "$collector_token"
    printf 'MDB_NETWORK_MODE=local\n'
    printf 'MDB_NETWORK_MANIFEST=%s/config/networks.json\n' "$repo_root"
    printf 'PORT=3000\n'
  } >"$tmp/local.env"
  install -o root -g hendo420 -m 0640 "$tmp/local.env" "$local_env"
fi

if [[ ! -f "$testnet_env" ]]; then
  cycle_token="$(openssl rand -hex 32)"
  collector_token="$(openssl rand -hex 32)"
  printf '%s\n' \
    'PATH=/home/hendo420/.local/node/bin:/home/hendo420/.foundry/bin:/usr/bin:/bin' \
    'MDB_NETWORK_MODE=testnet' \
    "MDB_NETWORK_MANIFEST=$repo_root/config/networks.json" \
    'MDB_RPC_URL=https://rpc.testnet.chain.robinhood.com' \
    'MDB_BROWSER_RPC_URL=https://rpc.testnet.chain.robinhood.com' \
    "MDB_DEPLOYMENT_FILE=$repo_root/packages/contracts/deployments/testnet.json" \
    "MDB_STATE_DIR=$repo_root/var/testnet" \
    'DATABASE_URL=postgresql:///milliondollarbrain_testnet?host=/var/run/postgresql' \
    'MDB_AI_BASE_URL=http://192.168.50.189:30001/v1' \
    'MDB_AI_MODEL=ornith-1.0-35b-Q5_K_M-688b8d0a' \
    "MDB_CYCLE_TOKEN=$cycle_token" \
    "MDB_COLLECTOR_TOKEN=$collector_token" \
    'MDB_EXTERNAL_DATA_ENABLED=true' \
    'MDB_LOCAL_PRICE_SYNC_ENABLED=true' \
    'MDB_ALLOW_LAN_FAUCET=true' \
    'MDB_OPERATOR_KEYSTORE=/home/hendo420/.config/mdb/wallets/robinhood-testnet/keystore/mdb-testnet-deployer' \
    'MDB_OPERATOR_PASSWORD_FILE=/home/hendo420/.config/mdb/wallets/robinhood-testnet/password' \
    'NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=5a4c41c8c461ca59724069d740760a2f' \
    'PORT=3001' >"$tmp/testnet.env"
  install -o root -g hendo420 -m 0640 "$tmp/testnet.env" "$testnet_env"
fi

install -d -o hendo420 -g hendo420 -m 0750 "$repo_root/var/testnet"
if ! runuser -u postgres -- psql -tAc \
  "SELECT 1 FROM pg_database WHERE datname='milliondollarbrain_testnet'" |
  grep -q 1; then
  runuser -u postgres -- createdb -O hendo420 milliondollarbrain_testnet
fi

printf 'Environment migration complete. Secret values were not printed.\n'
