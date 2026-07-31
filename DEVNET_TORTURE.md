# Disposable Devnet Torture Test

`scripts/run-devnet-torture.sh` runs destructive contract and application
testing against a disposable clone of devnet. It never writes to the live
Anvil instance on port `8545` or the live web runtime on port `3000`.

## Isolation

- Live Anvil state is captured with the read-only `anvil_dumpState` RPC.
- The clone runs on loopback port `18550`.
- The cloned application runs on port `3010`.
- PostgreSQL is copied into a unique schema and removed during cleanup.
- Twelve deterministic actors and separate admin and attacker identities are
  derived from the recorded master seed.
- Testnet, mainnet, shared RPC hosts, and their services are not read or
  modified.

The runner fails before testing if either isolated port is occupied. Its exit
trap stops isolated processes, archives database structure and table counts,
removes disposable chain state, drops the disposable database schema, and
records a canonical before/after live-devnet fingerprint.

Dense Anvil automining advances clone chain time much faster than wall time.
The transaction runner therefore performs a recorded lightweight round trip
through every DEX pool after at most 250 confirmed transactions. Initial and
post-restart Forge warm-ups establish the observation baseline, while ongoing
maintenance is block-bounded and deterministic. The disposable node also
prunes history to 256 blocks. It writes a restart checkpoint only before the
required Anvil recovery test; the post-restart node does not continuously
serialize its expanding transaction history. Together these controls prevent a
two-hour run from exhausting host storage.

## Coverage

The Foundry phase runs the complete regression suite with 10,000 focused fuzz
cases, then 256 stateful invariant runs at depth 1,000. The invariant handler
exercises:

- BRAINS deposits, atomic redemptions, transfers, approvals, and allowance
  revocation.
- All 42 braincell purchases, presets, controls, Profile V2 makeovers, claims,
  ownership changes, and reward accounting.
- Basket NAV and supply reconciliation, zero queued sales, bounded reward
  liabilities, and cleared execution allowances.

The two-hour system phase targets at least 10,000 confirmed transactions with
up to eight concurrent actors. It also exercises pause/resume controls, UUPS
upgrades, stale exact-quote races, cap and balance rejection, collision buys,
and deterministic replay evidence. Sustained isolated flow may intentionally
activate the short/long DEX-TWAP circuit breaker. The runner records complete
per-asset safety evidence, treats the event as an expected safe hold, advances
one clone-only settlement window, and requires every DEX safety check to
recover before transactions continue.

## Run

The checked-in systemd unit is intentionally disabled by default:

```bash
sudo cp ops/mdb-torture-devnet.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl start mdb-torture-devnet.service
journalctl -fu mdb-torture-devnet.service
```

For a short harness smoke:

```bash
MDB_TORTURE_DURATION_SECONDS=20 \
MDB_TORTURE_TRANSACTION_TARGET=30 \
MDB_TORTURE_FUZZ_RUNS=64 \
MDB_TORTURE_INVARIANT_RUNS=16 \
MDB_TORTURE_INVARIANT_DEPTH=100 \
MDB_TORTURE_UAT_HOLD_SECONDS=0 \
scripts/run-devnet-torture.sh
```

Evidence is written under `var/devnet-torture/<run-id>/evidence/`. The final
`report.json` uses schema `DevnetTortureReportV1`. If an invariant fails,
`failures.jsonl` records the master seed, exact PRNG state, and error so the
sequence can be replayed before restarting a complete run under a new ID.

After a successful soak the isolated web remains available for up to ten
minutes. Browser UAT can release it early by creating
`var/devnet-torture/<run-id>/uat-complete`.
