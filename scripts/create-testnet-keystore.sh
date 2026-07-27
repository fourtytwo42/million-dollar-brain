#!/usr/bin/env bash
set -euo pipefail

base="${MDB_TESTNET_WALLET_DIR:-/home/hendo420/.config/mdb/wallets/robinhood-testnet}"
keystore="$base/keystore/mdb-testnet-deployer"
password_file="$base/password"
address_file="$base/address"
cast_bin="/home/hendo420/.foundry/bin/cast"

umask 077
mkdir -p "$base/keystore"
if [[ ! -f "$keystore" ]]; then
  password="$(openssl rand -hex 32)"
  printf '%s\n' "$password" >"$password_file"
  "$cast_bin" wallet new "$base/keystore" mdb-testnet-deployer \
    --unsafe-password "$password" --json >/dev/null
fi
address="$(
  "$cast_bin" wallet address \
    --keystore "$keystore" \
    --password-file "$password_file"
)"
printf '%s\n' "$address" >"$address_file"
chmod 700 "$base" "$base/keystore"
chmod 600 "$password_file" "$address_file" "$keystore"
printf '%s\n' "$address"
