# Mainnet-Edge Release Specification

**Status:** Signed non-broadcast candidate; qualification incomplete
**Last verified:** 2026-07-30

## Capacity V3 / Manifest V5 amendment

This section supersedes the fixed launch-set, off-chain pricing,
market-cap/AUM, and universal-liquidity requirements later in this document.

- USDG remains the reserve, accounting unit, settlement asset, fee currency,
  and only user-facing buy/sell currency. Native ETH entry and exit are
  deferred; WETH is an investable risk asset.
- Mainnet qualification scans every canonical Robinhood Stock Token plus a
  committed crypto candidate catalog. Symbols never establish identity.
- WETH, NVDA, GME, SPY, SPCX, and VIRTUAL are priority candidates, not forced
  members. Ambiguous WBTC variants and USDe remain excluded until their
  contract origin, bridge behavior, and mature DEX routes are committed.
- Qualification is entirely DEX-native: canonical identity, token state,
  mature 30-minute and four-hour TWAPs, time-weighted liquidity, route age,
  two-sided quotes, and 48 continuous hourly passes. Stocks and ETFs must span
  two regular US market sessions.
- Capacity is probed at $1K, $5K, $10K, $25K, $100K, and $250K. Each asset
  records its highest two-sided notional that remains within 1% of its
  30-minute TWAP.
- Initial TVL is capped at $60K. Per-asset exposure is the lower of 50% of
  proven capacity and 20% of the active TVL cap.
- Readiness requires at least four qualified risk assets and enough
  post-classification capacity to deploy 80% of TVL while preserving at least
  20% USDG, no more than 20% per asset, and no more than 30% combined
  high-volatility exposure.
- Deprecated off-chain pricing, capitalization, AUM, supply-adapter, external
  quote-service, and quote-authorizer evidence has no authority over NAV,
  execution, qualification, readiness, or safe atomic exits. Historical
  evidence remains archived only.
- `DecisionContextV7` exposes activated assets, DEX capacity, route maturity,
  TWAP/TWAL safety, realized volatility, liquidity stability, and evidence
  coverage. Optional external research cannot authorize execution.
- The non-broadcast output is `mainnet-candidate-v5.json`. Mainnet services
  remain disabled and `42braincells.com` remains Coming Soon.

## Environments

| Environment          | Chain | Purpose                                                                          | Broadcast policy         |
| -------------------- | ----: | -------------------------------------------------------------------------------- | ------------------------ |
| Devnet               | 31337 | Deterministic development and destructive tests                                  | Local only               |
| Robinhood Testnet V3 | 46630 | Production-interface replicas, self-hosted DEX execution, wallets, and endurance | Test assets only         |
| Mainnet shadow       |  4663 | Asset qualification worker and fork/simulation evidence                          | Read-only; keys rejected |
| Mainnet canary       |  4663 | Paused canonical deployment and LAN verification on port 3003                    | Staged activation only   |

Robinhood does not publish canonical Stock Token deployments on chain 46630.
The V3 testnet deployment therefore uses clearly labelled ERC-8056-compatible
replicas. Their market prices come from official mainnet data, but they are not
real stocks or evidence that a canonical testnet token exists.

During active endurance testing, testnet decisions run every 15 minutes to
exercise more autonomous cycles. Local development and the intended mainnet
cadence remain hourly.

## Dynamic asset admission

Identity is `(chainId, contractAddress)`. A Robinhood UID is recorded when one
exists; symbols and names are display metadata only. Discovery never activates
an asset.

The readiness worker scans all 98 canonical Robinhood Stock Tokens plus the
committed crypto catalog. A symbol filter is diagnostic-only and causes release
readiness to fail. Every launch asset must pass 48 continuous hourly
observations; stocks and ETFs must also span two regular US market sessions.

Capacity is measured rather than assumed. The worker probes two-sided DEX
quotes at $1K, $5K, $10K, $25K, $100K, and $250K and records the highest level
that stays within 1% of the 30-minute DEX TWAP. Qualification also requires
canonical contract identity, supported transfer behavior, mature 30-minute and
four-hour observations, time-weighted liquidity, a current route, and clear
token/corporate-action state. A failure resets only that asset's clock.

The creator initially approves the qualified launch assets and may set a lower
dollar cap. Qualification, half of proven DEX capacity, configured asset weight,
and the immutable 20% protocol maximum always override that approval. A future
DAO or timelock receives the same risk authority through a two-step handover.

## Valuation and execution

- `DexTwapValuationAdapter` marks BRAINS NAV from a 30-minute TWAP on the
  deepest approved USDG route, using WETH only as an approved two-hop bridge.
- `UniswapExecutionAdapter` accepts only structured direct or two-hop routes
  through the canonical factory and router. Pools and fee tiers are approved;
  arbitrary calldata is impossible.
- DEX evidence is the only operative pricing, qualification, and execution
  authority. Deprecated oracle fields remain readable only for storage
  compatibility and cannot block a safe reduction.
- Exact temporary allowances, measured balance deltas, 1% exact-quote
  slippage, and 3% TWAP deviation are enforced on chain.
- `BasketVault` V5 uses `DexSwapPlanV1[]` for buys, sells, and rebalances. User sales
  are atomic. If any underlying sale fails, the transaction reverts and the
  user retains MDBS. Queue creation and processing are disabled.

## AI and research

DecisionContext V6 contains a compact row for every eligible asset and full
dossiers for current holdings plus the deterministic top 64. Its input budget
is 96,000 tokens. If the complete compact directory cannot fit, the cycle
holds and raises an operational alert.

Ornith may request one research round covering at most 16 registered assets.
The orchestrator returns only structured SEC, Robinhood, on-chain,
local-history, portfolio-history, and validated on-chain DEX evidence. It exposes no
arbitrary URL, web prose, user-selected contract, or browsing tool. Both model
requests, all evidence, hashes, raw outputs, validated targets, and
execution/simulation receipts are persisted. Every inference is stateless.

The allocator accepts any eligible registry identity, treats omitted assets as
zero, and rejects unknown identities, duplicate aliases, excessive positions,
or violations of the reserve, concentration, volatility, and turnover limits.

## Release evidence

Engineering acceptance requires:

- All Foundry unit, fuzz, invariant, adversarial-adapter, and storage-layout
  tests passing.
- A clean production build and browser UAT in light, dark, desktop, and mobile
  layouts.
- A clean two-hour V3 Robinhood Testnet endurance run with 20-minute
  checkpoints. Each checkpoint drives three secret-derived test actors through
  varied MDBS buys and atomic sells, initial brain purchases and 120% resales,
  preset changes, reward claims, rejected oversized exits, concurrent serve
  requests, NAV reconciliation, autonomous-cycle freshness, and desktop,
  tablet, and mobile browser checks.
- Completed 2026-07-29: Control Catalog v1 passed seven checkpoints across
  2.002 active hours. The final ledger contains 24 three-actor scenarios across
  eight passing checkpoints with live
  ControlBundle changes, MDBS buys and atomic sells, claims, initial brain
  purchases and compounded 120% resales, rejected oversized exits,
  concurrency, 24 responsive-layout checks, and zero browser errors. A
  preserved harness failure exposed fixed actor funding after a resale exceeded
  15,000 USDG; the protocol reverted atomically, price-aware funding was
  deployed through recorded repair commits, and repair downtime was excluded.
  The corrected checkpoint and every later checkpoint passed. No protocol
  transaction was lost or queued. The final live Ornith V5 decision executed
  on chain 46630 in transaction
  `0xaf5cde0a946982dbca8ce947ea510d9c4f9766e02c8bc4ab331f450a02b22dbc`.
  The acceptance artifact is
  `var/testnet-readiness/v3-2h-acceptance.json`.
- Completed 2026-07-30: self-hosted DEX V5 passed seven checkpoints across
  2.0109875 active hours from source candidate `bc67a484...` through exact
  pushed repair release `3c640ae1...`. The preserved ledger records 21
  three-actor scenarios, 21 responsive checks, atomic BRAINS buys and sells,
  four executed autonomous-cycle checkpoints, fresh DEX TWAP marks, reconciled
  NAV, zero protocol failures, zero queued sales, and zero application browser
  errors. The final natural DecisionContext V6 rebalance executed transaction
  `0x4b1eaf353076d407cf7b6ff56a1b9698b6b7dab33c9447926150231d3c68e180`.
  Final public Browser UAT passed Brain, braincell detail, Basket, and Decisions
  at desktop, tablet, and mobile widths in both themes without horizontal
  overflow. The acceptance source hash is
  `940fae207af636691316a8c96d0121c926d04c78ec150eb04540200a223f90f6`.
- Forty-eight continuous passing mainnet-shadow hours for every launch asset,
  including two regular sessions for stocks and ETFs.
- A successful mainnet-fork rehearsal with canonical code, UIDs, decimals,
  Uniswap pools, TWAP observations, creator risk policies, and structured
  route simulation.

`scripts/check-release.sh`, `scripts/promote-to-testnet.sh`,
`scripts/rehearse-mainnet.sh`, and `scripts/check-mainnet-canary.sh` produce
non-broadcast release evidence. `scripts/build-mainnet-candidate.mjs` writes
the immutable `mainnet-candidate-v4.json` report and signs its hash with the
encrypted, unfunded protocol-operator identity. No quote signer or trading API
credential exists. `scripts/deploy-mainnet.sh` remains
fail-closed. It requires chain 4663, a clean
pushed commit, encrypted signer, explicit broadcast flag, non-mock manifest,
runtime-bytecode verification, storage checks, fork evidence, testnet
acceptance, shadow evidence, and all external credentials. The shadow runner
rejects signing keys and broadcast mode.

## External activation gates

The remaining inputs are intentionally not fabricated in the repository:

- A production Alchemy Robinhood mainnet HTTPS RPC endpoint for the configured
  secondary and a production WebSocket endpoint. The LAN Nitro primary is
  already fixed at `192.168.50.173:8547`.
- Verified canonical Uniswap factory, router, quoter, pools, and route evidence.
- Final Safe/role addresses and funded mainnet gas wallet.
- Stable production domain.
- Forty-eight continuous qualification hours, including two regular sessions
  for every launch stock or ETF.
- Independent audit and approved legal release path.

No mainnet transaction or real-value activation is authorized by this
engineering specification.

## Current mainnet-shadow result

The previous fixed-symbol evidence is archived and does not establish current
readiness. The next candidate must run the unfiltered 98-token scan, build a
creator-approved witness of no more than nine assets, and prove enough effective
capacity for 80% of the $60,000 launch cap. Newly discovered assets begin their
own qualification clock at zero; unchanged identity, route, and evidence rules
may retain an existing asset's hours.

The regenerated signed candidate report has hash
`3c993f2b0aa26614a598b2f3400626150423fc25e72b53cde0f50f382a580d8b`.
It contains no included launch assets and is correctly marked
`readyToBroadcast: false`. The paused fork rehearsal is also not yet complete:
`/etc/mdb/mainnet.env` has not been installed from the checked-in template, so
required sequencer/USDG feed and deployment-array inputs are absent. This is a
release blocker, not a reason to relax the script.

## Graduation and canary controls

Devnet, testnet, and mainnet use the same Git commit and build artifact but
separate manifests, databases, state directories, history, secrets, signers,
services, and timers. Devnet acceptance creates a release candidate. Testnet
acceptance must reference that exact SHA. A contract, wallet, valuation,
execution, or accounting change requires a fresh two-hour testnet acceptance.

Mainnet deploys with basket buys, basket sells, AI rebalancing, and brain
purchases disabled. `paused-canary`, `user-actions`, `automation`, and
`emergency` are explicit on-chain stages. Claims remain independent. The apex
domain stays on Coming Soon until a recorded activation approval routes it to
the verified port-3003 canary.
