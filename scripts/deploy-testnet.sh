#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
env_file="${MDB_TESTNET_ENV_FILE:-/etc/mdb/testnet.env}"
official_rpc="https://rpc.testnet.chain.robinhood.com"
manifest="$repo_root/packages/contracts/deployments/testnet.json"
minimum_balance_wei="${MDB_TESTNET_MINIMUM_BALANCE_WEI:-10000000000000000}"
export PATH="/home/hendo420/.foundry/bin:/usr/bin:/bin"

[[ "${MDB_TESTNET_BROADCAST:-false}" == "true" ]] || {
  echo "Refusing public-testnet broadcast: set MDB_TESTNET_BROADCAST=true only after explicit authorization." >&2
  exit 1
}
[[ -r "$env_file" ]]
set -a
# shellcheck disable=SC1090
source "$env_file"
set +a

[[ "${MDB_NETWORK_MODE:-}" == "testnet" ]]
[[ "${MDB_RPC_URL:-}" == "$official_rpc" ]]
[[ "${MDB_BROWSER_RPC_URL:-}" == "$official_rpc" ]]
[[ "$(cast chain-id --rpc-url "$official_rpc")" == "46630" ]]
[[ ! -e "$manifest" ]] || {
  echo "Refusing to overwrite an existing testnet deployment manifest." >&2
  exit 1
}
[[ -r "${MDB_OPERATOR_KEYSTORE:?Missing operator keystore}" ]]
[[ -r "${MDB_OPERATOR_PASSWORD_FILE:?Missing operator password file}" ]]

cd "$repo_root"
[[ -z "$(git status --porcelain)" ]] || {
  echo "Refusing broadcast from a dirty worktree." >&2
  exit 1
}
head_sha="$(git rev-parse HEAD)"
upstream_sha="$(git rev-parse '@{u}')"
[[ "$head_sha" == "$upstream_sha" ]] || {
  echo "Refusing broadcast until the exact commit is pushed." >&2
  exit 1
}

deployer="$(cast wallet address --keystore "$MDB_OPERATOR_KEYSTORE" \
  --password-file "$MDB_OPERATOR_PASSWORD_FILE")"
balance="$(cast balance "$deployer" --rpc-url "$official_rpc")"
(( balance >= minimum_balance_wei )) || {
  echo "Operator requires at least $minimum_balance_wei wei; current balance is $balance." >&2
  exit 1
}

cd "$repo_root/packages/contracts"
forge_args=(
  script/DeployTestnet.s.sol:DeployTestnet
  --rpc-url "$official_rpc"
  --keystore "$MDB_OPERATOR_KEYSTORE"
  --password-file "$MDB_OPERATOR_PASSWORD_FILE"
  --broadcast
)
verify_requested="${MDB_TESTNET_VERIFY:-false}"
if [[ "$verify_requested" == "true" ]]; then
  forge_args+=(--verify)
fi
MDB_DEPLOYER_ADDRESS="$deployer" \
MDB_DEPLOYMENT_OUTPUT="./deployments/testnet.json" \
  forge "${forge_args[@]}"

jq -e \
  '.schemaVersion == 1 and .environment == "robinhood-testnet" and
   .chainId == 46630 and .mockOnly == true and .automaticFreshness == false' \
  "$manifest" >/dev/null

for key in usdg nvda aapl ethx router oracle rewards creatorVault brain basket; do
  address="$(jq -er --arg key "$key" '.[$key]' "$manifest")"
  [[ "$(cast code "$address" --rpc-url "$official_rpc")" != "0x" ]] || {
    echo "Deployment validation failed: $key has no runtime code at $address" >&2
    exit 1
  }
done

evidence="$repo_root/var/testnet-readiness/public-deployment.json"
mkdir -p "$(dirname "$evidence")"
ending_balance="$(cast balance "$deployer" --rpc-url "$official_rpc")"
jq -n \
  --arg deployedAt "$(date -u +%FT%TZ)" \
  --arg gitSha "$head_sha" \
  --arg deployer "$deployer" \
  --arg manifestHash "$(sha256sum "$manifest" | awk '{print $1}')" \
  --arg startingBalanceWei "$balance" \
  --arg endingBalanceWei "$ending_balance" \
  --arg verifyRequested "$verify_requested" \
  '{
    schemaVersion: 1,
    deployedAt: $deployedAt,
    gitSha: $gitSha,
    chainId: 46630,
    publicRpc: "https://rpc.testnet.chain.robinhood.com",
    deployer: $deployer,
    manifestHash: $manifestHash,
    startingBalanceWei: $startingBalanceWei,
    endingBalanceWei: $endingBalanceWei,
    runtimeCodeValidated: true,
    sourceVerificationRequested: ($verifyRequested == "true")
  }' >"$evidence"
echo "Robinhood Testnet manifest written to $manifest"
cat "$evidence"
