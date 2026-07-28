# Mainnet-Edge Release Specification

**Status:** Engineering candidate; real-value activation disabled  
**Last verified:** 2026-07-28

## Environments

| Environment          | Chain | Purpose                                                                     | Broadcast policy                         |
| -------------------- | ----: | --------------------------------------------------------------------------- | ---------------------------------------- |
| Local                | 31337 | Deterministic development and destructive tests                             | Local only                               |
| Robinhood Testnet V3 | 46630 | Production-interface replicas, signed RFQ execution, wallets, and endurance | Test assets only                         |
| Mainnet shadow       |  4663 | Canonical identity, oracle, liquidity, AI, and simulation evidence          | Read-only; keys rejected                 |
| Mainnet              |  4663 | Real canonical assets                                                       | Disabled until every release gate passes |

Robinhood does not publish canonical Stock Token deployments on chain 46630.
The V3 testnet deployment therefore uses clearly labelled ERC-8056-compatible
replicas. Their market prices come from official mainnet data, but they are not
real stocks or evidence that a canonical testnet token exists.

## Dynamic asset admission

Identity is `(chainId, contractAddress)`. A Robinhood UID is recorded when one
exists; symbols and names are display metadata only. Discovery never activates
an asset.

Every candidate must pass each check on 30 consecutive UTC dates:

- Verified circulating market capitalization of at least $100 million for
  stocks and crypto, or official AUM of at least $100 million for funds.
- Non-stock ERC-20 supply comes from an explicitly approved circulating-supply
  adapter. `totalSupply * price` is not sufficient.
- A valid two-sided $250,000 0x quote and no more than 1% estimated impact for
  both sides of a $25,000 quote.
- Fresh approved valuation feed, valid token code and identity, sufficient
  official history, supported transfer behavior, and no halt, oracle pause, or
  pending corporate-action multiplier transition.

The hourly shadow runner writes per-asset checks and source hashes. Any missing
or failed daily observation breaks that asset's continuity. Activation still
requires a reviewed, committed manifest and an on-chain registry update.

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
- A clean 72-hour V3 Robinhood Testnet endurance run.
- Thirty consecutive passing mainnet-shadow qualification dates for every
  launch asset.
- A successful mainnet-fork rehearsal with canonical code, UIDs, decimals,
  oracle mappings, and real 0x quote simulation.

`scripts/deploy-mainnet.sh` remains fail-closed. It requires chain 4663, a clean
pushed commit, encrypted signer, explicit broadcast flag, non-mock manifest,
runtime-bytecode verification, storage checks, fork evidence, testnet
acceptance, shadow evidence, and all external credentials. The shadow runner
rejects signing keys and broadcast mode.

## External activation gates

The remaining inputs are intentionally not fabricated in the repository:

- Redundant paid mainnet RPC and WebSocket endpoints.
- Chainlink-supplied Robinhood tokenized-equity feed mappings and per-feed
  market-session freshness policies.
- Production 0x API credentials and validated current venue contracts.
- Final Safe/role addresses and funded mainnet gas wallet.
- Stable production domain.
- Completed 72-hour and 30-day evidence windows.
- Independent audit and approved legal release path.

No mainnet transaction or real-value activation is authorized by this
engineering specification.
