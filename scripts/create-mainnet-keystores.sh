#!/usr/bin/env bash
set -euo pipefail

base="${MDB_MAINNET_KEY_DIR:-/etc/mdb/keys}"
cast_bin="/home/hendo420/.foundry/bin/cast"
[[ "$(id -u)" == "0" ]] || {
  echo "Run with sudo." >&2
  exit 1
}
[[ -x "$cast_bin" ]]
umask 077
install -d -o root -g hendo420 -m 0750 "$base"

create_identity() {
  local name="$1"
  local keystore="$base/$name.json"
  local password_file="$base/$name.password"
  local address_file="$base/$name.address"
  local temporary
  temporary="$(mktemp -d)"
  if [[ ! -f "$keystore" ]]; then
    openssl rand -hex 32 >"$password_file"
    "$cast_bin" wallet new "$temporary" "$name" \
      --unsafe-password "$(cat "$password_file")" --json >/dev/null
    install -o root -g hendo420 -m 0640 "$temporary/$name" "$keystore"
  fi
  rm -rf -- "$temporary"
  "$cast_bin" wallet address --keystore "$keystore" \
    --password-file "$password_file" >"$address_file"
  chown root:hendo420 "$password_file" "$address_file" "$keystore"
  chmod 0640 "$password_file" "$address_file" "$keystore"
}

create_identity mainnet-operator
printf 'operator=%s\n' "$(cat "$base/mainnet-operator.address")"
