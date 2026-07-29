#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
environment="${1:-}"
[[ "$environment" =~ ^(devnet|testnet|mainnet)$ ]] || {
  echo "Usage: $0 devnet|testnet|mainnet" >&2
  exit 2
}
export PATH="/home/hendo420/.foundry/bin:/home/hendo420/.local/node-v24.18.0-linux-x64/bin:/usr/bin:/bin"
cd "$repo_root"
[[ -z "$(git status --porcelain)" ]]
[[ "$(git rev-parse HEAD)" == "$(git rev-parse '@{u}')" ]]
(cd packages/contracts && forge fmt --check)
npm run test:contracts
npm run test:brain-controls
npm run test:compiled-brain
npm run test:meme
npm run test:portfolio-display
npm run test:portrait
npm run test:decision-context
npm run test:asset-universe
npm run test:market-data
npm run test:network
npm run test:wallet
npm run test:graduation
npm run format:check
npm --workspace apps/web run build
case "$environment" in
  devnet)
    MDB_UAT_SCREENSHOT_DIR="$repo_root/var/release-uat/$(git rev-parse HEAD)/devnet" npm run test:uat
    export MDB_RELEASE_ACCEPTANCE="devnet-browser-uat"
    ;;
  testnet)
    node scripts/generate-testnet-acceptance.mjs
    acceptance="$repo_root/var/testnet-readiness/v3-2h-acceptance.json"
    [[ "$(jq -r '.gitSha' "$acceptance")" == "$(git rev-parse HEAD)" ]]
    export MDB_RELEASE_ACCEPTANCE="$acceptance"
    ;;
  mainnet)
    acceptance="$repo_root/var/testnet-readiness/v3-2h-acceptance.json"
    [[ "$(jq -r '.gitSha' "$acceptance")" == "$(git rev-parse HEAD)" ]]
    ./scripts/rehearse-mainnet.sh
    node scripts/build-mainnet-candidate.mjs
    candidate="$repo_root/var/mainnet-readiness/mainnet-candidate-v3.json"
    jq -e '
      .chainId == 4663 and .broadcastPermitted == false and
      .activationState == "paused-canary" and .signed == true and
      .readyToBroadcast == true
    ' "$candidate" >/dev/null
    export MDB_RELEASE_ACCEPTANCE="$acceptance"
    ;;
esac
if [[ "$environment" != "mainnet" ]]; then
  node scripts/build-release-candidate.mjs "$environment"
fi
