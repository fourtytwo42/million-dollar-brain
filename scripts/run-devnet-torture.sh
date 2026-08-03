#!/usr/bin/env bash
set -Eeuo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export PATH="/home/hendo420/.local/node/bin:/home/hendo420/.foundry/bin:/usr/bin:/bin"

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${DEPLOYER_PRIVATE_KEY:?DEPLOYER_PRIVATE_KEY is required}"

rpc_port="${MDB_TORTURE_RPC_PORT:-18550}"
web_port="${MDB_TORTURE_WEB_PORT:-3010}"
duration_seconds="${MDB_TORTURE_DURATION_SECONDS:-7200}"
transaction_target="${MDB_TORTURE_TRANSACTION_TARGET:-10000}"
fuzz_runs="${MDB_TORTURE_FUZZ_RUNS:-10000}"
invariant_runs="${MDB_TORTURE_INVARIANT_RUNS:-256}"
invariant_depth="${MDB_TORTURE_INVARIANT_DEPTH:-1000}"
uat_hold_seconds="${MDB_TORTURE_UAT_HOLD_SECONDS:-600}"
run_id="${MDB_TORTURE_RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$(git -C "$repo_root" rev-parse --short=12 HEAD)}"
run_root="$repo_root/var/devnet-torture/$run_id"
evidence_dir="$run_root/evidence"
clone_state="$run_root/anvil-start.json"
compressed_state="$run_root/anvil-start.hex"
final_state="$run_root/anvil-final.json"
restart_state="$run_root/anvil-restart.json"
clone_manifest="$run_root/local-v3.json"
database_schema="torture_${run_id//[^a-zA-Z0-9]/_}"
database_schema="${database_schema,,}"
database_schema="${database_schema:0:60}"
live_status_before="$evidence_dir/live-devnet-before.json"
live_status_after="$evidence_dir/live-devnet-after.json"
anvil_pid=""
web_pid=""
soak_pid=""
cleanup_complete=false

mkdir -p "$evidence_dir"

fetch_status() {
  local url=$1
  local destination=$2
  for _ in $(seq 1 60); do
    if curl -fsS "$url" > "$destination.tmp" 2>/dev/null \
      && jq -e . "$destination.tmp" >/dev/null 2>&1
    then
      mv "$destination.tmp" "$destination"
      return 0
    fi
    sleep 1
  done
  rm -f "$destination.tmp"
  return 1
}

dump_anvil_state() {
  local rpc_url=$1
  local destination=$2
  local compressed="${destination}.hex.tmp"
  local decoded="${destination}.tmp"
  local compact="${destination}.compact.tmp"
  rm -f "$compressed" "$decoded" "$compact"
  cast rpc anvil_dumpState --rpc-url "$rpc_url" \
    | cut -c2- | rev | cut -c2- | rev > "$compressed"
  tail -c +3 "$compressed" | xxd -r -p | gzip -dc > "$decoded"
  jq -e \
    '.block.number as $number
    | .blocks = [.blocks[] | select(.header.number == $number)]
    | .transactions = [.transactions[] | select(.block_number == $number)]
    | .historical_states = null' \
    "$decoded" > "$compact"
  mv "$compact" "$destination"
  rm -f "$compressed" "$decoded"
}

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM
  if [[ -n "$web_pid" ]] && kill -0 "$web_pid" 2>/dev/null; then
    kill "$web_pid" 2>/dev/null || true
    wait "$web_pid" 2>/dev/null || true
  fi
  if [[ -n "$anvil_pid" ]] && kill -0 "$anvil_pid" 2>/dev/null; then
    kill -INT "$anvil_pid" 2>/dev/null || true
    wait "$anvil_pid" 2>/dev/null || true
  fi

  if [[ -f "$restart_state" ]]; then
    sha256sum "$restart_state" > "$evidence_dir/anvil-last-checkpoint.sha256"
  elif [[ -f "$final_state" ]]; then
    sha256sum "$final_state" > "$evidence_dir/anvil-last-checkpoint.sha256"
  fi
  pg_dump --schema-only --no-owner "$DATABASE_URL" --schema="$database_schema" \
    > "$evidence_dir/database-schema.sql" 2>/dev/null || true
  psql "$DATABASE_URL" -Atc \
    "select schemaname||'.'||relname||'='||n_live_tup from pg_stat_user_tables where schemaname='$database_schema' order by 1" \
    > "$evidence_dir/database-table-counts.txt" 2>/dev/null || true
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
    -c "drop schema if exists \"$database_schema\" cascade" >/dev/null 2>&1 || true
  rm -f "$clone_state" "$compressed_state" "$final_state" "$restart_state"

  fetch_status "http://127.0.0.1:3000/api/status" "$live_status_after" || true
  if [[ -s "$live_status_before" && -s "$live_status_after" ]]; then
    jq -S '{
      network: .network,
      deployment: .deployment,
      activation: .activation,
      supply: .supply,
      pendingRequestId: .redemption.pendingRequestId,
      pieces: [.pieces[] | {
        id, owner, price, preset, ownershipSerial, portraitHash, customName,
        profileUrl, customTagline, personaPack, profileChangeAvailable,
        controlBundle, controlBundleHash, controlSelectionVersion
      }]
    }' "$live_status_before" > "$evidence_dir/live-devnet-before-canonical.json" || true
    jq -S '{
      network: .network,
      deployment: .deployment,
      activation: .activation,
      supply: .supply,
      pendingRequestId: .redemption.pendingRequestId,
      pieces: [.pieces[] | {
        id, owner, price, preset, ownershipSerial, portraitHash, customName,
        profileUrl, customTagline, personaPack, profileChangeAvailable,
        controlBundle, controlBundleHash, controlSelectionVersion
      }]
    }' "$live_status_after" > "$evidence_dir/live-devnet-after-canonical.json" || true
    before_fingerprint="$(sha256sum "$evidence_dir/live-devnet-before-canonical.json" | cut -d' ' -f1)"
    after_fingerprint="$(sha256sum "$evidence_dir/live-devnet-after-canonical.json" | cut -d' ' -f1)"
    jq -n \
      --slurpfile before "$live_status_before" \
      --slurpfile after "$live_status_after" \
      --arg beforeFingerprint "$before_fingerprint" \
      --arg afterFingerprint "$after_fingerprint" \
      '{
        before: {
          chainId: $before[0].network.chainId,
          basket: $before[0].deployment.basket,
          brain: $before[0].deployment.brain,
          supply: $before[0].supply,
          queued: $before[0].redemption.pendingRequestId
        },
        after: {
          chainId: $after[0].network.chainId,
          basket: $after[0].deployment.basket,
          brain: $after[0].deployment.brain,
          supply: $after[0].supply,
          queued: $after[0].redemption.pendingRequestId
        },
        canonicalFingerprintBefore: $beforeFingerprint,
        canonicalFingerprintAfter: $afterFingerprint,
        unchanged: (
          $before[0].network.chainId == $after[0].network.chainId and
          $before[0].deployment.basket == $after[0].deployment.basket and
          $before[0].deployment.brain == $after[0].deployment.brain and
          $before[0].supply == $after[0].supply and
          $before[0].redemption.pendingRequestId == $after[0].redemption.pendingRequestId and
          $beforeFingerprint == $afterFingerprint
        )
      }' > "$evidence_dir/live-devnet-isolation.json" || true
  fi
  cleanup_complete=true
  exit "$exit_code"
}
trap cleanup EXIT INT TERM

cd "$repo_root"
if ss -ltn | grep -qE ":(${rpc_port}|${web_port})\\b"; then
  echo "torture port ${rpc_port} or ${web_port} is already in use" >&2
  exit 1
fi
if [[ ! -s packages/contracts/deployments/local-v3.json ]]; then
  echo "devnet deployment manifest is unavailable" >&2
  exit 1
fi

fetch_status "http://127.0.0.1:3000/api/status" "$live_status_before"
cp packages/contracts/deployments/local-v3.json "$clone_manifest"
dump_anvil_state "http://127.0.0.1:8545" "$clone_state"

git_sha="$(git rev-parse HEAD)"
manifest_hash="$(sha256sum "$clone_manifest" | cut -d' ' -f1)"
state_hash="$(sha256sum "$clone_state" | cut -d' ' -f1)"
jq -n \
  --arg schema "DevnetTortureRunV1" \
  --arg runId "$run_id" \
  --arg gitSha "$git_sha" \
  --arg manifestHash "$manifest_hash" \
  --arg stateHash "$state_hash" \
  --arg startedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  --argjson durationSeconds "$duration_seconds" \
  --argjson transactionTarget "$transaction_target" \
  '{
    schema: $schema,
    runId: $runId,
    gitSha: $gitSha,
    manifestHash: $manifestHash,
    stateHash: $stateHash,
    startedAt: $startedAt,
    durationSeconds: $durationSeconds,
    transactionTarget: $transactionTarget,
    isolation: {
      liveWebPort: 3000,
      liveRpcPort: 8545,
      cloneWebPort: 3010,
      cloneRpcPort: 18550
    }
  }' > "$evidence_dir/run.json"

echo "Running complete Foundry regression suite..."
(
  cd packages/contracts
  FOUNDRY_FUZZ_RUNS="$fuzz_runs" forge test --no-match-contract DevnetTortureInvariant -vv
) 2>&1 | tee "$evidence_dir/forge-regression.log"

echo "Running stateful invariant torture suite..."
(
  cd packages/contracts
  FOUNDRY_INVARIANT_RUNS="$invariant_runs" \
    FOUNDRY_INVARIANT_DEPTH="$invariant_depth" \
    FOUNDRY_FUZZ_RUNS="$fuzz_runs" \
    forge test --match-contract DevnetTortureInvariant -vv
) 2>&1 | tee "$evidence_dir/forge-invariant.log"

pg_dump "$DATABASE_URL" --schema=public --no-owner --no-acl \
  | sed \
    -e "s/SCHEMA public/SCHEMA \\\"$database_schema\\\"/g" \
    -e "s/public\\./\\\"$database_schema\\\"./g" \
    -e "s/SET search_path = public/SET search_path = \\\"$database_schema\\\"/g" \
  | psql -q "$DATABASE_URL"
database_separator="?"
[[ "$DATABASE_URL" == *"?"* ]] && database_separator="&"
torture_database_url="${DATABASE_URL}${database_separator}options=-csearch_path%3D${database_schema}"

anvil \
  --host 127.0.0.1 \
  --port "$rpc_port" \
  --chain-id 31337 \
  --prune-history 256 \
  --load-state "$clone_state" \
  > "$evidence_dir/anvil.log" 2>&1 &
anvil_pid=$!

for _ in $(seq 1 60); do
  if curl -fsS \
    -H "content-type: application/json" \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
    "http://127.0.0.1:$rpc_port" | jq -e '.result == "0x7a69"' >/dev/null 2>&1
  then
    break
  fi
  sleep 1
done
if ! kill -0 "$anvil_pid" 2>/dev/null; then
  echo "isolated Anvil failed to start" >&2
  exit 1
fi
captured_timestamp_hex="$(jq -r '.block.timestamp' "$clone_state")"
captured_timestamp="$(cast to-dec "$captured_timestamp_hex")"
wall_timestamp="$(date +%s)"
if (( captured_timestamp >= wall_timestamp )); then
  cast rpc evm_increaseTime "$((captured_timestamp - wall_timestamp + 1))" \
    --rpc-url "http://127.0.0.1:$rpc_port" >/dev/null
  cast rpc evm_mine --rpc-url "http://127.0.0.1:$rpc_port" >/dev/null
fi

export MDB_NETWORK_MODE=local
export MDB_RPC_URL="http://127.0.0.1:$rpc_port"
export MDB_DEPLOYMENT_FILE="$clone_manifest"
MDB_DEX_KEEPALIVE_ARMED=1 scripts/run-dex-keepalive.sh > "$evidence_dir/dex-keepalive.log" 2>&1

export NEXT_PUBLIC_MDB_RPC_URL="http://127.0.0.1:$rpc_port"
export MDB_STATE_DIR="$run_root/state"
export DATABASE_URL="$torture_database_url"
export PORT="$web_port"
export MDB_SERVER_SIGNING_ENABLED=false
export MDB_EXTERNAL_DATA_ENABLED=false
export MDB_TORTURE_MODE=true
mkdir -p "$MDB_STATE_DIR"

node node_modules/next/dist/bin/next start apps/web \
  --hostname 0.0.0.0 --port "$web_port" \
  > "$evidence_dir/web.log" 2>&1 &
web_pid=$!
for _ in $(seq 1 120); do
  if curl -fsS "http://127.0.0.1:$web_port/api/status" >/dev/null 2>&1; then
    break
  fi
  sleep 1
done
if ! curl -fsS "http://127.0.0.1:$web_port/api/status" \
  > "$evidence_dir/clone-status-before.json"
then
  echo "isolated web runtime failed to become healthy" >&2
  exit 1
fi

export MDB_TORTURE_RUN_ID="$run_id"
export MDB_TORTURE_EVIDENCE_DIR="$evidence_dir"
export MDB_TORTURE_WEB_URL="http://127.0.0.1:$web_port"
export MDB_TORTURE_DURATION_SECONDS="$duration_seconds"
export MDB_TORTURE_TRANSACTION_TARGET="$transaction_target"
export MDB_RELEASE_SHA="$git_sha"
node tests/devnet-torture.mjs &
soak_pid=$!
while kill -0 "$soak_pid" 2>/dev/null; do
  if [[ -f "$run_root/restart-web-request" && ! -f "$run_root/restart-web-complete" ]]; then
    kill "$web_pid" 2>/dev/null || true
    wait "$web_pid" 2>/dev/null || true
    node node_modules/next/dist/bin/next start apps/web \
      --hostname 0.0.0.0 --port "$web_port" \
      >> "$evidence_dir/web.log" 2>&1 &
    web_pid=$!
    for _ in $(seq 1 120); do
      curl -fsS "http://127.0.0.1:$web_port/api/status" >/dev/null 2>&1 && break
      sleep 1
    done
    curl -fsS "http://127.0.0.1:$web_port/api/status" \
      > "$evidence_dir/clone-status-after-web-restart.json"
    touch "$run_root/restart-web-complete"
  fi

  if [[ -f "$run_root/restart-anvil-request" && ! -f "$run_root/restart-anvil-complete" ]]; then
    dump_started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    dump_anvil_state "http://127.0.0.1:$rpc_port" "$restart_state"
    printf '%s state_bytes=%s\n' \
      "$dump_started_at" "$(stat -c %s "$restart_state")" \
      >> "$evidence_dir/anvil-restarts.log"
    kill -INT "$anvil_pid" 2>/dev/null || true
    wait "$anvil_pid" 2>/dev/null || true
    anvil \
      --host 127.0.0.1 \
      --port "$rpc_port" \
      --chain-id 31337 \
      --prune-history 256 \
      --load-state "$restart_state" \
      >> "$evidence_dir/anvil.log" 2>&1 &
    anvil_pid=$!
    for _ in $(seq 1 60); do
      if curl -fsS \
        -H "content-type: application/json" \
        --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' \
        "http://127.0.0.1:$rpc_port" | jq -e '.result == "0x7a69"' >/dev/null 2>&1
      then
        break
      fi
      sleep 1
    done
    restart_timestamp_hex="$(jq -r '.block.timestamp' "$restart_state")"
    restart_timestamp="$(cast to-dec "$restart_timestamp_hex")"
    restart_wall_timestamp="$(date +%s)"
    if (( restart_timestamp >= restart_wall_timestamp )); then
      cast rpc evm_increaseTime "$((restart_timestamp - restart_wall_timestamp + 1))" \
        --rpc-url "http://127.0.0.1:$rpc_port" >/dev/null
      cast rpc evm_mine --rpc-url "http://127.0.0.1:$rpc_port" >/dev/null
    fi
    MDB_DEX_KEEPALIVE_ARMED=1 scripts/run-dex-keepalive.sh >> "$evidence_dir/dex-keepalive.log" 2>&1
    touch "$run_root/restart-anvil-complete"
  fi
  sleep 1
done
wait "$soak_pid"

curl -fsS "http://127.0.0.1:$web_port/api/status" \
  > "$evidence_dir/clone-status-after.json"
jq -e '.accepted == true' "$evidence_dir/report.json" >/dev/null
touch "$run_root/uat-ready"
if (( uat_hold_seconds > 0 )); then
  echo "Isolated runtime ready for Browser UAT on port $web_port for up to ${uat_hold_seconds}s."
  hold_deadline=$((SECONDS + uat_hold_seconds))
  while (( SECONDS < hold_deadline )); do
    [[ -f "$run_root/uat-complete" ]] && break
    sleep 2
  done
  if [[ -f "$run_root/uat-complete" ]]; then
    printf 'completed\n' > "$evidence_dir/browser-uat-handoff.txt"
  else
    printf 'timed-out\n' > "$evidence_dir/browser-uat-handoff.txt"
  fi
fi
echo "Devnet torture run $run_id passed."
