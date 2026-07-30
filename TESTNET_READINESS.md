# Robinhood Testnet Readiness

## Current position

MDB keeps local development and Robinhood Testnet isolated.

| Environment       | Port | Chain | RPC                                     | State               |
| ----------------- | ---: | ----: | --------------------------------------- | ------------------- |
| Local             | 3000 | 31337 | Local Anvil                             | Enabled and usable  |
| Robinhood Testnet | 3001 | 46630 | LAN-primary loopback gateway on `18548` | V3 live and enabled |

Server processes use the loopback failover gateway. It prefers the allowlisted
LAN node at `192.168.50.117:8547`, compares it with the configured remote
secondary, and fails over when the primary is unreachable, syncing, wrong-chain,
or behind. Browser wallets continue using the public HTTPS endpoint and never
receive the LAN URL.

The archived V2 mock release has been replaced by the committed
`packages/contracts/deployments/testnet-v3.json`. It contains 12 clearly
labelled production-interface replicas, not canonical Stock Tokens. The V3
web, collector, and accelerated 15-minute cycle services are active and
isolated from local. This faster cadence is testnet-only; local and future
mainnet operation remain hourly.
The two-hour endurance runner uses hidden automation hooks; the visible testnet
UI remains external-wallet-first. Three secret-derived test actors submit real
chain-46630 transactions for varied buys, atomic sells, initial brain
purchases, resales, preset changes, and claims. Every checkpoint also checks a
rejected oversized exit, concurrent authenticated requests, NAV and oracle
invariants, autonomous-cycle freshness, browser errors, and mobile/tablet/
desktop overflow.

The Control Catalog v1 acceptance completed on 2026-07-29 with seven passing
checkpoints across 2.000 active hours. It exercised 21 three-actor scenarios
with real chain-46630 ControlBundle updates, MDBS buys, atomic sells, reward
claims, initial brain purchases and compounded 120% resales, oversized-exit
rejections, concurrency, and 21 responsive checks with zero browser errors.
One preserved checkpoint initially exhausted a test actor's fixed USDG top-up
after repeated resales pushed a piece above 15,000 USDG. The protocol reverted
atomically as designed. Repair commits made actor funding price-aware and
excluded 1,313,207 ms of repair/idle time without resetting the source clock.
The repaired checkpoint and every later checkpoint passed. Final live in-app
Browser UAT passed on desktop, tablet, mobile, light, and dark views with no
horizontal overflow or console warnings/errors. The completed endurance
service is disabled and disarmed.

The newer self-hosted DEX V5 acceptance completed on 2026-07-30 from exact
pushed release `3c640ae19fa01744554cfa85a2cebea209c98366`. Seven checkpoints
covered 2.0109875 active hours after excluding 4,284,685 ms of recorded repair
downtime. The immutable ledger records 21 three-actor scenarios, 21 responsive
checks, atomic BRAINS buys and sells, autonomous DecisionContext V6 cycles,
four executed-cycle checkpoints, fresh DEX marks, reconciled NAV, zero protocol
failures, zero queued sales, and zero application browser errors. Final public
desktop, tablet, and mobile Browser UAT passed in light and dark themes. The
canonical artifact is `var/testnet-readiness/v3-2h-acceptance.json` with source
hash `940fae207af636691316a8c96d0121c926d04c78ec150eb04540200a223f90f6`.

`npm audit` currently reports 27 advisories (22 moderate, 5 high, 0 critical)
across the pinned wallet and Next.js dependency graph. The available aggregate
fix requires breaking framework changes, so this rehearsal records the finding
instead of silently forcing incompatible upgrades. Re-audit and remediate or
accept each advisory before a real-value release.

## Wallet policy

- External EIP-6963 and WalletConnect wallets are supported through wagmi,
  RainbowKit, TanStack Query, viem, and MDB's Reown project.
- A connected external wallet always takes precedence.
- Local visibly exposes a disposable wallet. Testnet retains the connector for
  authorized automation but does not expose funding or disposable-wallet UI.
- Mainnet runtime validation prohibits disposable wallets, faucets, and mock
  assets.
- Browser bundles receive only the public RPC and browser-safe runtime config.
  They never receive an operator key, password, database name, or server path.

## Operator identity

The encrypted MDB-specific Robinhood Testnet signer is stored outside the
repository with owner-only permissions. Its public address is:

`0x4365543D9e895bb48835CEcedf0903E8770A3A63`

It is intentionally separate from Robyn and funded the authorized V3 replica
deployment. Never commit the keystore password or decrypted key.

## Safe verification

Run V3 acceptance:

```bash
scripts/run-testnet-acceptance.sh
```

Build a testnet candidate without broadcasting:

```bash
scripts/build-testnet-candidate.sh
```

Run the complete readiness gate after the exact commit is clean and pushed:

```bash
scripts/verify-testnet-readiness.sh
```

Evidence is written under `var/testnet-readiness/` and is not a deployment
manifest.

The canonical acceptance summary is generated with:

```bash
node scripts/generate-testnet-acceptance.mjs
```

It records the source candidate, explicitly allowlisted repair commits, final
release SHA, and repair-excluded active duration. Unrecorded commit changes are
rejected. A contract, wallet, valuation, execution, or accounting change
invalidates older acceptance and requires a new two-hour run. Presentation-only
releases use focused testnet browser UAT.

## Graduation path

- Devnet uses `local-v3.json`, `var/devnet`, and
  `milliondollarbrain_devnet`.
- Testnet uses `testnet-v3.json`, `var/testnet-v3`, and
  `milliondollarbrain_testnet`.
- Mainnet uses `mainnet-v3.json`, `var/mainnet`, and
  `milliondollarbrain_mainnet`.

`scripts/check-release.sh devnet` creates the devnet candidate.
`scripts/promote-to-testnet.sh` rehearses promotion without broadcasting.
Mainnet rehearsal and canary checks likewise default to non-broadcast behavior.
Testnet and mainnet are never patched independently from the promoted commit.

## Current deployment and future broadcast

`scripts/deploy-testnet-v3.sh` refuses to run unless all of these are true:

- `MDB_TESTNET_BROADCAST=true` is set after explicit user authorization.
- The official RPC reports chain ID `46630`.
- The worktree is clean and exactly matches its pushed upstream commit.
- The encrypted MDB operator signer exists and meets the configured ETH floor.
- No testnet deployment manifest already exists.

The script then performs the deployment and validates the generated manifest.
Do not run it during local or rehearsal work.

## Recovery

If a testnet build or service fails:

1. Leave the local port-3000 services running.
2. Preserve the isolated testnet units and stop only the failing service.
3. Inspect `/etc/mdb/testnet.env` without printing secret values.
4. Re-run V3 acceptance.
5. Do not create or hand-edit `testnet-v3.json`; only the authorized deployment
   tooling may generate it.

If the public RPC is rate-limited, record HTTP status, request rate, and time
window before changing providers. A provider change must update both server and
browser configuration, pass `npm run test:network`, and receive a new release
evidence hash.
