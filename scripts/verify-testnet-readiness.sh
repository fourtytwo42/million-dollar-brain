#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${MDB_TESTNET_ENV_FILE:-/etc/mdb/testnet.env}"
official_rpc="https://rpc.testnet.chain.robinhood.com"
report="$repo_root/var/testnet-readiness/readiness-report.json"
export PATH="/home/hendo420/.local/node/bin:/home/hendo420/.foundry/bin:/usr/bin:/bin"

[[ -r "$env_file" ]]
set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

[[ "${MDB_RPC_URL:-}" == "$official_rpc" ]]
[[ "${MDB_BROWSER_RPC_URL:-}" == "$official_rpc" ]]
[[ "$(cast chain-id --rpc-url "$official_rpc")" == "46630" ]]
[[ ! -e "$repo_root/packages/contracts/deployments/testnet.json" ]]
! systemctl is-enabled --quiet mdb-web-testnet.service
! systemctl is-enabled --quiet mdb-cycle-testnet.timer
! systemctl is-enabled --quiet mdb-market-collector-testnet.timer

cd "$repo_root"
[[ -z "$(git status --porcelain)" ]]
[[ "$(git rev-parse HEAD)" == "$(git rev-parse '@{u}')" ]]

forge fmt --check packages/contracts/script/DeployTestnet.s.sol
forge test --root packages/contracts
forge inspect --root packages/contracts src/BasketVault.sol:BasketVault storage-layout >/dev/null
npm run test:network
npm run test:wallet
npm run test:market-data
npm exec --workspace apps/web tsc -- --noEmit
scripts/rehearse-testnet.sh >/dev/null
scripts/build-testnet-candidate.sh >/dev/null

mkdir -p "$(dirname "$report")"
jq -n \
  --arg verifiedAt "$(date -u +%FT%TZ)" \
  --arg gitSha "$(git rev-parse HEAD)" \
  --arg rpc "$official_rpc" \
  --arg operator "$(cat /home/hendo420/.config/mdb/wallets/robinhood-testnet/address)" \
  '{
    schemaVersion: 1,
    verifiedAt: $verifiedAt,
    gitSha: $gitSha,
    chainId: 46630,
    publicRpc: $rpc,
    operatorAddress: $operator,
    publicManifestPresent: false,
    publicBroadcastPerformed: false,
    testnetServicesEnabled: false,
    checks: {
      contractFormatting: true,
      contractTests: true,
      storageLayout: true,
      networkPolicy: true,
      marketData: true,
      typecheck: true,
      isolatedRehearsal: true,
      testnetBuild: true
    },
    remainingBeforeBroadcast: [
      "explicit user authorization",
      "fund operator with Robinhood testnet ETH",
      "run deploy-testnet.sh with MDB_TESTNET_BROADCAST=true"
    ]
  }' >"$report"
cat "$report"
