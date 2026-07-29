#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="/home/hendo420/.foundry/bin:/home/hendo420/.local/node-v24.18.0-linux-x64/bin:/usr/bin:/bin"
cd "$repo_root"
sha="$(git rev-parse HEAD)"
candidate="$repo_root/var/releases/$sha/devnet.json"
[[ -r "$candidate" ]]
[[ "$(jq -r '.gitSha' "$candidate")" == "$sha" ]]
[[ "$(jq -r '.environment' "$candidate")" == "devnet" ]]
node scripts/verify-release-artifacts.mjs devnet
MDB_TESTNET_BROADCAST=false ./scripts/rehearse-testnet.sh
mkdir -p "$repo_root/var/releases/$sha"
jq -n \
  --arg sha "$sha" \
  --arg candidateHash "$(jq -r '.releaseHash' "$candidate")" \
  --arg at "$(date -u +%FT%TZ)" \
  '{
    schemaVersion: 1,
    from: "devnet",
    to: "testnet",
    gitSha: $sha,
    candidateHash: $candidateHash,
    rehearsedAt: $at,
    broadcastPermitted: false
  }' >"$repo_root/var/releases/$sha/devnet-to-testnet.json"
echo "$repo_root/var/releases/$sha/devnet-to-testnet.json"
