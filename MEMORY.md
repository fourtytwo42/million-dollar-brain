# Project Memory

Durable project context lives here. Update this file whenever information should survive chat context compression or future agent handoff.

## Active Handoff

- Current task: Complete the active two-hour Control Catalog v1 Robinhood
  Testnet acceptance run and publish its final evidence.
- Last meaningful change: Checkpoint 5 exposed a test-harness funding defect
  after repeated 20% brain-piece resales exceeded the actor's fixed USDG
  top-up. The protocol reverted atomically as designed. The acceptance route
  now funds the exact purchase plus basket-buy requirement and a bounded
  buffer; the same checkpoint passed on retry.
- Next step: Deploy the repaired test harness, run the failed scenario as a
  focused check, resume the preserved acceptance clock, then complete final
  browser UAT and release evidence.
- Blockers: Mainnet activation still requires paid redundant RPCs, canonical
  Chainlink mappings, production 0x credentials, final roles/Safe addresses,
  funded gas, an audit, legal approval, and 48 continuous qualification hours
  with two regular sessions for every launch stock or ETF.

## Current State

- 42 Braincells is a proposed Robinhood Chain product combining a basket-backed share, a 42-piece community-controlled AI context, scheduled portfolio proposals, deterministic risk controls, and fee-funded creator/brain rewards.
- The authoritative VM repository contains a working local Anvil release with upgradeable contracts, a Next.js application, session-scoped disposable and external wallet support, a five-minute eligibility scheduler, Ornith allocator, systemd services, and Playwright Chromium UAT.
- A parallel valueless mock deployment is live on Robinhood Testnet chain
  `46630`. The testnet app runs on port `3001` while local Anvil remains on
  `3000`; their databases, state, manifests, timers, and wallet sessions are
  isolated.
- Last verified 2026-07-28: the public testnet is available at
  `https://testnet.42braincells.com`. The apex
  `https://42braincells.com` is a separate static mainnet Coming Soon page
  served on VM loopback port `3002`. Both are routed through the named
  `42braincells.com` Cloudflare Tunnel with a fail-closed HTTP 404 catch-all.
- Last verified 2026-07-28: the fresh schema-V3 public testnet deployment has
  12 clearly labelled production-interface replicas, an upgradeable dynamic
  registry, signed EIP-712 RFQ execution, and atomic pool entry/exit. The V3
  basket is `0xf10007004eF0d006bBaF6E3A9C92432dBeE7De5B`; its atomic price
  publisher is `0x7FB986BDcFC23bF419af83BE4bFE4efDBff7407d`.
- `packages/contracts/deployments/testnet-v3.json` is the active, committed
  public-testnet manifest. Last verified 2026-07-28:
  `192.168.50.117:8547` is again a chain-46630 testnet RPC and is approved as
  MDB's server-side primary. Browser wallets must never receive that LAN URL.
- Local devnet visibly exposes its disposable wallet and funding controls.
  Robinhood Testnet hides those controls while retaining the same internal
  session-wallet and `/api/faucet` test hooks for authorized automation.
- The 42-piece visual brain uses one continuous traced lateral silhouette. Semantic placement metadata labels 34 cerebrum pieces, 6 cerebellum pieces, and 2 brainstem pieces while preserving every canonical NFT ID and all economic mappings.

### 2026-07-29 - Dynamic acceptance-actor funding

- Context: Robinhood Testnet acceptance checkpoint 5 initially failed when
  Piece 2's repeated 20% resale price reached 15,603 USDG while the actor
  funding helper only maintained a fixed 5,000 USDG floor.
- Decision: Keep testing high-price resales. Fund each actor to the exact brain
  purchase price plus its selected MDBS buy and a 1,000 USDG buffer instead of
  using a fixed 10,000 USDG top-up. An endurance repair commit must be
  explicitly recorded in `state.json`; repair downtime extends `endAt` and is
  excluded from the final active-duration calculation.
- Files: `apps/web/app/api/testnet-acceptance/route.ts`,
  `tests/endurance-testnet.mjs`, `tests/network-policy.test.ts`.
- Commands/tests: `node --test tests/network-policy.test.ts` (15/15);
  production Next.js build passed.
- Result: The contract's atomic revert was correct; checkpoint 5 passed on the
  runner's retry. The harness fix prevents the same funding race from
  recurring as resale prices continue rising.
- Follow-up: Record the final repair SHA in the preserved run state, resume the
  two-hour acceptance run, and complete final browser/release evidence.
- The current `/brain-art/v4/` meme-universe roster contains 10 diverse humans and 32 nonhumans with distinct species or silhouettes. It remains 42 transparent 384-by-384 WebPs totaling about 1.58 MB; v3 remains archived and runtime references moved atomically to v4.
- Economic catalog v3 remains unchanged. Character roster v4 adds presentation copy, character kinds, visual archetypes, rivalries, five preset catchphrases, victory/objection/blame/fallback lines, and sharing hooks.
- Last verified 2026-07-29: Control Catalog v1 is deployed and enabled on
  devnet. The new UUPS `BrainControlRegistry`, appended stable asset IDs and
  tags, upgraded marketplace gate, all 42 migrated bundles, DecisionContext V5
  compiler, cadence eligibility scheduler, preview API, and data-driven
  control editor are live. Catalog v3 remains stored for history and emergency
  rollback. Testnet remains on catalog v3 until devnet acceptance is complete.
- Every new allocation persists one deterministic `memeRecap` in `cycles.jsonl` using the recorded brain snapshot and actual target allocation. No additional model call is made, and legacy cycles remain readable without invented dialogue.
- `PRD.md` v1.2 plus its linked normative specifications is the authoritative
  requirements set. `BRAIN_CONTROL_CATALOG.md` is normative for the target
  control system; `BRAIN_PRESET_CATALOG.md` is normative for deployed
  catalog-v3 behavior and migration.
- `PRODUCT_BRIEF.md` is superseded historical context.
- No product decision remains open for Control Catalog v1. Its coordinated
  implementation and acceptance remain open. `BUILD_READINESS.md`
  distinguishes locked engineering defaults from deployed state and external
  production gates.
- Devnet, testnet, and mainnet have normalized isolated manifests, state
  directories, databases, services, and timers. Promotion records the exact
  pushed Git SHA, full web-build hash, contract bytecode hashes, manifest hash,
  schema version, and source acceptance. Mainnet first deploys with all
  value-changing controls paused and remains LAN-only until staged activation.
- Last verified 2026-07-29: devnet uses `local-v3.json`, `var/devnet`, and
  `milliondollarbrain_devnet`; testnet uses `testnet-v3.json`,
  `var/testnet-v3`, and `milliondollarbrain_testnet`; mainnet has reserved
  `mainnet-v3.json`, `var/mainnet`, and `milliondollarbrain_mainnet`. Explicit
  devnet/testnet web, cycle, and collector units are active. Mainnet units are
  installed but disabled, and no mainnet deployment or broadcast occurred.

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
- `cloudflared` 2026.7.3 is installed from Cloudflare's official amd64 package.
  `mdb-cloudflared.service` runs the remotely managed named
  `42braincells.com` tunnel using an owner-restricted token file outside Git.
  Cloudflare routes the apex to `http://localhost:3002`, the testnet hostname
  to `http://localhost:3001`, and unmatched hostnames to `http_status:404`.
  `mdb-coming-soon.service` serves the apex page and both units are enabled at
  boot. Last verified 2026-07-28.
- Robinhood Testnet browser wallets use the official public RPC
  `https://rpc.testnet.chain.robinhood.com`. Server processes use loopback
  `127.0.0.1:18548`, backed by LAN primary `192.168.50.117:8547` and a
  configured remote HTTPS secondary. `mdb-web-testnet.service` serves port `3001`;
  `mdb-market-collector-testnet.timer` and `mdb-cycle-testnet.timer` are
  enabled. Last verified 2026-07-28.

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
- Target portfolio review uses a five-minute eligibility worker and a compiled
  base cadence of 15m, 30m, 1h, 4h, 6h, or 24h. Adaptive panic cadence,
  minimum trade cooldown, drift, one-cycle concurrency, no-backlog behavior,
  and hard-rule precedence are defined in `BRAIN_CONTROL_CATALOG.md`. Devnet
  uses this eligibility scheduler; testnet follows after exact-commit promotion.
- Deposits, redemptions, brain purchases, setting changes, claims, and governance remain available on-chain at any time. Each user pays only their own action gas and does not trigger the AI cycle.
- Scheduled proposals use a brain-state snapshot. Brain changes after that snapshot affect the next cycle, while execution always rechecks current holdings, prices, liquidity, risk limits, and slippage.
- Every brain piece has an immutable affinity and weight. Control Catalog v1
  gives it a bespoke closed bundle of choices, toggles, fixed steps,
  registry-scoped asset picks, thresholds, reaction matrices, attention
  budgets, or constrained rule cards. Owners cannot submit text, arbitrary
  contracts, prompts, URLs, or data sources to the allocator. Profile
  customization remains presentation-only.
- The target AI is a constrained scheduled allocator. Each cycle receives the
  entire canonical brain and compiled controls, approved asset universe and
  statistics, current basket and performance state, previous decisions,
  mandatory safety/accounting data, and operating limits, then returns
  schema-validated target weights until the next eligible review.
- The model may run through OpenRouter or the user's local appliance behind one provider adapter. Provider, exact model, configuration, prompt version, input hash, and output hash must be recorded for every cycle.
- Invalid, stale, late, unavailable, or unsafe model results fail closed and keep the current portfolio. Models never receive keys or direct execution authority.
- Every protocol smart contract is UUPS-upgradeable behind ERC-1967. Local and early testnet may use development EOAs; before real value, high-impact roles move to a 2-of-3 EIP-1271-compatible multisig and normal upgrades use a 48-hour timelock. Emergency pause cannot install code.
- The MVP DAO is a simple creator-controlled upgradeable revenue vault. The owner may withdraw creator-side revenue, but basket principal and brain-owner liabilities must remain outside its normal withdrawal authority.

## Verification Ledger

### 2026-07-29 - Control Catalog v1 PRD Consolidation

- Context: The single `-2` through `+2` choice per braincell was too narrow.
  Owners need multiple fun but understandable bounded levers, including direct
  qualified-asset preferences, cadence, timeframes, evidence attention, and
  structured research without prompt-injection surfaces.
- Decision: Adopt 42 bespoke closed multi-control panels. Use meme labels plus
  plain-English effects, one atomic bundle transaction per piece, a five-minute
  scheduler eligibility worker, 15-minute through 24-hour bounded cadence,
  mandatory always-on safety/accounting data, and deterministic compiler
  precedence. Preserve catalog v3 as deployed behavior and migration source.
- Files: `BRAIN_CONTROL_CATALOG.md`, `PRD.md`, `BRAIN_SCHEMA.md`,
  `AI_DATA_POLICY.md`, `AI_EXPLAINABILITY.md`, `UX_SCREENS.md`,
  `BUILD_READINESS.md`, `README.md`, `BRAIN_PRESET_CATALOG.md`, and
  `BRAIN_CHARACTERS.md`.
- Commands/tests: Prettier passed all ten edited/new documents; all local
  Markdown links resolve; the catalog contains exactly IDs 1 through 42;
  stale target terminology checks passed; `git diff --check` passed.
- Result: Product and migration requirements are build-ready. No contract,
  compiler, scheduler, UI, or live runtime behavior changed.
- Follow-up: Implement and test the registry bundle upgrade, catalog-v3
  reinitializer, deterministic compiler, cadence worker, control editor,
  context/replay changes, and coordinated testnet migration before runtime
  cutover.

### 2026-07-28 - Animated Braincell Profiles and Optional Links

- Context: Owner-uploaded GIFs were being flattened to a static WebP, the
  selected-piece inspector was awkwardly arranged, and owners needed one
  optional link shown with their braincell.
- Decision: Include the name, exact media hash, and optional HTTPS link in the
  same one-change-per-ownership transaction. Preserve GIF and animated WebP
  bytes up to 4 MiB; continue normalizing static PNG/JPEG/WebP uploads to a
  384-by-384 WebP. Links are presentation-only, capped at 200 printable ASCII
  bytes, never enter AI context, and may be independently cleared by the admin
  without restoring the owner's allowance.
- Files: `packages/contracts/src/BrainMarketplace.sol`,
  `apps/web/lib/portrait.ts`,
  `apps/web/app/api/brain-image/[pieceId]/route.ts`,
  `apps/web/components/editorial-dashboard.tsx`,
  `apps/web/components/brain-map.tsx`,
  `scripts/moderate-brain-profile-url.sh`, `PRD.md`, `BRAIN_SCHEMA.md`, and
  `DESIGN_SYSTEM.md`.
- Commands/tests: Focused portrait tests 3/3; profile-name/link tests 3/3;
  Foundry tests 29/29; Next.js production build passed; changed files pass
  Prettier, `forge fmt --check`, `bash -n`, and `git diff --check`.
- Result: Commit `1ce7b45` is pushed. Devnet proxy upgrade transaction
  `0xb1a37ebaffc8dbe4756d8e82135063141db29f49b004f9071177e4f218a60079`
  and testnet proxy upgrade transaction
  `0xfa3f39966e2cc7199ac06dfd35b93e24d8b0f4f2a401f1edef63e082fb90e4dc`
  succeeded. Browser UAT purchased devnet piece 38 and committed the display
  name `Looping Gas Goblin`, a 12-frame GIF, and
  `https://42braincells.com/lab` in one transaction. The API serves the exact
  hash-keyed bytes as `image/gif` with `nosniff`; the map accessible label and
  inspector expose the link, the inspector omits the inactive-data chip, and
  the allowance is consumed. Mobile at 390 by 844 has no page-level horizontal
  overflow and the inspector has no internal scroll. Devnet and testnet
  browser logs contain zero warnings or errors.
- Follow-up: None. Both web services are active with HTTP 200; the completed
  endurance service remains inactive and disabled.

- 2026-07-28: At the user's request, stopped and disabled
  `mdb-endurance-testnet.service`, removed its armed state, verified no
  `tests/endurance-testnet.mjs` process or related unit remained, and marked
  the state `stopped_by_user`. The preserved partial run contains five
  successful checkpoints, zero failed attempts, and last completed checkpoint
  4 on exact commit `3e31943acadb83ff858414c62fef40e48a0beedd`.
- 2026-07-28: Verified the testnet RPC migration on VM `192.168.50.135`.
  `192.168.50.117:8547` and the remote endpoint both reported chain `46630`
  at zero measured lag. The gateway checks both every 15 seconds, switches
  immediately on hard failure or after two samples more than three blocks
  behind, and requires four recovery samples within one block before failback.
  An isolated live proof with an unreachable primary selected the secondary
  and served chain `46630`. Browser runtime configuration and the production
  static bundle contain neither the LAN URL nor the loopback gateway.
- 2026-07-28: Five failover tests pass, covering healthy primary operation,
  lag hysteresis and recovery, wrong-chain rejection, remote providers without
  `eth_syncing`, and no replay of ambiguous raw transactions. Fourteen network
  policy tests, eight graduation tests, shell syntax checks, the Next.js
  production build, `git diff --check`, and self-hosted runtime health pass.
  The collector completed through the gateway. Ornith produced an AI
  allocation and executed testnet transaction
  `0xafde7146289417190315d8b389bb69c80a7f3f983937d07381b49cd8bcd6c71c`
  in block `94782416`; the oracle remained fresh, NAV was positive, no queued
  sale existed, and the gateway stayed on the LAN primary with zero lag.
- 2026-07-29: Completed the live graduation migration and non-mainnet proxy
  upgrades on VM `192.168.50.135`. The migration archived and allowlisted-copy
  migrated devnet state, cloned the devnet database, preserved testnet state,
  and created the empty isolated mainnet database. Devnet and testnet Basket
  and Brain controls are configured and enabled; the testnet AssetRegistry now
  uses 48 qualification hours and two regular sessions. Both apps return HTTP
  200, NAV reconciles to priced holdings, oracle data is fresh, persistence is
  available, and queued redemptions remain zero.
- 2026-07-29: Reduced `BasketVault` from 25,420 bytes to 22,805 bytes by
  replacing revert strings with typed custom errors, preserving storage and
  behavior. All 27 Foundry tests passed, including 256 fuzz runs, UUPS
  preservation, canary staging, signed-plan execution, and atomic rollback.
  The chain-46630 production-interface replica rehearsal then passed without a
  public broadcast.
- 2026-07-29: A live testnet Ornith cycle returned an AI allocation and executed
  transaction
  `0xb483eac439a0e831f8e9f59726f597a6a6421622395166f2d3f26ec334694d6e`.
  The resulting target held 20% USDG and eight 10% risk positions. The exact
  post-cycle NAV reconciled, prices were fresh, and no sale queue existed.
- 2026-07-29: The complete devnet release gate passed: formatted contracts,
  27 Foundry tests, all market/context/network/wallet/graduation suites,
  production Next.js build, and full Chromium economic/autonomous/mobile/dark
  UAT. Release UAT screenshots now write to commit-scoped `var/release-uat`
  evidence so candidate generation retains a clean source tree. Direct Next.js
  systemd execution and bounded stop behavior reduced verified dual-web restart
  time to about five seconds and removed orphaned npm children.

- 2026-07-28: Published the 42 Braincells domain split through a named
  Cloudflare Tunnel. `https://42braincells.com` returns the branded mainnet
  Coming Soon page with a testnet CTA; `https://testnet.42braincells.com`
  returns the live 42 Braincells application. Public DNS A/AAAA records, TLS,
  HTTP 200 responses, Cloudflare routing, the fail-closed catch-all, local
  origin health, responsive testnet rendering, and browser console state were
  verified. `mdb-cloudflared`, `mdb-coming-soon`, `mdb-web-testnet`, and
  `mdb-web` are active; the tunnel has four QUIC connections and accepted the
  two-route remote configuration. The tunnel credential is stored only in
  `/etc/mdb/cloudflared-token` with `cloudflared:cloudflared` ownership and
  mode `0600`.
- 2026-07-28: Rebranded the product-facing web application from MillionDollar
  Brain to 42 Braincells. Updated the header, accessible home label, browser
  metadata, WalletConnect application metadata, local chain display name,
  Brain tagline, decision-card branding and filename, allocator identity,
  fallback dashboard, README, and PRD title/summary. Deployed MDBS/MDBP token
  symbols, contract identities, paths, databases, and service names remain
  unchanged. Branding and network-policy tests, TypeScript, Prettier,
  production build, desktop/mobile light/dark UAT, all three primary screens,
  and browser console checks pass.
- 2026-07-28: Fixed dynamically registered Basket assets rendering with an
  unresolved near-white chart color. The pie and legend now share ten explicit
  light/dark palette slots. Live testnet holds nine assets and browser
  inspection confirms nine unique slice colors, exact legend matches, no
  browser errors, and distinct brighter dark-mode equivalents. Portfolio
  display tests, TypeScript, Prettier, and the production build pass.
- 2026-07-28: Corrected the compact Brain layout after user review. The map and
  selected-piece inspector no longer have internal scrollbars; both expand to
  full content and the page scrolls naturally. Live 1366-by-768, 768-by-1024,
  and 390-by-844 measurements confirm neither panel is internally scrollable
  and no breakpoint has horizontal page overflow. Focused UI tests,
  TypeScript, production build, HTTP verification, and browser console checks
  pass.
- 2026-07-28: Removed redundant Data, Latest result, and Next cycle cells from
  Brain Pulse while retaining its headline and strongest preferences. Desktop
  Brain content now uses the available viewport with an internally scrolling
  inspector; a 1366-by-768 live test has no horizontal or vertical page
  overflow. Tablet keeps a side-by-side map and inspector at 1024 pixels,
  switches to Map/List below 901 pixels, and no longer overlaps its utility
  row. Mobile exposes NAV, theme, and wallet controls, uses a two-column preset
  selector, and has no horizontal overflow. Focused UI tests, TypeScript,
  Prettier, three production builds, live light/dark screenshots, and
  390-by-844, 768-by-1024, 1024-by-768, and 1366-by-768 browser UAT pass.
- 2026-07-28: Reproduced the MetaMask reconnect defect in the user's Chrome:
  the dedicated MetaMask SDK connector remained on `Opening MetaMask...` and
  created no extension request after disconnect, while the generic injected
  connector immediately opened MetaMask. Replaced the MetaMask connector with
  an injected EIP-1193 connector that retains MetaMask branding, made
  disconnect connector-specific, and corrected the testnet disconnect message.
  TypeScript, Prettier, two production builds, live HTTP checks, and Chrome
  connect/disconnect/reconnect UAT pass. The final MetaMask button is shown as
  installed and opens a fresh extension connection request.
- 2026-07-28: Started the approved mainnet-edge implementation. Added
  `AssetRegistry`, `ChainlinkValuationAdapter`, `ZeroExExecutionAdapter`, and
  `ParityAssetToken`. The registry enforces 30-day, $100M market-cap/AUM and
  $250K depth evidence; the execution adapter binds exact calldata to an
  EIP-712 authorizer, allowlisted target/spender/selector/token, replay
  protection, exact approvals, output minimums, and oracle deviation. Four new
  adversarial/qualification/oracle tests and all sixteen existing Foundry tests
  pass on the authoritative VM.
- 2026-07-28: Added BasketVault V3 storage and atomic `depositWithPlan`,
  `redeemWithPlan`, and `rebalanceWithPlan` entry points. Once V3 is configured,
  legacy router entry points fail closed; every required buy or sale must match
  an authorizer-bound execution intent, and an incomplete plan reverts the
  whole user or keeper transaction. Dynamic asset addition/removal, nine-risk-
  position, 20% per-asset, and 30% high-volatility caps are enforced through
  the registry. A full signed-plan deposit/redemption integration test and all
  existing contract tests pass: 21 total.
- 2026-07-28: Implemented the dynamic asset/data checkpoint. Added address-and-
  chain-based manifest normalization, official Robinhood mainnet discovery,
  30-day qualification persistence, a full compact eligible directory,
  deterministic top-64 detail, DecisionContext V4's 96K budget, and one
  official/on-chain-only research round for up to 16 registered assets. Added
  PostgreSQL schema v4 tables for qualification evidence, research, and
  non-broadcast shadow simulations. Ten focused universe/context tests, all
  existing market/network/wallet tests, TypeScript, and the Next.js production
  build pass on the VM.
- 2026-07-28: Completed fresh V3 public-testnet acceptance. V4 freshness now
  follows the active manifest rather than the legacy four-symbol compatibility
  context, and model-returned checksum addresses are canonicalized without
  permitting duplicate aliases or unknown contracts. Ornith evaluated all 12
  registered replicas and executed an eight-risk-position allocation of 20%
  USDG plus 10% each AAPL, NVDA, MSFT, AMZN, GOOGL, META, SPY, and WETH in
  transaction
  `0x5096932d5ec2bd626728dae2399c50e99b08b0329042d30e3d1f74440d69696a`.
  A subsequent acceptance run changed a brain preset, bought MDBS, sold MDBS
  atomically, and claimed rewards; all assertions passed with no queued sale,
  a fresh oracle, positive NAV/supply, and eight risk positions. Testnet
  collector and cycle timers are active at second 30 and every 15 minutes
  (`:02`, `:17`, `:32`, `:47`), respectively; local services remain active and
  separate. Eight asset-
  universe tests, five context tests, and the production build pass.
- 2026-07-28: Started the two-hour `mdb-endurance-testnet.service` against the
  fresh V3 deployment. Checkpoint 0 completed with preset, approval, buy,
  atomic sell, and claim transactions; NAV reconciled, the oracle was fresh,
  no queued sale existed, all six local/testnet services and timers were
  active, and Chromium reported no browser errors.
- 2026-07-28: Installed and enabled the hourly read-only
  `mdb-mainnet-shadow.timer`. It inspected 98 canonical chain-4663 assets in one
  Multicall3 batch; callable token code and every Robinhood UID matched. The
  runner rejects broadcast mode and signing keys and truthfully leaves
  qualification at zero until
  Chainlink-supplied feed mappings, production 0x credentials, official
  capitalization/AUM evidence, official-history coverage, $25K impact, and
  $250K two-sided depth pass for every nominated asset.
- 2026-07-28: Standardized visible USD-denominated NAV and oracle prices to exactly two decimal places. Replaced the four-decimal formatter and `$1.0000` fallback with the shared two-decimal USD formatter. Two portfolio-display tests, the Next.js production build, both live web-service restarts, and in-app-browser checks pass; the testnet header, Basket NAV card, performance chart label, and accessibility text all show `$1.00`.
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

### 2026-07-28 - Graduation Pipeline Implementation Checkpoint

- Context: Devnet, testnet, and mainnet needed an exact-artifact promotion path
  and mainnet needed a paused canary rather than direct activation.
- Decision: Use `local-v3.json`/`var/devnet`/`milliondollarbrain_devnet`,
  `testnet-v3.json`/`var/testnet-v3`/`milliondollarbrain_testnet`, and
  `mainnet-v3.json`/`var/mainnet`/`milliondollarbrain_mainnet`. Require 48
  continuous hourly asset checks and two regular US sessions for stocks/ETFs.
- Files: `config/networks.json`, `packages/contracts/src/BasketVault.sol`,
  `packages/contracts/src/BrainMarketplace.sol`,
  `packages/contracts/src/AssetRegistry.sol`, `scripts/check-release.sh`,
  `scripts/migrate-environment-isolation.sh`, and `infrastructure/systemd/`.
- Commands/tests: Eight graduation tests, eight dynamic-universe tests,
  thirteen network tests, the complete existing Node unit suites, Next
  production build, and 27 Foundry tests including 256 fuzz runs passed in an
  isolated VM worktree. Manual storage-layout inspection confirmed all old
  Basket, Brain, and Registry fields keep their existing slots.
- Result: Engineering code is ready for the live VM migration and proxy
  upgrades. No mainnet deployment or activation occurred.
- Follow-up: Push the checkpoint, migrate the live VM, upgrade both non-mainnet
  environments, rebuild, and produce fresh two-hour testnet evidence because
  contract and execution-facing code changed.

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

### 2026-07-28 - One Portrait Change Per Ownership

- Context: Brain-piece purchasers need a collectible presentation right without allowing arbitrary content to steer Ornith.
- Decision: Each completed purchase increments an on-chain ownership serial. The current owner may commit one nonzero portrait hash for that serial; a later 120% purchase grants the new owner one fresh change. The exact normalized 384-by-384 WebP is self-hosted only after its bytes match the committed keccak256 hash. Portrait data is never included in the AI prompt.
- Files: `packages/contracts/src/BrainMarketplace.sol`, `apps/web/app/api/brain-image/[pieceId]/route.ts`, `apps/web/lib/portrait.ts`, `apps/web/components/brain-dashboard.tsx`, `apps/web/components/editorial-dashboard.tsx`, `apps/web/components/brain-map.tsx`.
- Commands/tests: `npm run test:portrait` passed 2/2; `npm run test:contracts` passed 26/26; Next.js production build passed and includes the dynamic brain-image route. UUPS upgrades completed on chains 31337 and 46630.
- Result: Commit `f9aba60` is pushed. The local and testnet web apps, public testnet domain, cycle timers, and collectors are active. Live local-browser UAT funded a disposable wallet, bought piece 1, committed and uploaded a custom portrait, verified the map and 112-pixel inspector use the hash-keyed image, and rejected a second different portrait. The +2 mood is fully visible at 1920, 768, and 390 pixel widths with no page-level horizontal overflow. The only browser diagnostics were MetaMask extension warnings; no application console error was observed.
- Follow-up: None for the portrait feature. Mainnet activation will inherit the implementation through the release manifest and still requires the existing external gates.

### 2026-07-28 - Combined Braincell Profile and Portrait Moderation

- Context: Owners need to change a braincell's name and image through one clear
  interaction, while the creator needs a way to remove an inappropriate image.
- Decision: Replace separate portrait editing with one name-plus-image profile
  change per ownership serial. Store the bounded display name and image hash
  on-chain in one transaction. Keep the immutable catalog identity in all AI
  context. Permit only `DEFAULT_ADMIN_ROLE` to zero the portrait hash; this
  leaves the custom name, owner, serial, and consumed allowance unchanged.
- Files: `packages/contracts/src/BrainMarketplace.sol`,
  `apps/web/components/editorial-dashboard.tsx`,
  `apps/web/components/brain-dashboard.tsx`, `apps/web/lib/piece-name.ts`,
  `scripts/moderate-brain-portrait.sh`.
- Commands/tests: `npm run test:contracts` passed 28/28; profile-name tests
  passed 2/2; portrait tests passed 2/2; portfolio-display tests passed 6/6;
  Next.js production build, Prettier, Forge formatting, and storage-layout
  inspection passed.
- Result: Commit `4717e01` is pushed. UUPS upgrades completed on chains 31337
  and 46630. Devnet live UAT bought piece 42, opened the editor from the name,
  committed `The Alpha Buffet` plus its image in one transaction, showed the
  alias in the map and inspector, served the hash-keyed image, and disabled
  further customization. The admin moderation command reset the image to
  `/brain-art/v4/piece-42.webp` while preserving `The Alpha Buffet` and keeping
  the allowance consumed. The modal fits a 390-by-844 viewport without
  horizontal overflow and produced no application console errors. Both status
  endpoints return HTTP 200. Last verified 2026-07-28.
- Follow-up: None for this feature. Use
  `scripts/moderate-brain-portrait.sh <local|testnet> <piece-id>` for a narrowly
  scoped image reset. Mainnet inherits the implementation only through the
  normal promotion and canary gates.
- Operations note: `/etc/mdb/testnet.env` contained one invalid bare-value line
  that prevented direct upgrade scripts from sourcing the file. It was removed,
  the remaining entries were validated as assignments, and permissions were
  restored to `root:hendo420` mode `0640`. No secret value was copied into the
  repository. Last verified 2026-07-28.

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

### 2026-07-29 - Control Catalog v1 devnet implementation checkpoint

- Context: The five-mood interface had to be replaced by 42 bespoke, closed,
  multi-control panels without changing marketplace or basket economics.
- Decision: Use one generated catalog, packed versioned bundles in a dedicated
  UUPS registry, stable asset IDs/tags, deterministic compilation, and a
  five-minute eligibility scheduler that still honors owner-selected cadence.
- Files: `apps/web/lib/brain-controls.ts`,
  `apps/web/lib/compiled-brain.ts`,
  `packages/contracts/src/BrainControlRegistry.sol`,
  `packages/contracts/src/AssetRegistry.sol`,
  `packages/contracts/src/BrainMarketplace.sol`,
  `apps/web/components/editorial-dashboard.tsx`,
  `scripts/upgrade-brain-controls.sh`.
- Commands/tests: Foundry 34/34; brain-control tests 6/6; compiler tests 4/4;
  decision-context tests 5/5; Next.js production build.
- Result: Devnet migrated all 42 catalog-v3 selections to Control Catalog v1
  under catalog hash
  `0x1c5b19d5171ffeb7f1d56cb571f80a4659801bed9db6000d67dd0b575fc6b774`.
  Live Browser UAT purchased Piece 21 and committed an NVDA
  `exit / disable` directive in one transaction. Ownership and Bundle v2
  persisted. Last verified 2026-07-29.
- Follow-up: Prove the restriction in a live V5 Ornith cycle, finish responsive
  and economic devnet acceptance, then commit/push and promote that exact
  candidate to testnet.

## Open Follow-ups

- 2026-07-29: Finish the remaining Control Catalog v1 devnet acceptance and
  perform the exact-commit, state-preserving testnet UUPS promotion. Testnet
  remains on catalog v3 until the accepted candidate is pushed.
- 2026-07-29: The live migration, proxy upgrades, release rehearsal, devnet
  release gate, and one live testnet AI execution pass. A fresh exact-commit
  two-hour testnet acceptance run is still required before
  `promote-to-testnet` can produce the final testnet promotion receipt or any
  mainnet canary rehearsal may be treated as release evidence.
- 2026-07-28: MDB testnet now uses the server-only LAN-primary,
  remote-failover gateway. The browser remains on public HTTPS. The current
  remote endpoint is the official rate-limited public RPC because no separate
  paid testnet URL is stored on the VM; replace only `MDB_RPC_SECONDARY_URL`
  when the paid URL is supplied.
- 2026-07-27: Real-wallet support now uses pinned RainbowKit, wagmi, TanStack
  Query, viem, and MDB Reown project ID
  `5a4c41c8c461ca59724069d740760a2f`. External wallets take precedence over a
  session-scoped disposable test wallet. Mainnet policy disables built-in
  wallets and faucets. The MDB-specific encrypted testnet signer public address
  is `0x4365543D9e895bb48835CEcedf0903E8770A3A63`; its secret material is stored
  outside the repository. Testnet systemd units, database, state, and deployment
  manifest are active and separate from local.
- 2026-07-28: The public chain-46630 deployment is valueless and uses clearly
  labelled production-interface replicas published from official mainnet
  market data. Testnet services are active. It is not evidence of canonical
  Stock Token deployments on testnet, and a further public deployment or any
  real-value activation requires explicit authorization.
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

### 2026-07-28 - Mainnet-Edge Live UAT and Endurance Handoff

- Context: Completed the production-shaped registry, V3 atomic execution, DecisionContext V4, fresh Robinhood Testnet replica deployment, and read-only mainnet shadow checkpoint.
- Decision: Keep mainnet broadcasting disabled. Continue the fresh two-hour chain-46630 endurance run and require 30 consecutive qualifying mainnet-shadow days before engineering release approval.
- Files: `MAINNET_EDGE_RELEASE.md`, `scripts/mainnet-shadow.mjs`, `tests/endurance-testnet.mjs`, `apps/web/components/editorial-dashboard.tsx`, `apps/web/app/globals.css`, `tests/portfolio-display.test.ts`.
- Commands/tests: Foundry 24/24; DecisionContext 5/5; asset universe 8/8; market data 9/9; network policy 11/11; wallet 7/7; meme recap 5/5; portfolio display 3/3; Next.js production build passed. In-app browser UAT passed on testnet for Brain, Basket, Decisions, exact two-decimal USD values, production-interface replica labeling, dark mode, 375px mobile width with no horizontal overflow, and zero console errors.
- Result: Commits through `a7414f9` are pushed. The fresh endurance run started at `2026-07-28T17:53:24Z`; checkpoints 0 and 1 passed with buy, atomic sell, brain preset, claim, fresh prices, positive/reconciled NAV, no queued sale, and no browser errors. Restarting the web units at the presentation cutover restarted the coupled endurance worker, but preserved the same state, start time, and completion clock. Mainnet shadow validates all 98 official canonical identities read-only and records zero qualification days until required external evidence is configured.
- Follow-up: Let the two-hour run complete without resetting its state. Supply verified Chainlink feed mappings, a server-only 0x API key, approved capitalization/AUM and history evidence, redundant production RPCs, production roles, audit results, and the other external release inputs. Accumulate 30 uninterrupted qualification days. Do not broadcast mainnet.

### 2026-07-28 - Multi-user Production Rehearsal

- Context: The user requested real-use simulation rather than a narrow repeated happy path.
- Decision: Each 20-minute endurance checkpoint now uses three secret-derived testnet actors. It performs varied MDBS buys and atomic sells, initial brain purchases and 120% resales, rotating presets, reward claims, an oversized-sale rejection, and two concurrent authenticated requests while retaining the external-wallet-first public UI.
- Files: `apps/web/app/api/testnet-acceptance/route.ts`, `tests/endurance-testnet.mjs`, `tests/network-policy.test.ts`.
- Commands/tests: Network policy and production build must pass before the upgraded runner resumes. Browser checks cover 390px, 768px, and 1440px widths, both themes over alternating checkpoints, all three primary screens, 42 brain cells, decision history, console errors, and page-level overflow.
- Result: Actor keys are derived only from the server-side endurance secret and are never returned or stored. The endpoint returns public actor addresses and transaction evidence. Real WalletConnect approval remains a human-wallet certification step; protocol behavior uses real chain-46630 transactions.
- Follow-up: Completed and audited; retain the ledger as release evidence.

### 2026-07-28 - Accelerated Testnet AI Cadence

- Context: Active endurance testing needed more autonomous decisions and rebalances within the two-hour evidence window.
- Decision: Robinhood Testnet runs its AI cycle every 15 minutes at `:02`, `:17`, `:32`, and `:47`. Local devnet and the intended mainnet cadence remain hourly.
- Files: `apps/web/lib/network.ts`, `config/networks.json`, `apps/web/components/editorial-dashboard.tsx`, `infrastructure/systemd/mdb-cycle-testnet.timer`, `tests/network-policy.test.ts`.
- Commands/tests: Network policy test, production build, live systemd timer inspection, and a live testnet cycle.
- Result: The public runtime config and UI report the real network-specific cadence; invalid cadence values fail runtime validation. An immediate proof cycle completed at `2026-07-28T19:43:21.185Z` with source `ai` and executed transaction `0x6c180b72d40d370d0bfa3fd1601d8a28caaf8ef4c4eb9215801c41451a00515f`.
- Follow-up: Keep the accelerated cadence limited to testnet testing and restore 60 minutes if the test workload no longer needs it.

### 2026-07-28 - First Multi-user Rehearsal Findings

- Context: The first live multi-user run exposed a missing `transfer` entry in the shared browser/server ERC-20 ABI, then showed the endurance assertion incorrectly treated every deterministic AI fallback as an application failure.
- Decision: Added the standard ERC-20 transfer ABI. Endurance now accepts a documented deterministic hold only when a successful AI cycle also exists within the 95-minute freshness window; this preserves fail-closed model validation without disguising prolonged AI failure.
- Commands/tests: Scenario 9 completed an initial brain purchase, preset change, 250 USDG MDBS buy, 10% atomic sale, reward claim, and rejected oversized exit. Concurrent scenarios 10 and 11 completed 500/1000 USDG buys, 25%/50% atomic sales, an initial brain purchase, a 120% resale, preset changes, claims, and rejected oversized exits across three distinct addresses.
- Result: All real chain-46630 user transactions and invariants passed. The latest model response was rejected because its weights did not total 10,000; the protocol held safely. A previous successful Ornith allocation remained within the 95-minute operational window.
- Result: Corrected checkpoint 3 passed in 140 seconds with three distinct actors, one initial brain sale, two 120% resales, three MDBS buys, three atomic sells, three claims, three rejected oversized exits, mobile/tablet/desktop overflow checks, and zero browser errors.
- Follow-up: Completed; both original failures remain in the ledger as regression evidence.

### 2026-07-28 - Two-hour V3 Endurance Completed

- Context: The production-shaped Robinhood Testnet V3 deployment required a real-use rehearsal covering user actions, AI cycles, accounting, responsive UI, and recovery.
- Decision: Preserve the original evidence clock and both failed checkpoint-3 attempts. Those attempts identified a test-harness assertion that rejected a documented deterministic Hold despite a recent successful AI cycle; the harness fix was verified without hiding the failures or resetting the run.
- Commands/tests: `mdb-endurance-testnet.service`, `var/testnet-v3-endurance/state.json`, `var/testnet-v3-endurance/checkpoints.jsonl`, live status/NAV reconciliation, six service/timer checks, operator-gas check, and final in-app-browser Brain/Basket/Decisions UAT.
- Result: Seven checkpoints passed over the original two-hour clock. The ledger records 15 user scenarios, 15 buys, 15 atomic sells, 15 presets, 15 claims, 12 brain purchases (six initial and six 120% resales), 12 oversized-exit rejections, eight concurrent requests, 15 responsive checks, zero browser errors, fresh oracles, no queued sales, and exact NAV-to-holdings reconciliation. The latest audited Ornith cycle at `2026-07-28T19:48:21.235Z` executed transaction `0x2ea77ddf4fdbd26ee227fb3ea7be76dd1c9a95ce6c93d7f34cfe95ef4afecd77`. Final in-app-browser UAT found all three screens healthy, the 15-minute cadence visible, no horizontal overflow, and no console warnings or errors. Operator gas remained `0.00832928133 ETH`.
- Follow-up: The completed endurance service is disabled. Keep testnet web, collector, and 15-minute AI timers active; continue read-only mainnet-shadow qualification and external release-gate work.

### 2026-07-28 - V3 Signed Quote Plans and Dynamic Atomic Cycle

- Context: The fresh chain-46630 replica stack requires every user buy, user sell, and autonomous rebalance to use the same signed `SwapPlan[]` interface.
- Decision: Added a server-only EIP-712 quote planner and `/api/quote-plan`; V3 browser Buy/Sell calls `depositWithPlan` and `redeemWithPlan`, while legacy local devnet calls remain unchanged. Dynamic V4 cycles now validate any active registry asset, request at most one bounded research round, generate signed rebalance plans, and call `rebalanceWithPlan`.
- Files: `apps/web/lib/quote-planner.ts`, `apps/web/app/api/quote-plan/route.ts`, `apps/web/components/brain-dashboard.tsx`, `apps/web/lib/allocator.ts`, `apps/web/lib/abi.ts`, `packages/contracts/src/BasketVault.sol`, `packages/contracts/script/DeployTestnetV3.s.sol`.
- Commands/tests: `forge test --root packages/contracts` passed 21/21; web TypeScript passed; web production build passed and includes `/api/quote-plan`.
- Result: Plans bind the chain, vault, exact token pair/input, minimum output, recipient, venue/spender, calldata hash, expiry, block, and nonce. Basket valuation and trade sizing now respect token decimals rather than assuming every compatible ERC-20 has 18 decimals. The fresh replica qualification window is seven days, comfortably longer than the two-hour acceptance run; daily refresh remains required for durable operation.
- Follow-up: Complete official-price publishing for every replica, add strict deployment/cutover gates and mainnet shadow evidence, then deploy and UAT the fresh V3 testnet stack.

### 2026-07-28 - Canonical Mainnet Shadow and Reserve Decimal Correction

- Context: Read-only mainnet shadow validation found canonical Robinhood mainnet USDG uses 6 decimals while the existing dev/test USDG replicas use 18.
- Decision: Normalize reserve balances and flows to 18-decimal USD NAV inside `BasketVault`, while preserving raw reserve units for transfers, fees, 0x intents, and user proceeds. Added a six-decimal reserve regression test. The mainnet shadow is read-only, refuses signing keys/broadcast mode, and records canonical identities plus quote/configuration gates.
- Files: `packages/contracts/src/BasketVault.sol`, `packages/contracts/test/MainnetEdge.t.sol`, `packages/contracts/script/DeployMainnet.s.sol`, `scripts/mainnet-shadow.mjs`, `scripts/deploy-mainnet.sh`, `scripts/rehearse-mainnet-fork.sh`, `infrastructure/systemd/mdb-mainnet-shadow.*`, `apps/web/app/api/shadow-status/route.ts`.
- Commands/tests: The first shadow run on chain 4663 inspected 98 official canonical assets; runtime code and every Stock Token UID matched, and sampled `oraclePaused` values were false. `forge test --root packages/contracts` passed 22/22 including canonical six-decimal USDG-shaped NAV/share accounting.
- Result: USDG 6-decimal transfers now reconcile to 18-decimal NAV and MDBS shares; mainnet quote/execution plans preserve raw token units. Shadow gates truthfully remain false for absent 0x credentials, Chainlink feed mappings, and the required 30-day evidence.
- Follow-up: Publish and commit the dynamic market/shadow tooling, then broadcast the fresh production-interface replica deployment to chain 46630 and begin its two-hour acceptance clock.

### 2026-07-28 - Testnet Rehearsal and EIP-170 Gate

- Context: A no-broadcast rehearsal against Robinhood Testnet simulated the complete fresh V3 deployment.
- Decision: Set the production Foundry optimizer profile to one run and permanently reduce the already-disabled queue ABI to custom-error stubs. Non-interface risk constants became internal; no storage layout or active economics changed.
- Commands/tests: Public chain-46630 rehearsal estimated 72,477,317 gas and 0.001449546412477317 ETH. The first build found `BasketVault` at 25,151 runtime bytes; the corrected build is 24,309 bytes, 267 bytes below EIP-170. The operator had about 0.0129492027 test ETH before broadcast.
- Result: The hard code-size release gate is cleared. No V3 testnet transaction was broadcast during the rehearsal.
- Follow-up: Run all 22 contract tests, commit/push the exact optimizer and bytecode change, then broadcast the already-authorized fresh V3 deployment with `--slow` to tolerate public-RPC replica lag.
