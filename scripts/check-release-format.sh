#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="/home/hendo420/.foundry/bin:/home/hendo420/.local/node-v24.18.0-linux-x64/bin:/usr/bin:/bin"
cd "$repo_root"

mapfile -t changed < <(git diff-tree --no-commit-id --name-only -r HEAD)
solidity=()
prettier=()
for path in "${changed[@]}"; do
  [[ -f "$path" ]] || continue
  case "$path" in
    packages/contracts/*.sol) solidity+=("${path#packages/contracts/}") ;;
    *.js|*.mjs|*.cjs|*.ts|*.tsx|*.json|*.md|*.css|*.scss|*.yaml|*.yml) prettier+=("$path") ;;
  esac
done

if ((${#solidity[@]})); then
  (cd packages/contracts && forge fmt --check "${solidity[@]}")
fi
if ((${#prettier[@]})); then
  npx prettier --check "${prettier[@]}"
fi
