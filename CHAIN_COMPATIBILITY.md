# MillionDollar Brain Chain, Asset, Wallet, and UAT Specification

**Version:** 0.1
**Status:** MVP decisions locked

## 1. Network progression

Development advances through three network stages without changing protocol behavior:

| Stage                   | Chain ID | RPC                                  | Purpose                                                                           |
| ----------------------- | -------: | ------------------------------------ | --------------------------------------------------------------------------------- |
| Local Anvil             |    31337 | `http://127.0.0.1:8545`              | Fast development, deterministic integration tests, and destructive test scenarios |
| Robinhood Chain testnet |    46630 | LAN primary, remote HTTPS failover   | Public integration, wallet, explorer, deployment, and keeper validation           |
| Robinhood Chain mainnet |     4663 | LAN Nitro primary, Alchemy secondary | Audited real-value deployment                                                     |

Testnet server processes use a loopback failover gateway. Its primary is the
chain-46630 LAN RPC at `http://192.168.50.117:8547`; its secondary is a
separately configured remote HTTPS endpoint. The gateway compares chain ID,
sync state, and block heads every 15 seconds. It changes to the secondary afte
an immediate hard failure or two consecutive samples more than three blocks
behind, and returns only after four healthy samples within one block. Browse
wallets continue using `https://rpc.testnet.chain.robinhood.com`, so neither the
LAN endpoint nor a credential-bearing paid URL enters the browser bundle.
Ambiguous `eth_sendRawTransaction` failures are returned to the caller and are
not automatically replayed across upstreams.

Mainnet server processes use a loopback failover gateway. The LAN Nitro node at
`192.168.50.173:8547` is primary and an HTTPS Alchemy Robinhood mainnet
endpoint is secondary. Both heads are checked every 15 seconds; the gateway
fails over when the LAN node is unreachable, reports the wrong chain, is
actively behind, or exceeds the three-block lag threshold. It returns only
after four healthy recovery samples within one block. Browser wallets continue
using the official public HTTPS RPC and never receive either server endpoint.
The public mainnet RPC remains diagnostic infrastructure, not the server-side
backup.

Robinhood Chain is an EVM-compatible Arbitrum L2. Contracts are written and tested as standard EVM contracts. ETH is the native gas asset.

All chain-specific values live in versioned configuration:

- Chain ID.
- RPC and fallback RPC URLs.
- Block explorer.
- canonical USDG and WETH addresses.
- Protocol deployment addresses.
- Supported oracle and venue addresses.
- Confirmation and finality policy.
- Indexer start block.

No production contract, token, feed, or router address is copied from a different network.

## 2. Local Anvil environment

Foundry and Anvil are the required local contract environment. Docker is not used.

The VM runs Anvil directly and uses deterministic development accounts that are never funded or reused on a public network. Local startup scripts must:

1. Start Anvil on localhost with chain ID 31337.
2. Deploy every upgradeable protocol contract.
3. Deploy local test implementations for external dependencies.
4. Seed all 42 brain pieces and their presets.
5. Seed a representative discoverable and active asset universe.
6. Fund deterministic test wallets with test ETH and mock USDG.
7. write versioned deployment artifacts consumed by the frontend and services.

Required local test contracts and fixtures include:

- Mock USDG.
- Standard ERC-20 assets with varied decimals.
- Robinhood Stock Token mocks with 18 raw decimals and ERC-8056 multiplier behavior.
- Chainlink-compatible price aggregators.
- L2 sequencer-uptime feed and grace-period scenarios.
- Trading halt, stale-price, negative-price, paused-oracle, and corporate-action states.
- DEX or router adapters with configurable liquidity, spread, slippage, partial fill, expiry, and revert behavior.
- Fee-on-transfer, rebasing, callback, and malformed tokens used to prove unsupported behavior is rejected.

The local suite covers unit, integration, fuzz, invariant, upgrade, access-control, accounting, and end-to-end transaction tests. Local Anvil is the default environment for daily work; public testnet is not used as a substitute for deterministic testing.

## 3. Contract and deployment stack

| Concern            | MVP selection                                            |
| ------------------ | -------------------------------------------------------- |
| Contract language  | Solidity                                                 |
| Build and test     | Foundry: `forge`, `anvil`, and `cast`                    |
| Contract library   | OpenZeppelin Contracts Upgradeable                       |
| Proxy pattern      | UUPS behind ERC-1967 proxies                             |
| Authorization      | OpenZeppelin `AccessControl` with separated roles        |
| Upgrade validation | OpenZeppelin Foundry Upgrades plus storage-layout checks |
| Static analysis    | Slither                                                  |

The basket share is a custom ERC-20-compatible share token backed by a multi-asset vault. It is not described as ERC-4626 because the vault is multi-asset and supports queued USDG redemption.

The Brain NFT is ERC-721-compatible, but direct transfers are disabled. Ownership changes occur through the Brain Marketplace so settlement, reward checkpoints, and the mandatory 120% price are atomic.

All protocol contracts are upgradeable. Testnet may begin with creator-controlled development roles. Before any real-value deployment:

- Upgrade and high-risk administrative roles move to a 2-of-3 multisig.
- Normal upgrades use a 48-hour timelock.
- Upgrade code, storage changes, and migration steps are published before execution.
- Users receive an exit window before a normal upgrade takes effect.
- Emergency pause is immediate but cannot install new implementation code.
- Allocator signer, keeper, asset administrator, upgrade administrator, and vault withdrawal authority remain separate roles.

## 4. Asset compatibility model

The architecture supports:

- Standard ERC-20 tokens on the selected Robinhood Chain network.
- Robinhood Stock Tokens and ETFs using 18 raw decimals and the ERC-8056 Scaled UI Amount Extension.
- Additional token behavior only through an explicit, tested asset adapter.

“Compatible” means the registry, data pipeline, frontend, accounting, and execution interfaces can represent and evaluate the asset. It does not mean every deployed contract is automatically safe, liquid, legally eligible, or tradable.

The protocol maintains two separate universes:

1. **Discoverable universe:** every asset found through the official Robinhood Stock Token API, official Robinhood Chain contract registry, and permitted on-chain token discovery.
2. **Qualified decision universe:** every contract with 48 continuous passing
   hourly observations, two regular US market sessions for stocks and ETFs,
   and an explicitly committed, on-chain-active registry record.

Ornith sees every qualified asset in a compact directory and may assign
non-zero weight to no more than nine risk positions plus USDG.

## 5. Dynamic Robinhood asset discovery

The asset synchronizer polls the free official Stock Token API at `https://api.robinhood.com/rhj/` and the official Robinhood Chain contract registry. It stores, versions, and diffs:

- Robinhood asset UID.
- Token symbol and name as display metadata only.
- Deployment chain ID and canonical contract address.
- Issuer or deployment status.
- Current and pending multiplier.
- Trading capabilities for market, extended, overnight, whole, and fractional trading.
- Corporate actions.
- Quote status, bid, ask, underlying volume, halt state, and generation time.

Contract address plus chain ID establishes token identity. Symbols never establish identity.

Discovery runs at least daily and may run more often within the official rate limit. A discovered change cannot silently activate an asset or change the contract used by an already-approved asset. It creates a review event and, when relevant, pauses affected actions.

## 6. Robinhood Stock Token accounting

Stock Tokens are standard ERC-20 tokens with 18 raw decimals and ERC-8056 scaled UI amounts.

The system records both:

- Raw on-chain balance and supply.
- UI-scaled amount derived from the token multiplier.

The integration must support:

- `uiMultiplier()`.
- `newUIMultiplier()`.
- `effectiveAt()`.
- `balanceOfUI(address)`.
- `totalSupplyUI()`.
- `UIMultiplierUpdated`.
- `TransferWithScaledUI`.

Stock Tokens are not treated as rebasing tokens. Raw balances do not change when the multiplier changes.

Robinhood quote prices are prices of the underlying asset and are not multiplier-adjusted. Chainlink Stock Token feeds are already multiplier-adjusted. The price adapter records source semantics and must never apply the multiplier twice.

Corporate actions and pending multiplier changes can pause deposits, new purchases, NAV publication, or execution until the new state is reconciled. Historical accounting retains the multiplier and price-source version used at the time.

## 7. Asset admission and safety

A discoverable asset becomes active only after all required checks pass:

- Canonical chain ID and contract identity.
- Bytecode exists and required interfaces behave as expected.
- Decimals and transfer behavior are validated.
- Asset-adapter type is assigned.
- Price feed is mapped and tested.
- Feed decimals, heartbeat, positivity, timestamp, and pause behavior are configured.
- L2 sequencer uptime and grace-period checks pass.
- At least one approved execution route has executable liquidity.
- Slippage, price impact, trade-size, and position limits are set.
- Halt, buy-only, sell-only, hold-only, frozen, and corporate-action behavior is defined.
- Legal and jurisdiction policy permits protocol use.
- Thirty consecutive daily passes with verified $100 million circulating
  market cap or official fund AUM, $250,000 two-sided executable depth, no more
  than 1% impact on a $25,000 buy and sell, and sufficient official history.

Unknown, fee-on-transfer, rebasing, callback-bearing, denylisted, pausable, or otherwise nonstandard tokens are rejected by default. They require a dedicated adapter, threat review, and test suite before approval.

## 8. Oracle policy

Chainlink is the preferred execution and NAV oracle when a supported feed exists.

Every read validates:

- Feed address from the current official source of truth rather than a hardcoded historical list.
- Expected quote currency and feed decimals.
- Positive answer.
- Observation timestamp and maximum age.
- L2 sequencer uptime.
- Post-recovery grace period.
- Robinhood oracle or corporate-action pause state when exposed.

Stock Token feeds update on their documented market schedule, including 24/5 behavior rather than an assumed 24/7 schedule. A stale, paused, invalid, or unavailable required price blocks affected valuation or execution and follows the deterministic hold or asset-state policy.

## 9. Execution venue abstraction

The portfolio compiler emits bounded trade intents. A separate venue adapter produces executable transactions.

The adapter interface supports:

- AMM routing, initially including Uniswap-compatible pools.
- RFQ or aggregator quotes such as 0x, 1inch, or LI.FI.
- Proprietary market-maker or propAMM routing such as Rialto.
- Order-book routing such as Lighter when chain deployment and integration are validated.

Every route specifies token in, token out, exact amount or maximum input, minimum proceeds, deadline, venue, allowance target, expected price, oracle deviation, and slippage limit. The executor allowlists venues and token approvals. Quotes expire and are never generated by the LLM.

The production-shaped implementation uses 0x Swap API v2 through an EIP-712
quote-authorizer boundary. The signed intent also binds chain, vault,
recipient, target, calldata hash, reference block, and nonce. Exact temporary
allowances are cleared after the measured balance-delta execution.

An asset may be discoverable without having an executable route. Lack of liquidity or a valid route prevents activation and purchase.

## 10. Wallet compatibility

The web application uses RainbowKit, wagmi, and viem without wallet-brand-specific contract logic.

Supported connection paths:

- EIP-6963 injected-wallet discovery.
- EIP-1193 provider fallback.
- WalletConnect QR, mobile deep link, and compatible mobile-wallet sessions.

The target wallet matrix includes:

- MetaMask.
- Robinhood Wallet.
- Coinbase Wallet.
- Rabby.
- Brave Wallet.
- Rainbow.
- Trust Wallet.
- SafePal.
- Other standards-compliant injected or WalletConnect wallets.

Ledger and Trezor are supported through compatible wallet applications in the MVP rather than through a protocol-owned hardware-wallet integration.

The app can request network add and switch using `wallet_addEthereumChain` and `wallet_switchEthereumChain` for:

- Local Anvil.
- Robinhood Chain testnet.
- Robinhood Chain mainnet.

Users always see network, account, contract, method, amount, price protection, deadline, and expected state change before signing.

## 11. Wallet and transaction UAT

Automated Playwright tests provide deterministic regression coverage. Release UAT additionally uses both Codex browser surfaces named by the project:

1. **Codex in-app Browser**
   - Public and disconnected flows.
   - Responsive behavior.
   - Keyboard navigation and accessibility.
   - Drawer, modal, chart, and 42-piece SVG behavior.
   - Stale, paused, loading, failed-cycle, and empty states.
   - Screenshot evidence for release review.

2. **User Chrome**
   - Real installed wallet extensions and existing wallet sessions.
   - MetaMask and additional available-wallet connection.
   - Network add and switch.
   - Account change and disconnect.
   - Transaction confirmation and rejection.
   - Pending, replaced, reverted, and successful transaction states.
   - WalletConnect QR and mobile handoff where available.

Required wallet test cases include unsupported network, rejected connection, rejected signature, insufficient ETH, insufficient token balance, expired quote, changed price, changed account, chain switch during a flow, duplicate submission, page refresh while pending, and contract revert.

Neither browser surface replaces contract tests, automated browser regression, or public-testnet validation.

## 12. Public-testnet exit criteria

Robinhood Chain testnet is complete only after:

- All contracts deploy and verify from versioned artifacts.
- Upgrade rehearsal and storage-layout validation pass.
- At least two wallet connection paths complete every user write flow.
- Keeper cycles survive missed, duplicate, late, low-gas, and reverted submissions.
- Mock and available testnet assets exercise standard ERC-20 and ERC-8056 behavior.
- Oracle, sequencer, halt, multiplier, liquidity, and corporate-action failures produce the specified safe state.
- Deposit, NAV, share minting, queued redemption, fee split, reward claiming, brain sale, and preset changes reconcile against indexed events.
- Both in-app Browser and Chrome UAT gates pass.
- Runbooks cover deployment, rollback, pause, key rotation, keeper refill, data outage, and incident response.
