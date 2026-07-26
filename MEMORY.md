# Project Memory

Durable project context lives here. Update this file whenever information should survive chat context compression or future agent handoff.

## Active Handoff

- Current task: Finalize the build-ready MillionDollar Brain PRD baseline. No implementation or deployment is authorized yet.
- Last meaningful change: Promoted `PRD.md` to v1.0, made six editorial light/dark mockups normative, and locked remaining internal product, economic, model, risk, infrastructure, and design decisions in `BUILD_READINESS.md` and `DESIGN_SYSTEM.md`.
- Next step: Begin implementation only after explicit user authorization, starting with repository scaffolding and the native Anvil environment.
- Blockers: None for local or public-testnet implementation. Real-value activation remains gated on counsel, funded and credentialed production inputs, live release manifests, and an independent audit.

## Current State

- MillionDollar Brain is a proposed Robinhood Chain product combining a basket-backed share, a 42-piece community-controlled AI context, scheduled portfolio proposals, deterministic risk controls, and fee-funded creator/brain rewards.
- The workspace contains product documentation and visual mockups only. No contracts, application code, token, or deployment exist.
- `PRD.md` v1.0 plus its ten linked normative specifications is the authoritative requirements set.
- `PRODUCT_BRIEF.md` is superseded historical context.
- No internal MVP implementation decision remains open. `BUILD_READINESS.md` distinguishes locked engineering defaults from external production inputs and release gates.

## User Preferences

- Keep `MEMORY.md` updated consistently with durable context that should survive chat compression.
- Agents should read `AGENTS.md` at startup and check `MEMORY.md` whenever context is missing, stale, or uncertain.
- Use uppercase filenames `AGENTS.md` and `MEMORY.md`.

## Source Of Truth

When sources conflict, use this order:

1. Current files in the workspace.
2. Latest command output or freshly verified tool output.
3. This `MEMORY.md` file.
4. Chat history.

## Freshness Rules

- Treat browser state, email state, authentication state, and external service results as stale unless verified in the current session.
- Treat documented repo structure, user preferences, and decisions as durable unless current files or fresh verification contradict them.
- Use `Last verified YYYY-MM-DD` for facts that can drift.

## Privacy Rules

- Do not store secrets, tokens, passwords, private keys, or sensitive personal data.
- Store only the minimum information needed for future handoff, especially when external systems or personal data are involved.

## Setup And Commands

- Authoritative VM repository: `/home/hendo420/projects/million-dollar-brain` on Ubuntu 24.04 at `192.168.50.135`.
- GitHub repository: `fourtytwo42/million-dollar-brain`.
- GPU45 model appliance: `192.168.50.189`; primary live model ID `ornith-1.0-35b-Q5_K_M-688b8d0a`.
- Development is native on the VM with no Docker. Foundry/Anvil, Node.js 24, PostgreSQL, Caddy, and `systemd` are the locked runtime direction.

## Project Map

- Project purpose: Design a community-influenced, AI-proposed portfolio protocol on Robinhood Chain.
- Main workflow: Deposits and redemptions are available on-chain at any time and users pay their own action gas; separately, the AI produces scheduled target-allocation proposals that deterministic controls approve and a DAO-funded keeper executes.
- External systems: Robinhood Chain, tokenized asset contracts, DEX liquidity, price oracles, an LLM provider, and an automation keeper. These are design dependencies only and are not configured.
- Important paths:
  - `AGENTS.md`: repository-local agent workflow and memory rules.
  - `MEMORY.md`: durable context store.
  - `PRODUCT_BRIEF.md`: working product model, open decisions, and validation phases.
  - `PRD.md`: product requirements, user journeys, acceptance direction, component scope, and open decisions.

## Architecture Notes

- Keep the vault/share, 42-piece brain market, and agent/execution pipeline as separate systems.
- The AI proposes typed target weights but never holds a key or bypasses the deterministic risk engine.
- Treat the executable asset universe as governance-allowlisted. The agent must not buy arbitrary discovered token contracts.
- A universal 2% fee would create a fee-on-transfer token and impair Uniswap v3/v4 compatibility. The current recommendation is to simulate a 1% entry plus 1% exit fee, split equally between the creator DAO and brain reward pool.
- Redemption is hybrid USDG-only: small requests may settle immediately while preserving the 20% reserve; other requests enter a cancellable FIFO queue. Stock Tokens are not distributed in kind.
- Brain pieces use an always-for-sale model: the full initial sale goes to the creator DAO; later buyers pay 120% of the last settled price, the seller receives the prior price, and only the 20% increase is split equally between the DAO and brain pool.
- Brain rewards on later purchases use a pre-transaction ownership snapshot so a buyer cannot immediately recover part of their own payment. Initial sales create no brain-owner reward and require no reward escrow.
- Portfolio review is scheduled, initially hourly, and independent of user actions. A scheduler or permissionless keeper submits signed AI proposals and is funded or reimbursed from the creator DAO's existing fee share.
- Deposits, redemptions, brain purchases, setting changes, claims, and governance remain available on-chain at any time. Each user pays only their own action gas and does not trigger the AI cycle.
- Scheduled proposals use a brain-state snapshot. Brain changes after that snapshot affect the next cycle, while execution always rechecks current holdings, prices, liquidity, risk limits, and slippage.
- Every brain piece has an immutable affinity, immutable weight, and closed protocol-defined option list. Owners may select an option on-chain but cannot submit text, links, images, instructions, or arbitrary prompt content.
- The AI is a constrained hourly allocator. Each cycle receives the entire canonical brain, approved asset universe and statistics, current basket and performance state, previous decision, and operating limits, then returns schema-validated target weights for the next hour.
- The model may run through OpenRouter or the user's local appliance behind one provider adapter. Provider, exact model, configuration, prompt version, input hash, and output hash must be recorded for every cycle.
- Invalid, stale, late, unavailable, or unsafe model results fail closed and keep the current portfolio. Models never receive keys or direct execution authority.
- Every protocol smart contract is UUPS-upgradeable behind ERC-1967. Local and early testnet may use development EOAs; before real value, high-impact roles move to a 2-of-3 EIP-1271-compatible multisig and normal upgrades use a 48-hour timelock. Emergency pause cannot install code.
- The MVP DAO is a simple creator-controlled upgradeable revenue vault. The owner may withdraw creator-side revenue, but basket principal and brain-owner liabilities must remain outside its normal withdrawal authority.

## Verification Ledger

- 2026-07-12: Read `AGENTS.md` and `MEMORY.md`; identified stale project-specific memory and preserved the repository-local instruction logic.
- 2026-07-12: Checked the workspace root; confirmed `AGENTS.md` and `MEMORY.md` are present and no `.git` directory is present at this level.
- 2026-07-23: Reviewed Brainfart's live mind and documentation. Verified its core pattern is weighted, wallet-owned agent influence; its separate token does not fund or govern a portfolio.
- 2026-07-23: Reviewed Malory's product and dashboard. Verified it describes an AI portfolio agent constrained by a deterministic risk envelope, but its dashboard was offline with no watched wallet or live data.
- 2026-07-23: Reviewed current Robinhood Chain documentation. Verified it is an EVM-compatible Arbitrum L2 with mainnet chain ID 4663, USDG, tokenized stock/ETF contracts, and listed Uniswap ecosystem support.
- 2026-07-23: Reviewed SEC investment-company and robo-adviser materials plus OpenZeppelin ERC-4626 and Uniswap fee-on-transfer documentation.
- 2026-07-25: Verified current Robinhood Chain documentation lists Alchemy as the recommended production RPC provider and QuickNode as another supported provider; public RPC endpoints are rate-limited and not production-grade.
- 2026-07-25: Calculated the selected light and dark semantic color-pair contrast baselines recorded in `DESIGN_SYSTEM.md`.
- 2026-07-25: Audited normative Markdown files for remaining open implementation decisions and replaced the PRD open-decision list with external production gates.

## Decisions

### 2026-07-12 - Reset Stale Project Context

- Removed old project identity, history, setup details, external-system references, and follow-ups from this memory file.
- Preserved the memory-system rules, privacy guidance, source-of-truth ordering, freshness rules, and handoff structure.

### 2026-07-23 - Initial Product Model

- Context: User proposed combining a purchasable AI brain with an AI-managed Robinhood Chain basket funded by a redeemable token.
- Decision: Treat the product as three systems: vault/share, 42-piece brain market, and agent/risk/execution.
- Files: `PRODUCT_BRIEF.md`, `MEMORY.md`.
- Commands/tests: Read-only product and documentation research; no deployment or transactions.
- Result: Defined the first coherent model, safety envelope, fee compatibility issue, legal gate, and 15 open product decisions.
- Follow-up: Resolve jurisdiction and legal path before real-funds architecture; then settle fee and brain-piece market mechanics.

### 2026-07-23 - Fee and Brain-Market Economics

- Context: User accepted entry/redemption fees and requested that NFT initial-sale revenue and the 20% increase on later purchases also fund the DAO and brain owners.
- Decision: Use a working 1% entry plus 1% redemption fee, each split 50/50. Send every initial NFT sale entirely to the creator DAO. On resale, return the previous settled price to the seller and split only the 20% increase 50/50 between the creator DAO and brain-owner reward pool.
- Files: `PRODUCT_BRIEF.md`, `MEMORY.md`.
- Commands/tests: Documentation update only; no code, token, deployment, or transaction.
- Result: The fee and brain-piece cash flows now have explicit formulas and an example.
- Follow-up: Confirm initial piece pricing, exact influence weights, and whether the assumed 1% entry plus 1% redemption amounts are final.

### 2026-07-23 - Initial Brain-Piece Revenue to DAO

- Context: Distributing initial-sale revenue to brain owners created self-rebate and first-sale recipient problems.
- Decision: Send 100% of every brain piece's initial purchase price to the creator DAO. Brain-owner rewards begin with basket fees and secondary-purchase markups.
- Files: `PRODUCT_BRIEF.md`, `MEMORY.md`.
- Commands/tests: Documentation update only; no code, token, deployment, or transaction.
- Result: Initial brain-piece sales no longer require ownership snapshots or reward escrow.
- Follow-up: Define initial piece prices.

### 2026-07-23 - User-Triggered Portfolio Reviews

- Context: Scheduled hourly reviews require a keeper or operator to trigger transactions and pay gas.
- Decision: Superseded. This entry briefly proposed making portfolio review dynamic and user-triggered.
- Files: `PRODUCT_BRIEF.md`, `MEMORY.md`.
- Commands/tests: Documentation update only; no code, token, deployment, or transaction.
- Result: Replaced by the scheduled-AI and anytime-user-actions decision below.
- Follow-up: None; do not use this superseded model.

### 2026-07-23 - Scheduled AI and Anytime User Actions

- Context: The user clarified that AI rebalancing should remain scheduled, while all user actions should be available on-chain at any time.
- Decision: Separate the clocks. A DAO-funded scheduler or permissionless keeper submits scheduled AI proposals. Deposits, redemptions, brain activity, claims, and governance remain independent on-chain actions paid by their users.
- Files: `PRODUCT_BRIEF.md`, `MEMORY.md`.
- Commands/tests: Documentation update only; no code, token, deployment, or transaction.
- Result: Scheduled rebalancing no longer depends on user activity, and users never pay the AI cycle's gas through an unrelated action.
- Follow-up: Choose the final schedule, keeper reimbursement formula, and missed-cycle policy.

### 2026-07-23 - Closed Brain Affinities and Options

- Context: The user clarified that brain pieces are not open text fields.
- Decision: Give every piece an immutable affinity and closed option list. Owners can change the selected option on-chain but cannot submit any custom content.
- Files: `PRODUCT_BRIEF.md`, `MEMORY.md`.
- Commands/tests: Documentation update only; no code, token, deployment, or transaction.
- Result: The brain is now a structured, auditable control surface rather than a prompt-injection surface.
- Follow-up: Define all 42 affinities, their option IDs, defaults, and weights.

### 2026-07-23 - Constrained Pluggable Portfolio Model

- Context: The user wants the complete brain, approved asset list, current basket, and relevant statistics supplied to a tightly constrained model that selects holdings for the next hour.
- Decision: Define a provider-neutral allocator that can use OpenRouter or the local appliance. It receives one versioned decision package and may return only schema-valid target weights for approved assets.
- Files: `PRODUCT_BRIEF.md`, `MEMORY.md`.
- Commands/tests: Documentation update only; no model call, code, token, deployment, or transaction.
- Result: Specified model inputs, structured output, provenance records, deterministic validation, and fail-closed behavior.
- Follow-up: Choose exact models, provider priority and fallback policy, approved asset statistics, and output reason-code vocabulary.

### 2026-07-23 - PRD v0.1 and Upgradeable Creator Vault

- Context: The user requested a PRD, required all smart contracts to be upgradeable, and simplified the MVP DAO to a vault from which the creator can withdraw funds.
- Decision: Create `PRD.md` v0.1. Make every protocol component upgradeable. Define the MVP DAO as a creator-controlled revenue vault with owner withdrawals and no voting or proposal system.
- Files: `PRD.md`, `PRODUCT_BRIEF.md`, `MEMORY.md`.
- Commands/tests: Documentation work only; no code, model call, contract, token, deployment, or transaction.
- Result: Converted the concept into product goals, actors, components, requirements, user journeys, validation phases, metrics, 24 open decisions, and a current decisions ledger.
- Follow-up: Review PRD assumptions and resolve brain schema, assets, redemption, upgrade administration, keeper economics, and legal structure.

### 2026-07-25 - Build-Ready PRD v1.0

- Context: User required the accepted light and dark mockups to be part of the PRD and requested that all internal decisions be locked before implementation.
- Decision: Make the six editorial mockups normative through `DESIGN_SYSTEM.md`; lock token identity, launch economics, brain valuation, risk limits, redemption thresholds, model parameters, fallback behavior, venues, multisig/timelock structure, RPC providers, monitoring, backups, fonts, colors, and verification thresholds in `BUILD_READINESS.md`.
- Files: `PRD.md`, `BUILD_READINESS.md`, `DESIGN_SYSTEM.md`, `TECH_STACK.md`, `CHAIN_COMPATIBILITY.md`, `BRAIN_PRESET_CATALOG.md`, `KEEPER_GAS_POLICY.md`, `README.md`, `MEMORY.md`.
- Commands/tests: Documentation consistency audit, current official Robinhood Chain provider research, semantic color contrast calculations.
- Result: No internal MVP product or architecture decision remains open. Local and testnet engineering can begin after explicit authorization.
- Follow-up: Obtain explicit build authorization. Treat counsel policy, signer addresses, funded balances, credentials, live release manifests, and audit acceptance as external production gates rather than engineering design choices.

## Known Issues

- A basket-backed, NAV-redeemable token holding tokenized stocks closely resembles a pooled redeemable investment product and may trigger securities, investment-company, adviser, custody, and distribution rules.
- Revenue payouts to brain-piece owners create an additional securities-like economic right.
- The requested universal 2% transfer fee conflicts with standard vault-share accounting and is unsupported by Uniswap v3/v4 fee-on-transfer token flows.
- In-kind redemption may fail for dust amounts or for holders ineligible to receive a restricted basket asset.
- Predictable time-gated rebalancing creates turnover, slippage, and MEV/front-running risk.
- The scheduled keeper requires a reliable DAO-funded gas reserve, reimbursement cap, duplicate-call protection, and missed-cycle policy.

## Completed Work

- 2026-07-25: Began the explicitly authorized local-devnet build on VM `192.168.50.135`. Installed Node 24, PostgreSQL 16, and Foundry 1.7.1 natively (no Docker). Added upgradeable Solidity foundation: mock USDG/assets/router, basket-share vault, weighted brain-piece marketplace, and reward distributor; installed pinned Foundry/OpenZeppelin dependencies and verified two Foundry integration tests (deposit/rebalance/liquidate/redeem and brain resale reward routing). This is local simulation only, with no public-chain deployment or real funds.
- 2026-07-25: Built the VM-hosted Next.js local-devnet application with a browser-local development wallet, faucet, USDG deposits, liquid redemptions, brain-piece buying, bounded presets, dashboard, and dark mode. The live LAN Ornith provider is reachable at the configured appliance and its allocation result was validated then executed through the on-chain basket keeper. The provider's `/responses` endpoint always streams SSE; the working integration uses `/chat/completions` and validates a four-asset JSON allocation before submitting it on chain.
- 2026-07-26: Added native systemd runtime units for Anvil, local deployment, web app, and hourly allocator; installed VM browser dependencies and added Playwright UAT. UAT verified wallet funding, deposit, brain purchase, and preset change in Chromium. Fixed a dashboard defect where holdings queried basket-share balances instead of underlying asset balances. The allocator retains a deterministic valid fallback if the LAN provider is temporarily unavailable.
- 2026-07-26: Revalidated the systemd-run cycle after increasing the Ornith completion allowance and requesting JSON-object output. The live provider returned a valid allocation and the keeper executed it on Anvil (cycle record source `ai`, block 27). The hourly timer remains enabled.
- 2026-07-26: Replaced the placeholder `Guardrails / Risk-on / Defensive` brain with the locked 42-piece catalog. A shared registry now supplies every affinity, category, weight, closed option, signed effect, canonical Ornith instruction, tags, and data dependencies to both UI and allocator. BrainMarketplace stores catalog version/hash and immutable affinity IDs. The VM was redeployed on disposable Anvil state, Chromium UAT verified Capital Objective ownership and option changes, and an Ornith-directed cycle recorded the active Maximum growth instruction before executing block 15.
- 2026-07-12: Reset stale project-specific memory while retaining the durable memory-management logic.
- 2026-07-23: Produced the initial MillionDollar Brain product brief without building or deploying anything.

## Open Follow-ups

- Obtain explicit user authorization before implementation begins.
- Obtain qualified legal analysis before accepting funds or publicly offering a basket-backed token.
- Supply production signer addresses, funded balances, provider credentials, domain, notification targets, and backup account.
- Generate and verify the release-candidate asset, oracle, venue, and contract manifests from then-current canonical sources.
- Complete independent audit and remediate all critical and high-severity findings before real-value activation.

## Do Not Forget

- Read `AGENTS.md` and `MEMORY.md` before making future changes in this workspace.
- Update `MEMORY.md` after durable discoveries, decisions, fixes, verification results, blocked work, and handoffs.
- Never store secrets, tokens, passwords, private keys, or sensitive personal data in `MEMORY.md`.
- Do not implement, deploy, mint, connect wallets, or transact until the user explicitly authorizes a build phase.
- The AI may propose allocations, but deterministic code must constrain and execute them.
- Never allow the agent to trade arbitrary discovered contracts.
- All protocol contracts are upgradeable.
- The MVP Creator DAO Vault is creator-controlled and may withdraw creator-side revenue only, not basket principal or brain-owner liabilities through its normal withdrawal interface.

## Archive

- No archived entries yet.
