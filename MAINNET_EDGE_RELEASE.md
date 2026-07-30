# Mainnet-Edge Release Specification

**Status:** Non-broadcast engineering candidate in qualification
**Last verified:** 2026-07-29

## Environments

| Environment          | Chain | Purpose                                                                     | Broadcast policy         |
| -------------------- | ----: | --------------------------------------------------------------------------- | ------------------------ |
| Devnet               | 31337 | Deterministic development and destructive tests                             | Local only               |
| Robinhood Testnet V3 | 46630 | Production-interface replicas, signed RFQ execution, wallets, and endurance | Test assets only         |
| Mainnet shadow       |  4663 | Asset qualification worker and fork/simulation evidence                     | Read-only; keys rejected |
| Mainnet canary       |  4663 | Paused canonical deployment and LAN verification on port 3003               | Staged activation only   |

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

The required launch set is AAPL, NVDA, SPY, and WETH. MSFT, QQQ, and SOXX
remain optional and cannot delay the required set. Every candidate must pass
each check for 48 continuous hourly observations.
Stocks and ETFs must also span at least two distinct regular US market
sessions; weekend-only observations cannot qualify:

- Verified circulating market capitalization of at least $100 million for
  stocks and crypto, or official AUM of at least $100 million for funds.
- Non-stock ERC-20 supply comes from an explicitly approved circulating-supply
  adapter. `totalSupply * price` is not sufficient.
- A valid two-sided $250,000 0x quote and no more than 1% estimated impact for
  both sides of a $25,000 quote.
- Fresh approved valuation feed, valid token code and identity, sufficient
  official history, supported transfer behavior, and no halt, oracle pause, or
  pending corporate-action multiplier transition.

The hourly shadow runner automatically discovers Robinhood canonical
identities, imports the official Chainlink Robinhood feed catalog, reads
equity shares from SEC Company Facts, and reads ETF net assets from the latest
SEC N-PORT filing. WETH uses its canonical deposit-backed supply on Robinhood
Chain plus ETH/USD valuation. The runner writes per-asset checks and source
hashes. A failed
observation or a gap longer than 90 minutes resets only that asset's clock.
Unrelated code releases do not reset qualification. Activation still requires
a reviewed, committed manifest and an on-chain registry update.

## Valuation and execution

- `ChainlinkValuationAdapter` reads feed decimals dynamically, requires positive
  completed rounds, checks age and sequencer recovery, and rejects
  `oraclePaused` Stock Tokens. Chainlink Stock Token prices already include the
  multiplier; the protocol never applies it twice.
- `ZeroExExecutionAdapter` accepts only EIP-712 intents signed by the dedicated
  quote authorizer. Each intent binds chain, vault, token pair, exact input,
  minimum output, recipient, target, allowance target, calldata hash, expiry,
  reference block, and nonce.
- Targets, spenders, selectors, and tokens are allowlisted. The adapter uses
  exact temporary allowances, measures balance deltas, checks oracle deviation
  and output, returns assets to the vault, and clears approvals.
- `BasketVault` V3 uses `SwapPlan[]` for buys, sells, and rebalances. User sales
  are atomic. If any underlying sale fails, the transaction reverts and the
  user retains MDBS. Queue creation and processing are disabled.

## AI and research

DecisionContext V4 contains a compact row for every eligible asset and full
dossiers for current holdings plus the deterministic top 64. Its input budget
is 96,000 tokens. If the complete compact directory cannot fit, the cycle
holds and raises an operational alert.

Ornith may request one research round covering at most 16 registered assets.
The orchestrator returns only structured SEC, Robinhood, Chainlink, on-chain,
local-history, portfolio-history, and validated 0x evidence. It exposes no
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
- Forty-eight continuous passing mainnet-shadow hours for every launch asset,
  including two regular sessions for stocks and ETFs.
- A successful mainnet-fork rehearsal with canonical code, UIDs, decimals,
  oracle mappings, and real 0x quote simulation.

`scripts/check-release.sh`, `scripts/promote-to-testnet.sh`,
`scripts/rehearse-mainnet.sh`, and `scripts/check-mainnet-canary.sh` produce
non-broadcast release evidence. `scripts/build-mainnet-candidate.mjs` writes
the immutable `mainnet-candidate-v3.json` report and signs its hash with the
encrypted, unfunded protocol-operator identity. The quote authorizer is a
separate encrypted, no-funds identity. `scripts/deploy-mainnet.sh` remains
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
- Production 0x API credentials and validated current venue contracts.
- Final Safe/role addresses and funded mainnet gas wallet.
- Stable production domain.
- Forty-eight continuous qualification hours, including two regular sessions
  for every launch stock or ETF.
- WETH currently fails the locked $100 million circulating-capitalization
  threshold when measured from canonical WETH deposited on Robinhood Chain.
  This must be resolved through approved evidence or an explicitly approved
  policy change; readiness must not fabricate a pass.
- Independent audit and approved legal release path.

No mainnet transaction or real-value activation is authorized by this
engineering specification.

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
