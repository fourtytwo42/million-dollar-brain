# Project Memory

Durable project context lives here. Update this file whenever information should survive chat context compression or future agent handoff.

## Active Handoff

- Current task: Keep local-devnet testing controls available while presenting a
  normal external-wallet interface on Robinhood Testnet.
- Last meaningful change: The Fund test wallet button and Disposable test
  wallet strip now render only in local mode. Testnet retains its session wallet
  and faucet hooks for automation, while its visible interface offers Connect
  wallet. The Brain steering-layer purpose banner was removed.
- Next step: No active implementation task. The ten-hour endurance runner and
  its twenty-minute watchdog were explicitly stopped by the user after
  checkpoint 27; do not resume them without a new request.
- Blockers: None for local use. FRED macro inputs remain intentionally inactive until a free API key is configured. Real-value activation remains gated on counsel, production integrations and credentials, dependency advisory remediation, multisig/timelock migration, a professional audit, and Robinhood Chain release manifests.

## Current State

- MillionDollar Brain is a proposed Robinhood Chain product combining a basket-backed share, a 42-piece community-controlled AI context, scheduled portfolio proposals, deterministic risk controls, and fee-funded creator/brain rewards.
- The authoritative VM repository contains a working local Anvil release with upgradeable contracts, a Next.js application, session-scoped disposable and external wallet support, hourly Ornith allocator, systemd services, and Playwright Chromium UAT.
- A parallel valueless mock deployment is live on Robinhood Testnet chain
  `46630`. The testnet app runs on port `3001` while local Anvil remains on
  `3000`; their databases, state, manifests, timers, and wallet sessions are
  isolated.
- Local devnet visibly exposes its disposable wallet and funding controls.
  Robinhood Testnet hides those controls while retaining the same internal
  session-wallet and `/api/faucet` test hooks for authorized automation.
- The 42-piece visual brain uses one continuous traced lateral silhouette. Semantic placement metadata labels 34 cerebrum pieces, 6 cerebellum pieces, and 2 brainstem pieces while preserving every canonical NFT ID and all economic mappings.
- The current `/brain-art/v4/` meme-universe roster contains 10 diverse humans and 32 nonhumans with distinct species or silhouettes. It remains 42 transparent 384-by-384 WebPs totaling about 1.58 MB; v3 remains archived and runtime references moved atomically to v4.
- Economic catalog v3 remains unchanged. Character roster v4 adds presentation copy, character kinds, visual archetypes, rivalries, five preset catchphrases, victory/objection/blame/fallback lines, and sharing hooks.
- Every new allocation persists one deterministic `memeRecap` in `cycles.jsonl` using the recorded brain snapshot and actual target allocation. No additional model call is made, and legacy cycles remain readable without invented dialogue.
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
- `cloudflared` 2026.7.3 is installed from Cloudflare's official amd64 package. `mdb-cloudflared.service` runs a temporary Quick Tunnel to `http://127.0.0.1:3000`; the random `trycloudflare.com` hostname is read from its journal and may change after tunnel recreation.
- Robinhood Testnet uses the official public RPC
  `https://rpc.testnet.chain.robinhood.com` for both server and browser
  traffic. `mdb-web-testnet.service` serves port `3001`;
  `mdb-market-collector-testnet.timer` and `mdb-cycle-testnet.timer` are
  enabled. The former LAN testnet RPC at `192.168.50.117` is now mainnet and
  must not be used by MDB testnet. Last verified 2026-07-28.

## Project Map

- Project purpose: Design a community-influenced, AI-proposed portfolio protocol on Robinhood Chain.
- Main workflow: Deposits and redemptions are available on-chain at any time and users pay their own action gas; separately, the AI produces scheduled target-allocation proposals that deterministic controls approve and a DAO-funded keeper executes.
- External systems: The LAN Ornith model provider and automation keeper are configured for local use. Robinhood Chain, production tokenized assets, DEX liquidity, and price oracles remain testnet/mainnet integrations.
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
- Redemption is atomic USDG-only at every valid size. The vault proportionally sells the acting holder's fraction of all positively held assets, burns MDBS, routes fees, and transfers USDG in one transaction. If any required step cannot meet freshness, availability, deadline, or slippage checks, the whole transaction reverts and no state changes. New queue creation and processing are disabled; legacy queue storage and cancellation remain only for upgrade compatibility.
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

- 2026-07-28: Verified the network-specific test-control presentation after the user stopped the endurance run. On local port 3000, in-app-browser UAT found exactly one `Fund test wallet` button and one `Disposable test wallet` strip. On testnet port 3001, both counts are zero while `Connect wallet` remains present. The removed `YOU ARE HERE: THE STEERING LAYER` banner is absent in both environments. Eleven network-policy tests, seven wallet tests, the Next.js production build, both web-service restarts, and HTTP 200 checks pass. Future testnet endurance funding uses the retained session-wallet key plus `/api/faucet` hook rather than visible controls.
- 2026-07-12: Read `AGENTS.md` and `MEMORY.md`; identified stale project-specific memory and preserved the repository-local instruction logic.
- 2026-07-12: Checked the workspace root; confirmed `AGENTS.md` and `MEMORY.md` are present and no `.git` directory is present at this level.
- 2026-07-23: Reviewed Brainfart's live mind and documentation. Verified its core pattern is weighted, wallet-owned agent influence; its separate token does not fund or govern a portfolio.
- 2026-07-23: Reviewed Malory's product and dashboard. Verified it describes an AI portfolio agent constrained by a deterministic risk envelope, but its dashboard was offline with no watched wallet or live data.
- 2026-07-23: Reviewed current Robinhood Chain documentation. Verified it is an EVM-compatible Arbitrum L2 with mainnet chain ID 4663, USDG, tokenized stock/ETF contracts, and listed Uniswap ecosystem support.
- 2026-07-23: Reviewed SEC investment-company and robo-adviser materials plus OpenZeppelin ERC-4626 and Uniswap fee-on-transfer documentation.
- 2026-07-25: Verified current Robinhood Chain documentation lists Alchemy as the recommended production RPC provider and QuickNode as another supported provider; public RPC endpoints are rate-limited and not production-grade.
- 2026-07-25: Calculated the selected light and dark semantic color-pair contrast baselines recorded in `DESIGN_SYSTEM.md`.
- 2026-07-25: Audited normative Markdown files for remaining open implementation decisions and replaced the PRD open-decision list with external production gates.
- 2026-07-26: Verified the anatomical Brain redesign with a clean Next.js production build, Prettier, all 42 region assignments, light/dark/mobile screenshots, the complete Chromium economic flow, and a live autonomous allocation cycle.
- 2026-07-26: Verified interactive crew filtering in Chromium: Market Mystics highlights exactly 12 pieces, applies an accessible pressed state, mutes the other 30, and clears on a second activation.
- 2026-07-26: Verified every crew spans more than 250 SVG units horizontally and 190 vertically while retaining member counts of 6, 12, 16, and 8; full economic and autonomous-cycle Chromium UAT still passes.
- 2026-07-26: Verified recovery of the complete AI-directed hourly path after the appliance gateway fixed its Ornith cold-start race. The normal `mdb-cycle.service` path recorded `source: "ai"` at `2026-07-26T17:00:04.608Z`, proposed USDG 20%, NVDA 35%, AAPL 20%, and ETHX 25%, and executed successful Anvil transaction `0x48b6fa8ffc69bf3df4d20b654d0a0a7234aea3d905e629bd4114664cad28df1f` in block 30. Priced holdings match those weights exactly, all VM services and the hourly timer are active, and a fresh cold Ornith request plus GPU45 `/health` returned HTTP 200. Keep the existing MDB AI URL/model configuration; do not add an app-side SSH or startup workaround because the race was fixed at the appliance gateway.
- 2026-07-26: Fixed the Basket Snapshot valuation defect by returning router-priced `holdingValues` separately from raw token-unit `holdings` and using those values throughout Snapshot and Basket Ledger. Production build and Prettier pass; Chromium UAT verifies priced holdings reconcile exactly to NAV, and final in-app-browser UAT showed current and target weights aligned at USDG 20%, NVDA 40%, AAPL 10%, and ETHX 30%.
- 2026-07-26: Implemented historical decision exploration. `/api/status` returns the newest 50 valid cycle records; Decisions selects the latest by default and lets users inspect older AI or fallback cycles, their brain context, allocation, rationale, block, rebalance hash, and optional redemption-settlement hash. Production build, Prettier, full economic/AI Chromium UAT, historical selection, mobile overflow, and live in-app-browser visual checks pass.
- 2026-07-26: Removed the duplicate Basket Snapshot from Brain and kept basket composition and funding actions on the dedicated Basket screen. Added a persistent double-outline halo for pieces owned by the connected wallet in Characters, Ownership, Influence, and Mood modes, with a textual `Yours (n)` legend. Next production build, Prettier, full Chromium UAT, live no-overflow check, and in-app-browser visual review pass.
- 2026-07-26: Made `Yours (n) · double outline` clickable in every Brain map mode. It uses the same pressed-state, dim-nonmembers, and second-click-to-clear behavior as crew filters; choosing a crew clears `Yours` and choosing `Yours` clears the crew. Production build, full Chromium economic UAT, and live in-app-browser verification pass with exactly two connected-wallet-owned pieces highlighted and no horizontal overflow.
- 2026-07-26: Removed the Brain's Characters/Ownership/Influence/Mood selector and its unused mode state, presentation type, SVG patterns, semantic fills, and legends. The map is now one character-first view with crew filters and the interactive `Yours` ownership filter; influence and current mood remain visible through accessible labels, tooltips, and the inspector. Production build, full Chromium economic UAT, live visual review, two-piece `Yours` filtering, and no-overflow checks pass.
- 2026-07-26: Verified the diversified v3 character roster: exactly 42 unique transparent 384-by-384 WebPs with valid alpha corners and a 1.4 MiB total budget. Next.js production build, Prettier, the full economic/autonomous-cycle Chromium UAT, live light/dark visual review, and zero browser console errors pass.
- 2026-07-26: Verified character roster v4 and the deterministic meme layer. The roster has exactly 42 unique 384-by-384 transparent WebPs, 10 humans, 32 nonhumans, valid rival IDs, five catchphrases per character, transparent corners, and a 1.58 MB total budget. Five recap unit tests, Prettier, five Foundry tests, the Next.js production build, and the full Chromium economic/autonomous-cycle UAT pass. The live hourly endpoint recorded `characterRosterVersion: 4` plus an immutable `memeRecap`, executed the AI allocation on Anvil, and left `mdb-cycle.timer` active. Live in-app-browser UAT verified the hydrated roster, Brain Drama, exact factual moods/influences, direct `?view=decisions&cycle=<tx>` resolution, and zero console errors.
- 2026-07-26: Installed `cloudflared` 2026.7.3 on the VM and enabled `mdb-cloudflared.service` for a temporary public demo tunnel. Verified the assigned TryCloudflare origin returns HTTP 200 for the home page, `/api/status`, and a v4 portrait. Quick Tunnels are development-only, have no uptime guarantee, and receive a new random hostname when recreated.
- 2026-07-26: Added the first-visit comprehension layer. The non-blocking `How it works` guide explains Own, Steer, Propose, and Verify, includes a five-term glossary, persists dismissal, and always reopens from the header. Brain, Basket, and Decisions now state their purpose and explain setting, fee, redemption, and execution consequences in plain language. Prettier, Next.js production build, full economic/autonomous Chromium UAT, desktop/mobile bounds checks, and live in-app-browser console review pass.
- 2026-07-26: Replaced the large inline onboarding block with a fixed-position quick tour that shows one of four steps at a time, leaves the Brain in its normal above-the-fold position, becomes a 12-pixel-inset mobile bottom sheet, and collapses the glossary by default. Prettier, production build, full Chromium economic/autonomous UAT, an explicit no-layout-shift assertion, mobile bottom-sheet assertion, live visual review, and zero page-level horizontal overflow pass.
- 2026-07-26: Centralized positive-position presentation rules in `apps/web/lib/portfolio-display.ts`. Basket hides assets whose actual on-chain token balance is zero; Decision history summaries, selected target rows, and share-card allocation summaries hide weights at or below zero. Two focused helper tests, Prettier, production build, full Chromium economic/autonomous UAT, and live Basket/Decision review pass. Live history visibly omits AAPL from cycles where its target was zero.
- 2026-07-27: Upgraded the existing BasketVault UUPS proxy to live-NAV proportional pool shares without resetting MDBS supply, balances, fees, or queued redemptions. Thirteen Foundry tests plus a 256-run fuzz test verify live oracle NAV, non-dilutive proportional deposits, proportional exits, transfer isolation, stale-price failure, slippage, queue behavior, and dust handling. The live V2 allocator recorded a stateless bounded context with 12 cycles and 4,096 estimated tokens, persisted exact artifacts to native PostgreSQL, returned an Ornith allocation of USDG 20%, NVDA 50%, AAPL 0%, and ETHX 30%, and executed it on Anvil. Prettier, production build, focused data tests, full Chromium economic/autonomous UAT, responsive checks, and LAN/public HTTP checks pass.
- 2026-07-27: Installed and enabled `mdb-market-collector.timer`. It records five official Robinhood streams every minute, deduplicates by source timestamp, builds retained candles and independently gated features, indexes post-activation vault events, and stores accounting/outcome evidence in versioned PostgreSQL tables. The event-only BasketVault upgrade preserved supply `14737533990218702064854`, NAV `14737533990218702034940`, and redemption counter `17`. A live V3 Ornith cycle used 6,021 estimated tokens, kept SPY/QQQ/SOXX/ETH-USD non-executable, allocated USDG 20%, NVDA 40%, AAPL 10%, and ETHX 30%, and executed transaction `0x5f5611217d86fee9902610d5521a2585603e74ade7bbe7927b92c49b544334f2` in block 321. Four market tests, four context tests, five meme tests, two display tests, fourteen Foundry tests plus 256 fuzz runs, production build, full Chromium UAT, and public HTTP checks pass.
- 2026-07-27: Final in-app-browser V3 review found that Coinbase hourly candles arrived newest-first, causing a negative ETH history span and selecting the oldest observation as current. `apps/web/lib/decision-context.ts` now sorts ETH observations oldest-first, and `tests/market-data.test.ts` prevents regression. A new live Ornith cycle executed transaction `0xee75b2fd8f5433f26f02a51104b1e4aa03c61f833061a4f6756c5800287ca512`; Decisions now shows 350 ETH samples, a positive 20,940-minute span, and the newest `$1,940.72` price. The final Chromium UAT now selects the least-expensive live brain piece and its own catalog preset instead of assuming piece 1 remains affordable; the complete economic, autonomous-cycle, responsive, history, and dark-mode run passes against accumulated devnet state.
- 2026-07-27: Upgraded the live BasketVault UUPS proxy to atomic-only MDBS sales in transaction `0xaabb1430a26488e22473497b4709cad695078ccb6170751463748b5d31d19c37`. Pre/post state matched exactly: NAV `24588033990218702047742`, supply `24588033990218702085339`, NAV/share `999999999999999998`, and queue counters both `25`, proving no outstanding request. The old request entry point now reverts with `queued exits disabled`. Sixteen Foundry tests plus 256 fuzz runs, Prettier, production build, full Chromium economic/autonomous UAT, and final in-app-browser inspection pass. The live Sell panel shows 25%, 50%, 75%, and Max, explains atomic settlement in collapsed details, and exposes no queue state. A refresh-message race found by UAT was also fixed so successful buy/sell receipts remain visible.
- 2026-07-27: Replaced Basket's horizontal holdings bars with an accessible value-weighted donut chart. The chart includes only positively held assets and uses distinct light/dark palette slices; its adjacent legend preserves exact current weight, USD value, and latest Ornith target, and stacks below the chart on mobile. Prettier, production build, full Chromium economic/autonomous UAT, positive-only slice assertions, and live in-app-browser light/dark visual review pass.
- 2026-07-27: Replaced Basket's reference-only and raw observation-count cards with MDBS price history, time-weighted returns, total/realized/unrealized P&L, and cash-flow separation. The Decisions audit panel now owns official source, current on-chain price, and coverage details. The chain-31337 collector synchronizes and verifies matching mock oracle/router prices from Robinhood AAPL/NVDA and Coinbase ETH-USD. Live proof kept supply at `26667033990218702090051`, moved NAV/share from `999999999999999998` to `996709512611462297`, and produced non-zero P&L. Seven market tests, four context tests, two display tests, sixteen Foundry tests plus 256 fuzz runs, Prettier, production build, complete Chromium economic/autonomous UAT, and final in-app-browser review pass.
- 2026-07-27: Deployed the complete valueless mock stack to Robinhood Testnet
  chain `46630`. All ten manifest addresses have runtime code and the oracle
  has automatic freshness disabled. One underestimated oracle-configuration
  transaction ran out of gas; the single missing call was repaired in
  transaction
  `0x720cdc31e76324a04a66ce17db2501873a3f196265f5e8b98a36445d2d542389`,
  and future broadcasts use a 150% gas-estimation multiplier.
- 2026-07-27: Live testnet UAT funded a session wallet, bought 1,000 USDG of
  MDBS into an exact 20/30/25/25 pool, sold 25% atomically with no queued
  request, purchased piece 42, selected `Macro Feast`, accrued and claimed
  brain-owner fees, and rendered a WalletConnect QR. Operator transactions are
  serialized to prevent nonce races, failed faucet attempts refund their rate
  reservation, and the collector can recover stale prices.
- 2026-07-27: The final corrected Ornith cycle recorded
  `mode: "robinhood_testnet_mock"`, `source: "ai"`, fresh required inputs, and
  executed 20% USDG, 30% NVDA, 25% AAPL, and 25% ETHX in transaction
  `0x88438880a7d00ee673a7ab32a155575ea0d35264907112eaa4681d34893c548f`.
  Decisions shows both testnet cycles and their execution evidence. Sixteen
  Foundry tests, all focused TypeScript suites, full Prettier, production
  build, live local/testnet status, WalletConnect QR, and zero browser console
  errors passed.
- 2026-07-27: Hardened the testnet price collector after public-RPC replicas
  briefly returned inconsistent latest-state reads. Initial oracle/router reads
  now use one explicit block, post-transaction verification uses the receipt
  block with bounded retries, and freshness heartbeats update both contracts
  even for sub-basis-point price movement. The testnet AI timer moved from
  minute 30 to minute 32 to avoid collector overlap. Market tests, production
  build, all focused TypeScript suites, sixteen Foundry tests, and consecutive
  unattended collector runs passed; `/api/status` remained HTTP 200. A final
  live Ornith cycle used fresh V3 context, recorded `source: "ai"` and
  `mode: "robinhood_testnet_mock"`, and executed the 20/30/25/25 allocation in
  transaction
  `0xd172622332672589c53c7cc13107261f9505ba418122512ba9757e9e9cb5d7c6`.
- 2026-07-28: Replaced per-contract testnet dashboard reads with canonical
  Multicall3 batching, bounded public-RPC retries, and a thirty-second testnet
  poll. Twenty-four consecutive uncached account status requests all returned
  HTTP 200 with 392 ms average and 571 ms maximum latency. The endurance-runner
  smoke checkpoints exercised faucet funding, initial and resale brain-piece
  purchases, a preset change, a 100 USDG MDBS buy, a 25% atomic MDBS sale, and a
  reward claim;
  verified six services and timers, exact NAV reconciliation, AI decision
  history, Brain Drama, theme and crew interactions; and recorded no queued
  redemption or browser error.
- 2026-07-28: Endurance checkpoint 1 passed its complete user flow but exposed
  a collector nonce-too-low error and a false missing-receipt result from
  inconsistent public-RPC replicas. The supposedly missing transaction was
  confirmed successfully mined. `apps/web/lib/chain.ts` now gives the operator
  a Viem nonce manager and centralizes replica-safe receipt polling with
  replacement detection disabled; the disposable browser wallet uses the same
  nonce policy and every browser receipt wait uses the replica-safe policy.
  Network, wallet, and market tests, full formatting, and the production build
  passed. Two forced collector cycles beyond separate freshness boundaries
  then completed multiple consecutive price writes without a nonce, receipt,
  rate-limit, or verification error.
- 2026-07-28: Endurance checkpoint 2 initially failed because the original
  0.0001 test ETH top-up was exhausted after two complete action suites; the
  failure screenshot preserved the exact insufficient-balance banner. The
  testnet faucet default is now 0.00025 ETH with a 0.003 ETH daily cap and the
  unchanged 0.005 ETH operator reserve. The runner funds every third checkpoint
  and after every process restart, clears repaired failure state only after a
  pass, and records the visible banner on future failures. Two gas failures and
  one deliberate repair-stop interruption remain in the immutable JSONL
  evidence. The repaired checkpoint 2 then funded a fresh wallet, bought piece
  38, selected `Signal First`, bought 150 USDG of MDBS, sold 25% atomically,
  claimed rewards, and passed all service, NAV, history, UI, and browser-error
  checks.
- 2026-07-28: Endurance checkpoint 3 exposed a fixed-modulo funding edge after
  a repaired checkpoint had already funded the same wallet less than one hour
  earlier. The runner now records `nextFundingCheckpoint` and advances it three
  checkpoints only after a successful top-up; process restarts still force one
  fresh-wallet top-up. Checkpoint 4 verified that rolling schedule, funded the
  new wallet, bought piece 40, selected `Take the Money`, bought 100 USDG of
  MDBS, sold 25% atomically, claimed rewards, reconciled NAV exactly, and
  recorded zero browser errors.
- 2026-07-28: Checkpoint 4's first attempt also exposed a race where the faucet
  transaction completed but its follow-up `/api/status` refresh crossed a mock
  oracle staleness boundary and replaced the success notice with `stale price`.
  Background polling no longer overwrites action notices, every confirmed
  wallet action retries status refresh for up to 90 seconds, and the chain-46630
  oracle heartbeat threshold moved from 60 to 45 seconds to leave headroom for
  the minute collector's public-RPC confirmation time. Network and market tests,
  full formatting, and the production build passed. Checkpoint 5 then verified
  the repaired path under its normal schedule: the wallet funded without a
  stale-price interruption, piece 41 was purchased and set to
  `Three References`, 125 USDG of MDBS was bought, 25% was sold atomically,
  rewards were claimed, NAV reconciled exactly, and browser errors remained
  empty.
- 2026-07-28: Endurance checkpoint 13 began its scheduled top-up a few seconds
  before the same disposable wallet's prior one-hour faucet cooldown had fully
  elapsed. The immutable failed attempt records HTTP 429 and the visible
  `Faucet limit reached` banner; the automatic fresh-wallet restart then passed
  checkpoint 13. `tests/endurance-testnet.mjs` now persists `nextFundingAt`
  after each successful top-up and waits until that timestamp plus a
  five-second safety buffer for future scheduled top-ups, while restart funding
  remains immediate. Node syntax, Prettier, and diff checks passed. Checkpoint
  14 then funded, purchased piece 27, selected `Energy Detox`, bought 150 USDG
  of MDBS, sold 25% atomically, claimed rewards, reconciled all four holding
  values exactly to NAV, and recorded zero browser errors. All local/testnet
  services and timers remained active and ports 3000/3001 returned HTTP 200.
  Checkpoint 17 directly exercised the repaired boundary: it waited 52,923 ms
  for the recorded cooldown, funded successfully without HTTP 429, purchased
  piece 30, changed its preset, bought 125 USDG of MDBS, sold 25% atomically,
  claimed rewards, reconciled NAV exactly, and recorded zero browser errors.
- 2026-07-28: The checkpoint 18 cross-environment audit found local Anvil had
  restarted at block zero during unattended host maintenance while the prior
  deployment manifest and still-active one-shot deploy state remained. This
  made local collector and cycle calls fail with zero-data contract reads even
  though their timers and web service were active. The local mock stack was
  redeployed, `ops/mdb-anvil.service` now uses
  `var/local-anvil/state.json` with a five-second state interval, and deploy
  units no longer bind their one-shot lifecycle to an Anvil restart. Two
  controlled Anvil restarts preserved the exact block and BasketVault bytecode;
  the local status and collector returned HTTP 200, all local timers recovered,
  and no failed systemd units remained. Testnet checkpoint 18 independently
  purchased piece 31, selected `Digital-Rock Maxi`, bought 150 USDG of MDBS,
  sold 25% atomically, claimed rewards, reconciled NAV exactly, and recorded
  zero browser errors.
- 2026-07-28: Endurance checkpoint 19's first attempt confirmed its USDG
  approval, then a lagging public-RPC replica estimated the immediately
  following brain purchase against the older allowance and returned
  `ERC20InsufficientAllowance` selector `0xfb8f41b2`. The immutable failure
  evidence records the exact revert; automatic restart then passed checkpoint
  19 and all subsequent checks. `apps/web/lib/approval-retry.ts` now retries
  only this approval-propagation error for up to sixty seconds, and both MDBS
  buys and brain-piece purchases use it after a confirmed approval. Unrelated
  contract failures still surface immediately. Seven wallet tests, focused
  Prettier, TypeScript, and the production build pass. Checkpoint 20 then
  funded a fresh wallet, approved and purchased piece 33, selected
  `Light Metals`, approved and bought 100 USDG of MDBS, sold 25% atomically,
  claimed rewards, reconciled NAV exactly, and recorded zero browser errors or
  allowance failures.

## Decisions

### 2026-07-26 - Newcomer-First Product Explanation

- Context: The complete product was understandable to returning users but required newcomers to infer how basket shares, brain pieces, hourly AI proposals, and contract execution fit together.
- Decision: Teach one four-step mental model before exposing details: Own, Steer, Propose, Verify. Use a compact fixed-position tour that presents one step at a time, never changes page layout, becomes a mobile bottom sheet, keeps its glossary collapsed by default, and remains reopenable from `How it works`. Preserve the one-sentence purpose statement on every primary screen.
- Files: `apps/web/components/editorial-dashboard.tsx`, `apps/web/components/brain-map.tsx`, `apps/web/app/globals.css`, `tests/uat.mjs`, `UX_SCREENS.md`, `PRD.md`.
- Commands/tests: Prettier, Next.js production build, full Chromium UAT, live desktop and 390-pixel mobile review, overflow bounds, and console inspection.
- Result: New visitors can understand ownership, steering, AI authority limits, and execution evidence without removing the advanced data or meme layer.
- Follow-up: Measure guide completion and screen transitions after analytics exists; do not add another primary navigation destination.

### 2026-07-26 - Character Roster V4 And Deterministic Brain Drama

- Context: The v3 cast was visually diverse but still too human-heavy and not memorable enough for a token-native meme universe.
- Decision: Keep economic catalog v3 immutable and version character presentation separately as roster v4. Use 10 diverse humans and 32 distinct nonhumans, deterministic rivalry-driven cycle recaps, entertainment-only fictional blame, client-side share cards, and X, Farcaster, and Telegram composer links. Never make a second model call for meme copy.
- Files: `apps/web/lib/brain-meme.ts`, `apps/web/lib/brain-catalog.ts`, `apps/web/lib/allocator.ts`, `apps/web/components/editorial-dashboard.tsx`, `apps/web/public/brain-art/v4/`, `tests/meme-recap.test.ts`, `tests/uat.mjs`.
- Commands/tests: `npm run test:meme`, `npm run format:check`, `npm run test:contracts`, Next.js production build, full Chromium UAT, live hourly cycle, and in-app-browser deep-link and console verification.
- Result: Every new cycle records an immutable factual cast recap and can produce a 1200-by-630 decision card while contracts, NFT IDs, presets, ownership, pricing, and basket economics remain unchanged.
- Follow-up: None for local devnet. Keep the satire disclaimer and never describe fictional blame as causal performance attribution.

### 2026-07-27 - Live NAV Pool Shares And Bounded Decision Context

- Context: MDBS needed to behave like a true proportional claim on a managed pool, while Ornith needed fresh structured evidence without accumulating old prompts or unbounded history.
- Decision: Value MDBS from fresh on-chain basket NAV divided by circulating supply. Deposits buy the current basket proportionally, redemptions liquidate the acting holder's proportional claim, and ordinary MDBS transfers never trade underlying assets. Build every model request statelessly from validated same-cycle data, at most 12 compact cycles, deterministic 32K-budget truncation, and a separately persisted exact input artifact.
- Files: `packages/contracts/src/BasketVault.sol`, `packages/contracts/src/MockValuationOracle.sol`, `apps/web/lib/decision-context.ts`, `apps/web/lib/market-sources.ts`, `apps/web/lib/allocator.ts`, `apps/web/lib/chain.ts`, `apps/web/components/editorial-dashboard.tsx`, `tests/decision-context.test.ts`, `tests/uat.mjs`.
- Commands/tests: Thirteen Foundry tests, 256-run fuzz test, focused decision-context tests, Prettier, Next.js production build, Chromium economic/autonomous UAT, live Ornith allocation, PostgreSQL artifact query, and LAN/public HTTP verification.
- Result: The live local-devnet proxy preserves all V1 state while exposing fixed-point NAV/share and previews. The UI displays live pool value and proportional entry/exit effects, and historical Decisions expose reproducible V2 hashes, sources, freshness, outcomes, and execution evidence.
- Follow-up: Configure a FRED API key when macro context is wanted; dependent brain inputs remain inactive until then. Do not activate real value until external release gates and dependency advisories are cleared.

### 2026-07-27 - Official Market Memory And DecisionContext V3

- Context: Current Robinhood quotes and SEC facts did not give Ornith stock price history, honest cost basis, cash-flow-adjusted returns, or benchmark-relative outcomes.
- Decision: Build history only from official observations collected after activation. Sample executable NVDA/AAPL and reference-only SPY/QQQ/SOXX every minute, retain aggregated candles, gate every feature by its own maturity threshold, and never let reference data grant execution permission. Use a weighted-average-cost activation mark for existing positions and keep legacy cycles immutable.
- Files: `apps/web/lib/market-history.ts`, `apps/web/lib/portfolio-accounting.ts`, `apps/web/lib/decision-context.ts`, `ops/mdb-market-collector.timer`, `packages/contracts/src/BasketVault.sol`.
- Commands/tests: Market/context unit tests, Foundry upgrade/event/invariant tests, production build, live collector, autonomous Ornith cycle, PostgreSQL queries, Chromium UAT, and public endpoint checks.
- Result: DecisionContext V3 supplies calculated features, coverage, tracked accounting, benchmarks, and outcomes without raw candles or prompt accumulation. Basket and Decisions expose the same evidence and explain immature metrics.
- Follow-up: Let official history mature naturally; do not backfill from unofficial providers. Configure FRED separately when desired.

### 2026-07-27 - Atomic-Only MDBS Sales

- Context: The legacy 1%-of-NAV immediate threshold sent larger MDBS sales into a keeper-settled queue, which could leave old sales pending.
- Decision: Every valid MDBS sale must proportionally liquidate underlying assets, burn shares, route the exit fee, and pay USDG in the same transaction or revert completely. Disable new queue requests and keeper processing, stop hourly queue processing, preserve storage and legacy cancellation for UUPS compatibility, and keep historical settlement hashes labelled as legacy evidence.
- Files: `packages/contracts/src/BasketVault.sol`, `packages/contracts/test/BasketBrain.t.sol`, `apps/web/lib/allocator.ts`, `apps/web/components/brain-dashboard.tsx`, `apps/web/components/editorial-dashboard.tsx`, `tests/uat.mjs`, `PRD.md`, `UX_SCREENS.md`.
- Commands/tests: Sixteen Foundry tests plus 256 fuzz runs, including a large atomic exit, forced execution failure with full state preservation, and disabled queue entry points; Prettier, Next.js production build, live UUPS upgrade, full Chromium UAT, and in-app-browser inspection.
- Result: The active implementation has no path that creates or processes queued sales. Live upgrade transaction `0xaabb1430a26488e22473497b4709cad695078ccb6170751463748b5d31d19c37` preserved NAV, supply, NAV/share, roles, holdings, and the empty queue state. A 50% live browser sale completed atomically, and the following autonomous cycle had no redemption settlement transaction.
- Follow-up: None for local devnet. Production still requires live-asset liquidity, oracle, legal, and audit gates.

### 2026-07-27 - User-Facing MDBS Buy And Sell Language

- Context: Deposit, mint, redeem, and burn accurately described the contracts but made the Basket feel like infrastructure instead of a token users can buy and sell.
- Decision: Primary wallet language is `Buy MDBS`, `Sell MDBS`, and `Claim rewards`. The buy preview leads with MDBS received; the sell preview leads with USDG received and atomic settlement status. Technical deposit/redemption names remain unchanged in contracts, APIs, accounting schemas, and audit evidence.
- Files: `apps/web/components/editorial-dashboard.tsx`, `apps/web/components/brain-dashboard.tsx`, `apps/web/app/globals.css`, `tests/uat.mjs`, `PRD.md`, `UX_SCREENS.md`.
- Commands/tests: Prettier, Next.js production build, live desktop in-app-browser review, safe scroll-target check, page-level overflow check, and full Chromium economic/autonomous-cycle UAT.
- Result: The Basket now reads as a familiar token purchase/sale flow without hiding the proportional pool mechanics.
- Follow-up: None for the local devnet.

### 2026-07-27 - Launchpad Trade Panel And Brain Finance Separation

- Context: The numbered Buy, Sell, and Claim rail still mixed two products and exposed too much quote detail. The user wanted a pump.fun-style trading interaction while keeping the editorial MillionDollar Brain visual system.
- Decision: Basket contains one Buy/Sell segmented trade panel. Buy supports custom USDG plus 100, 500, 1,000, and Max presets. Sell supports custom MDBS plus 25%, 50%, 75%, and Max presets. The compact quote shows only approximate proceeds by default; fees, minimums, timing, and proportional assets are collapsed. Brain ownership count, claimable rewards, fee explanation, and claim action live only beneath the selected-piece inspector.
- Files: `apps/web/lib/chain.ts`, `apps/web/app/api/status/route.ts`, `apps/web/components/brain-dashboard.tsx`, `apps/web/components/editorial-dashboard.tsx`, `apps/web/app/globals.css`, `tests/uat.mjs`, `PRD.md`, `UX_SCREENS.md`.
- Commands/tests: Prettier, Next.js production build, live Buy/Sell tab and preset review, exact dynamic sell preview check, expanded quote check, Brain finance placement check, page-level overflow check, and full Chromium economic/autonomous-cycle UAT.
- Result: The live VM exposes wallet USDG, dynamically previews the exact selected sell amount, keeps details collapsed by default, and cleanly separates basket trading from brain revenue. Buy, sell, claim, queue settlement, responsive, history, autonomous-cycle, and dark-mode flows pass.
- Follow-up: None for the local devnet.

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

### 2026-07-26 - Anatomical Brain Silhouette

- Context: The rounded global mask and stretched raster background made the 42-piece mosaic read as a blob rather than a convincing brain.
- Decision: Make the SVG presentation manifest the anatomical source of truth. Trace one continuous outer contour from the convincing anatomical source and tessellate all 42 cells inside it. Keep 34 cerebrum, 6 cerebellum, and 2 brainstem labels as placement metadata only, with no separate region outlines. Retire the raster brain background.
- Files: `apps/web/lib/brain-presentation.ts`, `apps/web/components/brain-map.tsx`, `apps/web/app/globals.css`, `tests/uat.mjs`, `PRD.md`, `DESIGN_SYSTEM.md`, `BUILD_READINESS.md`, `design/brain-art/README.md`.
- Commands/tests: Prettier, Next.js production build, clean-state Chromium UAT, live Ornith cycle, light/dark/mobile screenshot review.
- Result: The mosaic has a recognizable continuous lateral brain profile without changing NFT identities, contracts, APIs, wallet behavior, or economics.
- Follow-up: None for local release; retain the single shared outer mask if portrait transforms are adjusted later.

### 2026-07-26 - Interactive Crew Highlighting

- Context: Crew names below Characters mode were static labels even though users naturally expected them to explain which portraits belong together.
- Decision: Convert all four crew labels into toggle buttons. The active crew uses full-color portraits, stronger boundaries, and a subtle fill while non-members are muted. Preserve the selected piece and all economic behavior.
- Files: `apps/web/components/brain-map.tsx`, `apps/web/app/globals.css`, `tests/uat.mjs`, `DESIGN_SYSTEM.md`, `PRD.md`.
- Commands/tests: Prettier, Next.js production build, clean-state Chromium UAT, Market Mystics 12-member assertion, toggle-clear assertion.
- Result: Executive Dysfunction, Market Mystics, Sector Weirdos, and Decision Goblins can each be isolated directly from the legend with accessible pressed-state feedback.
- Follow-up: None.

### 2026-07-26 - Scattered Crew Placement

- Context: Canonical ID order placed the four character crews into obvious horizontal layers even after the crew legend became interactive.
- Decision: Separate immutable piece identity from visual slot order with a fixed 42-ID permutation in `brain-presentation.ts`. Scatter every crew across upper, middle, lower, left, and right areas of the shared silhouette.
- Files: `apps/web/lib/brain-presentation.ts`, `apps/web/components/brain-map.tsx`, `tests/uat.mjs`, `DESIGN_SYSTEM.md`, `PRD.md`.
- Commands/tests: Next.js production build, screenshot review, clean-state Chromium UAT, canonical crew-count assertions, horizontal and vertical dispersion assertions.
- Result: All crews are interleaved across the brain while canonical NFT IDs, portraits, affinities, presets, ownership, prices, contracts, APIs, and economics remain unchanged.
- Follow-up: Preserve `SCATTERED_PIECE_IDS` as presentation-only metadata when future visual slots are adjusted.

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

### 2026-07-26 - Diverse Character Roster

- Context: The v2 humans frequently read as the same narrow-faced white man in different clothing, weakening the collectible identity of the 42-piece brain.
- Decision: Regenerate 33 human pieces as visibly distinct people while locking the engraved editorial screen-print style, framing, palette, transparency, and catalog mappings. Retain nine already-distinct beasts and characters.
- Files: `apps/web/public/brain-art/v3/`, `apps/web/components/brain-map.tsx`, `apps/web/components/editorial-dashboard.tsx`, `design/brain-art/`, `tests/uat.mjs`.
- Commands/tests: ImageGen, chroma-key helper, 384-by-384 alpha validation, Prettier, Next.js production build, full Chromium UAT, live light/dark browser review.
- Result: The live brain has a balanced range of ages, sex and gender presentations, races and ethnicities, face shapes, body types, hairstyles, silhouettes, and props without changing any economics or interaction behavior.
- Follow-up: None.

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
- 2026-07-26: Converted all 42 brain pieces to ERC-721 `MDBP` tokens. Unsold NFTs are held by the marketplace contract, and public ERC-721 transfers revert so ownership cannot bypass the always-for-sale 120% pricing and reward path. Corrected basket entry/redemption fee routing to 50% brain owners, 40% creator vault, and 10% automation wallet, including the no-owner creator fallback. Foundry and Chromium UAT passed after a fresh local redeployment.
- 2026-07-26: Added the upgradeable `CreatorVault`, corrected weighted brain-owner reward checkpointing and claims, and exposed claimable USDG in the UI. Foundry verified exact fee arithmetic and Chromium completed deposit, ownership, preset, accrual, and claim.
- 2026-07-26: Generated and integrated the final Brain art system: one transparent engraved editorial brain plus 42 transparent character portraits mapped in catalog order. The map retains 42 keyboard-operable SVG paths, clips each portrait to its irregular piece, removes map numbers/glyphs, and reuses the selected portrait in the piece ledger. The served WebP set is approximately 2 MB. The generation direction and roster preview are in `design/brain-art/README.md`.
- 2026-07-26: Implemented cancellable FIFO queued redemptions. Large exits escrow MDBS and settle progressively at no more than 5% of NAV per keeper cycle while preserving the 20% USDG reserve; immediate exits are limited to 1% of NAV. Added 10 USDG redemption minimum, request deadlines, 100,000 USDG TVL cap, and 25,000 USDG wallet cap.
- 2026-07-26: Secured `/api/cycle` with a local-devnet keeper token, verified unauthenticated calls return HTTP 401, and verified authenticated fallback and live Ornith allocations execute on-chain. Browser UAT observes a real queued-redemption settlement transaction before cancellation. Native Anvil, deploy, web, and hourly timer units are enabled and active.
- 2026-07-26: Rebooted the project VM and verified Anvil, deployment, web, and timer services recovered automatically. Post-boot Chromium UAT passed the complete flow; two live Ornith cycles executed, and the second included a non-null queued-redemption settlement transaction before rebalancing. Foundry has 5 passing tests, the Next.js production build is clean, Prettier passes, Git integrity passes, and GitHub `main` is clean at `1a3b2a1`.
- 2026-07-26: Replaced the settings-like three-option brain with catalog v3. All 42 ERC-721 pieces now have a unique character name, glyph, crew, tagline, lore, and five closed moods mapped to signed -2/-1/0/+1/+2 effects. Added crew filters, full light/dark collectible cards, and cycle explanations naming the character and mood. Foundry, production build, and Chromium UAT pass; live Ornith records include `The Number-Go-Up Department`, `Moon With Seatbelts`, intensity 2, and the resulting on-chain allocation.
- 2026-07-26: Fixed a visual implementation defect where the live app had replaced the normative brain with a long card grid. Added `brain-map.tsx` with exactly 42 keyboard-operable SVG paths, `editorial-dashboard.tsx` with Brain, Basket, and Decisions views, Brain Pulse, selected-character five-mood ledger, basket snapshot, and explicit Brain requested / Ornith proposed / Protocol executed stages. Chromium UAT counts all 42 SVG segments and completes the full economic flow in both themes; visual screenshots were compared against all three accepted editorial screen directions.
- 2026-07-26: Rebuilt the Brain screen around 42 individually generated v2 engraved character portraits and a separate presentation manifest. Non-overlapping rounded Voronoi-like segments preserve the recognizable brain silhouette while Characters, Ownership, Influence, and Mood views expose different readings. Added a compact Brain Pulse strip, complete right-rail inspector, tooltip preview, roving directional keys, Home/End, 1x through 2.5x native-scroll zoom, and a searchable mobile List view. Removed the superseded v1 portraits only after v2 references and assets passed UAT. Production build, Prettier, 5 Foundry tests, transparent 384x384 asset checks, economic Chromium UAT, a live Ornith cycle, light/dark screenshots, mobile overflow, and raw-unit price regressions all pass.
- 2026-07-26: Temporarily aligned and clipped the generated raster brain to the original mosaic mask. This fit-only approach was superseded the same day by the authored three-region anatomical SVG because the original global mask still read as a blob.
- 2026-07-12: Reset stale project-specific memory while retaining the durable memory-management logic.
- 2026-07-23: Produced the initial MillionDollar Brain product brief without building or deploying anything.

### 2026-07-27 - Live local valuation and user-facing performance

- Context: Basket showed raw reference-history diagnostics and MDBS stayed near
  $1 because local oracle/router prices were fixed deployment mocks.
- Decision: Keep benchmark coverage inside Decisions and show price history,
  time-weighted returns, P&L, and separate user flows on Basket.
- Files: `apps/web/lib/market-price-sync.ts`,
  `apps/web/lib/portfolio-accounting.ts`,
  `apps/web/components/editorial-dashboard.tsx`,
  `apps/web/app/api/collect-market/route.ts`.
- Commands/tests: `npm run test:market-data`; `npm --workspace apps/web run
build`; authenticated live `/api/collect-market`.
- Result: AAPL, NVDA, and ETHX were synchronized from Robinhood/Coinbase into
  both local mock valuation and execution contracts. MDBS supply remained
  `26667033990218702090051`, NAV/share moved from
  `999999999999999998` to `996709512611462297`, and tracked unrealized P&L
  became `-87747539034520851976` WAD. Last verified 2026-07-27.
- Follow-up: Production still requires approved Robinhood Chain valuation and
  execution adapters; the official-feed contract sync is chain-31337-only.

## Open Follow-ups

- 2026-07-28: MDB testnet uses only the official public RPC. Public rate limits
  are mitigated by Multicall3 batching, bounded retries, and reduced polling.
  The LAN endpoint at `192.168.50.117` has become mainnet and is prohibited for
  this testnet application; do not modify or depend on it.
- 2026-07-27: Real-wallet support now uses pinned RainbowKit, wagmi, TanStack
  Query, viem, and MDB Reown project ID
  `5a4c41c8c461ca59724069d740760a2f`. External wallets take precedence over a
  session-scoped disposable test wallet. Mainnet policy disables built-in
  wallets and faucets. The MDB-specific encrypted testnet signer public address
  is `0x4365543D9e895bb48835CEcedf0903E8770A3A63`; its secret material is stored
  outside the repository. Testnet systemd units, database, state, and deployment
  manifest are active and separate from local.
- 2026-07-27: The public chain-46630 deployment is mock-only and valueless.
  Testnet services are active. A further public deployment or any real-value
  activation requires a new explicit authorization.
- 2026-07-27: Final local Chromium UAT passed the full economic, autonomous,
  responsive, and dark-mode flow. In-app Browser UAT verified the session-only
  disposable wallet, EIP-6963/RainbowKit wallet list, WalletConnect QR,
  launchpad-style Buy/Sell controls, and live portfolio performance. The live
  QR test found an incompatibility between `cuer@0.0.3` and `qr@0.6.0`;
  `package.json` now overrides that nested dependency to `qr@0.5.5`, and the QR
  rendered successfully after rebuild.
- Configure a free FRED API key when macro observations are desired. Until configured, macro availability remains false and dependent brain effects correctly become inactive.
- After wallet integration, `npm audit` reports 27 advisories: 22 moderate, 5
  high, and 0 critical. The high findings include axios through Coinbase CDP,
  Next.js dependencies `postcss` and `sharp`, and ws in the wagmi/viem graph;
  npm's aggregate fix requires breaking framework changes. Do not treat the
  public demo tunnel or rehearsal as production. Re-audit and remediate or
  explicitly accept each finding before a real-value release.
- Obtain qualified legal analysis before accepting funds or publicly offering a basket-backed token.
- Supply production signer addresses, funded balances, provider credentials, domain, notification targets, and backup account.
- Generate and verify the release-candidate asset, oracle, venue, and contract manifests from then-current canonical sources.
- Complete independent audit and remediate all critical and high-severity findings before real-value activation.

## Do Not Forget

- Read `AGENTS.md` and `MEMORY.md` before making future changes in this workspace.
- Update `MEMORY.md` after durable discoveries, decisions, fixes, verification results, blocked work, and handoffs.
- Never store secrets, tokens, passwords, private keys, or sensitive personal data in `MEMORY.md`.
- Local and the current mock Robinhood Testnet deployment are authorized. Do
  not perform another public deployment or activate real funds without explicit
  authorization and all release gates.
- The AI may propose allocations, but deterministic code must constrain and execute them.
- Never allow the agent to trade arbitrary discovered contracts.
- All protocol contracts are upgradeable.
- The MVP Creator DAO Vault is creator-controlled and may withdraw creator-side revenue only, not basket principal or brain-owner liabilities through its normal withdrawal interface.

## Archive

- No archived entries yet.
