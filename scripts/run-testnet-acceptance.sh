#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "run as root so /etc/mdb/testnet.env remains private" >&2
  exit 1
fi

set -a
source /etc/mdb/testnet.env
set +a

if [[ "${1:-}" != "--skip-collect" ]]; then
  curl --fail --silent --show-error --max-time 60 \
    -X POST \
    -H "x-mdb-collector-token: ${MDB_COLLECTOR_TOKEN:-${MDB_CYCLE_TOKEN}}" \
    http://127.0.0.1:3001/api/collect-market \
    >/tmp/mdb-testnet-acceptance-collect.json
fi

curl --silent --show-error --max-time 240 \
  -X POST \
  -H "x-mdb-cycle-token: ${MDB_CYCLE_TOKEN}" \
  http://127.0.0.1:3001/api/testnet-acceptance \
  | tee /tmp/mdb-testnet-acceptance-result.json
