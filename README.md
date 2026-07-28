# MillionDollar Brain

MillionDollar Brain is a proposed DeFi basket protocol for Robinhood Chain. Basket-share holders deposit and redeem against a managed portfolio, while owners of 42 always-for-sale brain-piece NFTs steer a constrained hourly AI allocation through closed, auditable presets.

## Current status

Usable local-devnet release running natively on the project VM. It includes upgradeable protocol contracts, disposable and external wallet support, the complete 42-piece ERC-721 brain, entry and redemption economics, brain-owner claims, a creator vault, atomic exits, an hourly keeper, and constrained Ornith allocation cycles.

The live application follows the normative editorial system: its Brain view uses character roster v4, a 10-human/32-nonhuman financial fever-dream bureaucracy inside curved SVG segments, crew and personal-ownership filters, a character-led Brain Pulse, and a complete selected-piece inspector. Basket provides the portfolio ledger and user actions. Decisions shows the Brain requested, Ornith proposed, and Protocol executed chain plus deterministic Brain Drama, historical character statistics, downloadable recap cards, and prefilled social sharing.

The local application remains a simulation. A separate V3 deployment is live
on Robinhood Testnet with 12 clearly labelled production-interface replicas,
dynamic registry identities, official-data price publishing, signed RFQ
execution, atomic MDBS buys and sells, and autonomous DecisionContext V4 Ornith
cycles. A read-only mainnet shadow inspects canonical chain-4663 assets and
cannot sign or broadcast. No mainnet contracts or real funds are enabled. See
[TESTNET_READINESS.md](TESTNET_READINESS.md) and
[MAINNET_EDGE_RELEASE.md](MAINNET_EDGE_RELEASE.md).

## Local release

- Application: `http://192.168.50.135:3000`
- Chain: Anvil chain ID `31337`
- Runtime: native `systemd`, Node.js 24, Foundry, and Chromium UAT; no Docker
- Verification: `npm run test:contracts`, web production build, `npm run format:check`, and `npm run test:uat`
- Source: private GitHub repository `fourtytwo42/million-dollar-brain`

## Specifications

- [Product Requirements](PRD.md)
- [Screen Map](UX_SCREENS.md)
- [Brain Schema](BRAIN_SCHEMA.md)
- [Brain Preset Catalog](BRAIN_PRESET_CATALOG.md)
- [Brain Characters and Moods](BRAIN_CHARACTERS.md)
- [AI Data Policy](AI_DATA_POLICY.md)
- [AI Explainability](AI_EXPLAINABILITY.md)
- [Keeper Wallet and Gas Policy](KEEPER_GAS_POLICY.md)
- [Technology Stack](TECH_STACK.md)
- [Chain, Asset, Wallet, and UAT Specification](CHAIN_COMPATIBILITY.md)
- [Design System and Normative Mockups](DESIGN_SYSTEM.md)
- [Build-Readiness Baseline](BUILD_READINESS.md)
- [Mainnet-Edge Release Specification](MAINNET_EDGE_RELEASE.md)

## Design references

- [Primary screen mockups](design/mockups/README.md)
- [Generated brain and 42-character art system](design/brain-art/README.md)

The PRD and the ten specifications listed after it form the authoritative requirements set. [Product Brief](PRODUCT_BRIEF.md) is retained only as a superseded historical concept note.

## Core design

- Upgradeable EVM contracts targeting Robinhood Chain.
- Entry and redemption fees instead of a basket-share transfer tax.
- Exactly 42 brain NFTs with immutable affinities and influence weights.
- Ornith proposes constrained target weights from every qualified registry
  asset while holding no more than nine risk positions plus USDG.
- Deterministic validation and execution enforce portfolio and security limits.
- Free structured data feeds and versioned calculations only.
- Anvil for local iteration, a live valueless V3 Robinhood Testnet replica
  environment, read-only mainnet shadow evidence, and mainnet only after launch
  gates pass.
- A locked editorial light and dark design system with six normative primary-screen mockups.
- No open internal MVP product or architecture decisions; external legal, audit, credential, signer, funding, and live-manifest inputs remain production gates.

Real-value deployment remains subject to smart-contract audits and legal analysis.
