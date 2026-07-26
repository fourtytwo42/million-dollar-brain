# MillionDollar Brain

MillionDollar Brain is a proposed DeFi basket protocol for Robinhood Chain. Basket-share holders deposit and redeem against a managed portfolio, while owners of 42 always-for-sale brain-piece NFTs steer a constrained hourly AI allocation through closed, auditable presets.

## Current status

Usable local-devnet release running natively on the project VM. It includes upgradeable protocol contracts, a built-in browser development wallet, the complete 42-piece ERC-721 brain, entry and redemption economics, brain-owner claims, a creator vault, immediate and queued exits, an hourly keeper, and constrained Ornith allocation cycles.

The live application follows the normative editorial system: its Brain view uses a versioned 42-character portrait collection, curved SVG segments, a character-first map with crew and personal-ownership filters, a compact compiled Brain Pulse, and a complete selected-piece inspector. Basket provides the portfolio ledger and user actions, while Decisions shows the Brain requested, Ornith proposed, and Protocol executed chain.

This is still a simulation. The allowlist contains mock USDG, NVDA, AAPL, and ETHX assets on Anvil; no Robinhood testnet/mainnet contracts or real funds are enabled.

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

## Design references

- [Primary screen mockups](design/mockups/README.md)
- [Generated brain and 42-character art system](design/brain-art/README.md)

The PRD and the ten specifications listed after it form the authoritative requirements set. [Product Brief](PRODUCT_BRIEF.md) is retained only as a superseded historical concept note.

## Core design

- Upgradeable EVM contracts targeting Robinhood Chain.
- Entry and redemption fees instead of a basket-share transfer tax.
- Exactly 42 brain NFTs with immutable affinities and influence weights.
- Ornith proposes constrained target weights from an approved asset universe.
- Deterministic validation and execution enforce portfolio and security limits.
- Free structured data feeds and versioned calculations only.
- Anvil for local iteration, Robinhood Chain public testnet next, and Robinhood Chain mainnet only after launch gates pass.
- A locked editorial light and dark design system with six normative primary-screen mockups.
- No open internal MVP product or architecture decisions; external legal, audit, credential, signer, funding, and live-manifest inputs remain production gates.

Real-value deployment remains subject to smart-contract audits and legal analysis.
