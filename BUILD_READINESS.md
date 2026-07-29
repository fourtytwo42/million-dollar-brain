# MillionDollar Brain Build-Readiness Baseline

**Version:** 1.1
**Status:** Control Catalog v1 product decisions locked; coordinated implementation pending

## Local-devnet implementation status

The native VM release implements the complete catalog-v3 collection: 42 named
ERC-721 characters, four crews, protocol-authored lore, five closed moods per
character, immutable portfolio affinities, and signed intensity from -2
through +2. It also implements always-for-sale pricing, basket shares, 1%
entry and redemption fees, the 50/40/10 fee split, creator withdrawal vault,
owner reward claims, atomic proportional redemptions with no queue, structured
allocator context, deterministic output validation, keeper authentication, and
systemd scheduling.

Control Catalog v1 is the locked next target. It replaces the one-mood owner
interface with 42 bespoke closed control panels, dynamic bounded cadence,
registry-scoped asset directives, and optional evidence-attention controls.
The live catalog-v3 state remains authoritative until a coordinated contract,
compiler, UI, replay, and testnet release migrates it.

The frontend implements an accessible interactive 42-path SVG Brain marketplace with one continuous anatomically traced lateral-brain silhouette, 42 individually generated roster-v4 portraits, roving keyboard navigation, map zoom, a searchable mobile list, character-led Brain Pulse, and a complete selected-piece right rail. Roster v4 contains 10 diverse humans and 32 creatures, machines, supernatural beings, or sentient objects without changing economic catalog v3. Completed cycles persist deterministic Brain Drama and support client-generated recap cards plus prefilled X, Farcaster, and Telegram sharing. Cerebrum, cerebellum, and brainstem metadata guide portrait placement without producing separate blob outlines. Both editorial light and dark modes are validated against live normative screenshots.

The Anvil universe intentionally retains its four legacy mocks for fast,
deterministic regression tests. The isolated V3 Robinhood Testnet environment
uses 12 production-interface replicas, while mainnet shadow inspects canonical
assets without signing or broadcasting. Production Chainlink mappings, 0x
credentials, multisig/timelock administration, fresh two-hour testnet evidence,
48-hour asset qualification,
legal review, and independent audits remain release gates.

## 1. Purpose

This document closes the remaining implementation choices required to begin construction. Engineering must implement these defaults without reopening them during normal development.

Changes require:

1. A written architecture decision record.
2. An explanation of why the locked baseline cannot meet the requirement.
3. Updated tests and affected PRD specifications.
4. Explicit product-owner approval.

External legal findings, audit findings, live contract addresses, signer addresses, account credentials, and funded balances are supplied inputs or release gates. They are not unresolved product-design decisions.

## 2. Product identity and tokens

| Item                                       | Locked value               |
| ------------------------------------------ | -------------------------- |
| Product                                    | MillionDollar Brain        |
| Basket share name                          | MillionDollar Basket Share |
| Basket share symbol                        | `MDBS`                     |
| Basket share decimals                      | 18                         |
| Brain NFT name                             | MillionDollar Brain Pieces |
| Brain NFT symbol                           | `MDBP`                     |
| Brain NFT supply                           | Exactly 42                 |
| Deposit, redemption, fee, and reward asset | USDG                       |
| Native gas asset                           | ETH                        |
| Additional fungible governance token       | None                       |

`MDBS` is a custom ERC-20-compatible share in a multi-asset vault. It is not marketed or implemented as an ERC-4626 vault.

## 3. Launch economics

| Parameter                            |               Locked MVP value |
| ------------------------------------ | -----------------------------: |
| Initial MDBS NAV                     |                  1.000000 USDG |
| Creator seed deposit                 |                    10,000 USDG |
| Minimum deposit                      |                        10 USDG |
| Minimum redemption request           |       10 USDG of estimated NAV |
| Entry fee                            |                        100 bps |
| Redemption fee                       |                        100 bps |
| Audited-pilot TVL cap                |                   100,000 USDG |
| Audited-pilot per-wallet deposit cap |                    25,000 USDG |
| Initial total brain valuation        |                    42,000 USDG |
| Secondary brain purchase multiplier  | 120% of previous settled price |
| Brain price decay                    |                           None |

Initial brain prices are:

| Tier                      |  Weight | Pieces | Initial price each |
| ------------------------- | ------: | -----: | -----------------: |
| Core mandate              | 500 bps |      6 |         2,100 USDG |
| Strategy                  | 300 bps |     12 |         1,260 USDG |
| Asset and sector affinity | 150 bps |     16 |           630 USDG |
| Decision behavior         | 125 bps |      8 |           525 USDG |

The initial 42,000 USDG brain valuation is separate from basket seed capital.

## 4. Fee routing

For each 1% entry or redemption fee:

- 50% of the collected fee accrues to eligible brain-piece owners.
- 40% is creator-withdrawable revenue.
- 10% funds the Automation Reserve.

For a secondary brain sale:

- The seller receives the previous settled price.
- The buyer pays 120% of that price.
- Half of the 20% markup goes to the Creator DAO Vault.
- Half of the 20% markup goes to eligible brain owners.
- The transferred piece is excluded from its own sale distribution.

Initial brain-piece revenue goes 100% to the Creator DAO Vault.

Rewards never expire. Ownership changes checkpoint rewards before settlement. Self-purchase is prohibited.

## 5. Deposit and redemption

### Deposit

- User actions are available at any time unless the required price, sequencer, compliance, or protocol state is invalid.
- The vault retains the current reserve fraction, purchases every positively held asset in proportion to pre-deposit value, and mints from actual post-swap NAV added at the pre-deposit NAV/share price.
- Deposits require a user-provided minimum share amount and deadline.
- Deposits above the active TVL or wallet cap revert.
- Zero-supply deposits use the governance-configured bootstrap target and mint initial shares at one USDG of actual NAV added.

### Redemption

- Every sale liquidates the holder's proportional claim, charges the acting
  holder's fee, burns MDBS, and returns USDG in one transaction.
- The user supplies minimum proceeds and a deadline.
- If any required sale cannot satisfy freshness, halt, liquidity, or slippage
  rules, the entire transaction reverts and the user retains MDBS.
- New queued sales and queue processing are permanently disabled. Legacy
  cancellation storage exists only for upgrade compatibility.
- Stock Tokens are not distributed in kind.

## 6. Portfolio and execution limits

| Limit                                        |                                        Locked value |
| -------------------------------------------- | --------------------------------------------------: |
| Maximum total positions including USDG       |                                                  10 |
| Maximum active risk assets visible to Ornith |                                                  24 |
| Maximum one-asset allocation                 |                                                 20% |
| Minimum USDG allocation                      |                                                 20% |
| Maximum combined high-volatility allocation  |                                                 30% |
| Maximum scheduled-cycle turnover             |                                          10% of NAV |
| Maximum rolling 24-hour turnover             |                                          35% of NAV |
| No-trade drift band                          |                          50 bps of portfolio weight |
| Minimum trade                                |                 Greater of 100 USDG or 5 bps of NAV |
| Maximum individual trade                     | Lesser of 5% of NAV or 2% of executable venue depth |
| Normal slippage limit                        |                                              50 bps |
| Absolute slippage ceiling                    |                                             100 bps |
| Maximum quote-to-oracle deviation            |                                             100 bps |
| Trade quote lifetime                         |                                         120 seconds |
| L2 sequencer recovery grace period           |                                       3,600 seconds |

No leverage, borrowing, lending, shorting, derivatives, or unbounded approvals are permitted.

The executor processes an accepted cycle atomically. Any planned trade failure reverts the complete rebalance. The current basket remains unchanged and the cycle is published as failed.

## 7. Schedule and model

| Item                        | Locked value                                         |
| --------------------------- | ---------------------------------------------------- |
| Scheduler eligibility check | Every five minutes                                   |
| Base review cadence         | Owner-selected 15m, 30m, 1h, 4h, 6h, or 24h          |
| Adaptive review cadence     | Bounded 15m, 30m, or 1h panic mode                   |
| Minimum trade cooldown      | Owner-selected 15m through 24h within hard limits    |
| Minimum trade drift         | Owner-selected 0.5% through 5% within hard limits    |
| Concurrency                 | One active cycle; no missed-window backlog           |
| Proposal expiration         | Derived per cadence with a hard protocol ceiling     |
| Primary model               | Ornith 1.0 35B MoE Q5_K_M                            |
| Live model ID               | `ornith-1.0-35b-Q5_K_M-688b8d0a`                     |
| Provider                    | GPU45 local appliance                                |
| Temperature                 | 0.2                                                  |
| Top-p                       | 0.9                                                  |
| Maximum output tokens       | 8,192                                                |
| Transport attempts          | Initial request plus one retry using identical input |
| Automatic provider fallback | Disabled                                             |

A transport retry is allowed only before the inference deadline and uses the same immutable input package. The first schema-valid final output wins.

The eligibility worker reads compiled on-chain cadence without rewriting
systemd timers. Setting changes never trigger immediate inference. Emergency
pause, mandatory-data freshness, cooldown, turnover, drift, and risk rules
always win.

OpenRouter remains an implemented provider adapter but has no active automatic fallback. If Ornith fails, the cycle holds. Enabling another model requires shadow testing, a published configuration change, and the normal 48-hour timelock.

## 8. Asset discovery and activation

### Discoverable universe

The synchronizer records all canonical Robinhood Stock Tokens and ETFs plus supported standard ERC-20 contracts.

### Mandatory eligibility

An asset is ineligible unless it has:

- Canonical chain ID and contract identity.
- Active official status.
- Valid adapter and transfer-behavior tests.
- Valid Chainlink or approved equivalent feed.
- Passing heartbeat, positive-price, sequencer, and pause checks.
- Buy and sell executable liquidity.
- Complete required data.
- No unresolved corporate-action transition.
- Explicit legal eligibility for the configured launch policy.

### Deterministic ranking

Eligible assets are ranked daily:

| Factor                                        | Weight |
| --------------------------------------------- | -----: |
| Executable on-chain or signed-quote liquidity |    35% |
| Underlying trading volume                     |    25% |
| Oracle availability and freshness             |    15% |
| Structured-data completeness                  |    15% |
| Diversification contribution                  |    10% |

The top 24 passing assets become candidates, subject to the category and risk caps. Activation requires a versioned manifest committed to the repository, on-chain registration, and timelocked risk-administrator execution. Contract addresses are resolved from live canonical sources and are never selected by symbol.

## 9. Venue adapters

The MVP implements:

1. `SignedRFQAdapter` for bounded signed quotes, including 0x-style RFQ settlement.
2. `UniswapAdapter` for allowlisted Uniswap-compatible pools and routers.
3. `MockVenueAdapter` for deterministic Anvil and test scenarios.

Rialto and Lighter remain future adapters behind the same interface and are not required for the MVP launch.

An asset may activate only when at least one implemented production adapter passes buy, sell, slippage, expiry, allowance, and revert tests for that exact asset.

## 10. Contracts and authorization

- Solidity and Foundry are mandatory.
- Every protocol contract uses a UUPS implementation behind an ERC-1967 proxy.
- OpenZeppelin upgradeable contracts and storage-layout validation are mandatory.
- Roles are separate: upgrade, pause, risk, asset registry, oracle, keeper configuration, treasury withdrawal, and allocator signer.
- The allocator signer and Keeper Wallet are different keys.
- The keeper has no custody, upgrade, treasury, registry, oracle, or pause authority.

Local Anvil and early testnet may use development EOAs. Before real value:

- Upgrade, risk, treasury, and high-impact administration move to a 2-of-3 EIP-1271-compatible multisig.
- Normal upgrades use a 48-hour `TimelockController`.
- Emergency pause is immediate.
- Emergency upgrade does not exist.
- Multisig signer addresses are supplied deployment inputs and include two separately stored hardware-wallet signers plus one independent recovery signer.

## 11. Creator DAO Vault safeguards

- The vault can withdraw only creator-withdrawable revenue.
- Basket principal, queued-redemption assets, brain rewards, and Automation Reserve funds are separate liabilities and unreachable through normal withdrawal.
- Withdrawal goes only to a registered destination.
- Destination changes use two-step acceptance and a 48-hour delay.
- Before real value, withdrawal authorization is the 2-of-3 multisig.
- There is no artificial withdrawal cap on available creator revenue.
- Every receipt, allocation, destination change, withdrawal, refill, and reimbursement emits an event.

## 12. Governance

There is no token voting, proposal system, delegation, quorum, or protocol governance in the MVP. Neither MDBS nor MDBP is a governance token.

Future governance is outside the MVP and requires a new PRD revision rather than a latent implementation hook beyond normal upgradeability.

## 13. Network and RPC

| Environment    | Primary                                             | Secondary                                             |
| -------------- | --------------------------------------------------- | ----------------------------------------------------- |
| Local          | Anvil at `127.0.0.1:8545`                           | None                                                  |
| Public testnet | Robinhood public testnet RPC                        | None                                                  |
| Mainnet        | Alchemy dedicated Robinhood Chain RPC and WebSocket | QuickNode dedicated Robinhood Chain RPC and WebSocket |

The Robinhood public mainnet RPC is tertiary read-only and incident-diagnostic infrastructure. It is not used as the sole production dependency.

During the current testnet-readiness phase, both MDB server and browser traffic
use `https://rpc.testnet.chain.robinhood.com`. A hosted testnet provider is
deferred until actual rate-limit or reliability evidence requires one. The
shared Robyn LAN node is explicitly outside MDB's runtime architecture.

Reads use health-scored failover. A signed transaction may be broadcast to both dedicated providers using the same raw transaction and nonce; duplicate acceptance is harmless because the transaction hash is identical.

## 14. Application, monitoring, and backups

| Concern                       | Locked selection                            |
| ----------------------------- | ------------------------------------------- |
| Web                           | Next.js App Router                          |
| API                           | Fastify                                     |
| Database                      | PostgreSQL                                  |
| Schema and migrations         | Drizzle                                     |
| Scheduler                     | TypeScript under `systemd` timers           |
| Local process manager         | `systemd`                                   |
| Reverse proxy                 | Caddy                                       |
| Metrics and off-host alerting | Grafana Cloud through native Grafana Alloy  |
| Public uptime checks          | Grafana Cloud synthetic monitoring          |
| Database backup               | Native `pg_dump`, WAL archive, and `restic` |
| Off-host backup               | Backblaze B2                                |

Operational targets:

- 15-minute database recovery-point objective using WAL archival.
- Four-hour recovery-time objective for the application VM.
- Daily encrypted database snapshots.
- 30 daily, 12 monthly, and 3 yearly backup retention.
- Quarterly restore rehearsal.
- Alerts go to the creator operations email and one backup contact.

No Docker, PM2, or same-host-only monitoring is permitted.

## 15. Frontend and design

- The six editorial light and dark mockups in `DESIGN_SYSTEM.md` are normative visual references.
- Light, Dark, and System modes are required.
- Source Serif 4, Source Sans 3, and IBM Plex Mono are the locked self-hosted typefaces.
- Exact semantic colors are locked in `DESIGN_SYSTEM.md`.
- The 42-piece brain uses accessible curved SVG paths with a separate presentation manifest and 42 optimized transparent v2 collectible portraits. The SVG anatomy contains 34 cerebrum pieces, 6 cerebellum pieces, and 2 brainstem pieces.
- Three public routes remain Brain, Basket, and Decisions; Admin is separate.
- Wallet support uses RainbowKit, wagmi, viem, EIP-6963, EIP-1193, and WalletConnect.

## 16. Repository and delivery

The monorepo layout is locked:

```text
apps/web
services/api
services/allocator
services/keeper
packages/contracts
packages/shared
packages/config
```

- `main` is protected.
- Pull requests require passing lint, typecheck, unit, contract, integration, and build checks.
- GitHub Actions performs CI.
- Production deployment is a reviewed, manually approved release executed on the VM.
- Deployment artifacts include contract addresses, implementation hashes, storage layouts, ABIs, asset manifest, model configuration, database migration version, and source commit.

## 17. Verification thresholds

Before public testnet:

- Contract unit, fuzz, invariant, upgrade, and access-control suites pass.
- Critical contract branches reach 100% coverage.
- Overall contract line coverage reaches at least 90%.
- CI fuzzing uses at least 1,000 runs per property.
- Release fuzzing uses at least 50,000 runs per property.
- Accounting invariants run at least 100,000 calls per release candidate.
- Frontend critical user journeys pass Playwright and axe.
- Control Catalog tests cover all 42 defaults, closed domains, one-transaction
  bundle updates, registry-scoped asset validation, deterministic compilation,
  conflicts, cadence, cooldown, data attention, and catalog-v3 migration.
- Context tests prove mandatory evidence cannot be removed and owner-authored
  text, URLs, contracts, and arbitrary sources cannot enter Ornith input.

Before real value:

- Independent smart-contract audit completes.
- No unresolved critical or high-severity audit findings remain.
- Economic simulation covers fee, brain-price, redemption-run, liquidity, stale-oracle, multiplier, and MEV scenarios.
- Public testnet exit criteria in `CHAIN_COMPATIBILITY.md` pass.
- In-app Browser and Chrome wallet UAT pass.
- Incident, pause, upgrade, key-rotation, restore, and rollback rehearsals pass.

## 18. External production gates

The following values cannot truthfully be invented during product design. They do not block local or public-testnet implementation:

1. Written counsel-approved jurisdiction, eligibility, transfer, disclosure, and entity policy.
2. Final checksum addresses for multisig signers, keeper, allocator signer, treasury destination, and backup keeper.
3. Funded creator seed capital, keeper ETH, and provider accounts.
4. Alchemy, QuickNode, WalletConnect, Grafana Cloud, Backblaze B2, domain, and notification credentials.
5. Release-candidate canonical asset, oracle, venue, and contract manifests generated from then-current live registries.
6. Independent audit report and remediation acceptance.

Mainnet deposit, brain purchase, and public distribution functions deploy disabled and remain disabled until every applicable gate is evidenced in the release checklist.

## 19. Build-ready conclusion

No product decision remains open for Control Catalog v1. Implementation is not
complete until the versioned bundle registry, migration reinitializer,
compiler, scheduler eligibility worker, control editor, replay fixtures, and
testnet acceptance land in one coordinated release.

Engineering may begin from this baseline. External gates control whether the completed system may accept real value; they do not require engineering to redesign the MVP.
