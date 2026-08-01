#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
git_sha="$(git -C "$repo_root" rev-parse HEAD)"
candidate="$repo_root/var/releases/$git_sha/mainnet-candidate-v5.json"
canary="$repo_root/var/releases/$git_sha/mainnet-canary.json"
approvals="$repo_root/var/releases/$git_sha/activation-approvals.json"
[[ -r "$candidate" && -r "$canary" && -r "$approvals" ]]
node "$repo_root/scripts/verify-mainnet-candidate.mjs" "$candidate" >/dev/null
jq -e --arg sha "$git_sha" '
  .gitSha == $sha and .signed == true and .pausedDeploymentReady == true and
  .activationReady == true and .broadcastPermitted == false and
  .activationGates.qualificationWindowPassed == true and
  .activationGates.launchWitnessValid == true and
  .activationGates.externalApprovalsPassed == true and
  .activationGates.pausedCanaryVerified == true
' "$candidate" >/dev/null
jq -e --arg sha "$git_sha" '.gitSha == $sha and .signed == true and (.checks | all)' "$canary" >/dev/null
jq -e --arg sha "$git_sha" '.gitSha == $sha and .signed == true and (.gates | all)' "$approvals" >/dev/null
echo "Mainnet activation evidence is complete for $git_sha; activation still requires an explicit transaction authorization."
