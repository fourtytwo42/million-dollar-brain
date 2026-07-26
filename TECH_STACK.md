# MillionDollar Brain Technology Stack

**Version:** 0.2
**Status:** Application, contract, and native deployment stack locked for MVP

## 1. Deployment constraint

- No Docker, container images, or container orchestration.
- All application runtimes, package dependencies, reverse proxies, and services are installed directly on the Ubuntu VM.
- Production processes run under `systemd`.
- Logs are collected through `journald`.
- Caddy terminates HTTPS and reverse-proxies application traffic.

Initial application VM:

- Host: `192.168.50.135`
- OS: Ubuntu 24.04 LTS
- Repository: `/home/hendo420/projects/million-dollar-brain`
- GitHub: `fourtytwo42/million-dollar-brain`

## 2. Frontend

| Concern | MVP selection |
| --- | --- |
| Framework | Next.js using the App Router |
| Language | TypeScript with strict mode |
| Runtime | Node.js 24 LTS |
| Package manager | npm with a committed lockfile |
| Styling | Tailwind CSS 4 |
| Component system | shadcn/ui using Radix primitives |
| Icons | Lucide |
| Forms | React Hook Form |
| Runtime validation | Zod |
| Animation | Motion for React |
| General charts | Apache ECharts |

Dependency versions are pinned in `package-lock.json`. Upgrades occur through reviewed pull requests rather than unbounded production installs.

## 3. Web3 frontend

| Concern | MVP selection |
| --- | --- |
| Low-level EVM client | viem |
| React blockchain hooks | wagmi |
| Server and remote-state cache | TanStack Query |
| Wallet interface | RainbowKit |
| Wallet standards | EIP-1193 and EIP-6963 |
| Mobile wallet transport | WalletConnect with a free project ID |

Robinhood Chain and its testnet are defined explicitly with viem `defineChain` configuration. The application must not depend on a library shipping a built-in chain definition.

Injected wallets are discovered through EIP-6963, with an EIP-1193 fallback. MetaMask, Robinhood Wallet, Coinbase Wallet, Rabby, Brave Wallet, Rainbow, Trust Wallet, SafePal, and other standards-compliant wallets are supported through injected connectors or WalletConnect. Ledger and Trezor use a compatible wallet application rather than a custom direct integration.

The app supports add-and-switch requests for local Anvil, Robinhood Chain testnet, and Robinhood Chain mainnet. Wallet support and release UAT requirements are normative in `CHAIN_COMPATIBILITY.md`.

Contract ABIs and addresses come from versioned deployment artifacts. The browser never receives:

- Keeper keys.
- Allocator signing keys.
- Admin or upgrade keys.
- Server-only API credentials.
- Unpublished contract addresses.

## 4. Brain visualization

The 42-piece brain is implemented as a native SVG rather than canvas or a bitmap.

Requirements:

- Exactly 42 stable, addressable SVG paths.
- A permanent piece ID mapped to the on-chain brain-piece ID.
- Keyboard focus and accessible labels.
- Independent hover, selected, owner, weight, preset, price, and status states.
- Responsive `viewBox` scaling.
- Zoom and pan on mobile.
- Piece selection opens the Brain Piece drawer.
- Motion for React is limited to meaningful state transitions and honors reduced-motion preferences.

SVG is the canonical interaction layer. Decorative raster artwork may sit behind or around it but cannot replace the addressable paths.

## 5. Frontend application structure

```text
src/
  app/
    page.tsx
    basket/
    decisions/
    admin/
    about/
  components/
    brain/
    basket/
    decisions/
    wallet/
    transactions/
    ui/
  config/
    chains.ts
    contracts.ts
  hooks/
  lib/
    api/
    formatting/
    validation/
    web3/
  styles/
  types/
public/
  brain/
```

Primary routes remain:

- `/` for Brain.
- `/basket` for Basket.
- `/decisions` for Decisions.
- `/admin` for authorized administration.

Drawers and modals implement piece, asset, cycle, account, deposit, and redemption details.

## 6. State-management rule

Do not add Redux or another global state framework for the MVP.

- TanStack Query owns server and blockchain query state.
- wagmi owns connected-wallet and chain state.
- URL state owns shareable filters, tabs, piece IDs, asset IDs, and cycle IDs.
- React component state owns transient presentation state.
- Persist only explicit user preferences in browser storage.

Add another state library only after a documented need appears.

## 7. Testing

| Test level | Tool |
| --- | --- |
| Unit and component | Vitest |
| React interaction | React Testing Library |
| Automated browser and wallet flows | Playwright |
| Interactive public and accessibility UAT | Codex in-app Browser |
| Real extension and wallet UAT | User Chrome |
| Accessibility checks | axe integrated into browser tests |
| Type safety | TypeScript compiler |
| Linting | ESLint |
| Formatting | Prettier |

Required frontend test coverage includes:

- Disconnected and wrong-network states.
- Deposit and redemption previews.
- All brain-piece ownership and purchase states.
- Preset preview and confirmation.
- Stale-data, paused, failed-cycle, and low-gas states.
- Proposal versus execution explanations.
- Mobile navigation and brain interaction.
- Admin authorization boundaries.
- EIP-6963 injected-wallet discovery and WalletConnect.
- Network add and switch across Anvil and Robinhood Chain.
- Account changes, rejected signatures, pending, replaced, reverted, and successful transactions.

## 8. Native production layout

```text
Internet
  |
Caddy :443
  |
Next.js 127.0.0.1:3000
  |
Fastify API, allocator, keeper, and Robinhood Chain services
```

Production requirements:

- Install Node.js 24 LTS directly on the VM.
- Use `npm ci` for deterministic dependency installation.
- Use `npm run build` before service restart.
- Run Next.js as a dedicated unprivileged service account.
- Bind Next.js to localhost.
- Store environment variables in a root-owned file outside the repository.
- Use `systemd` restart limits and health checks.
- Use Caddy for TLS, compression, security headers, and proxying.
- Do not use PM2; `systemd` owns process lifecycle.
- Do not run development servers in production.

## 9. Security boundaries

- The frontend is untrusted.
- All values used for transactions are revalidated by contracts.
- Admin navigation visibility is not authorization; contracts enforce roles.
- Contract writes display chain, contract, method, value, price protection, and deadline before signature.
- External links and token metadata are treated as untrusted.
- Content Security Policy restricts scripts, connections, frames, and images to approved origins.
- Source maps are not publicly served unless deliberately enabled for a release.

## 10. Backend and automation

| Concern | MVP selection |
| --- | --- |
| API | Fastify on Node.js 24 LTS and TypeScript |
| Database | PostgreSQL |
| Schema and migrations | Drizzle ORM and Drizzle Kit |
| Chain client and event ingestion | viem with checkpointed RPC log ingestion |
| Runtime validation | Zod |
| Scheduler | `systemd` timers invoking the TypeScript keeper |
| Process management | Native `systemd` services |
| Structured logs | JSON logs captured by `journald` |
| Metrics | Prometheus-format service metrics |
| Alerts | Health checks and configurable webhook or email adapter |
| Backups | Native PostgreSQL `pg_dump` with encrypted off-host retention |

Redis, a separate queue system, PM2, and Docker are excluded initially. PostgreSQL owns durable jobs, chain checkpoints, cycle state, idempotency keys, and retry state.

## 11. Smart contracts and local chain

| Concern | MVP selection |
| --- | --- |
| Language | Solidity |
| Toolchain | Foundry: `forge`, `anvil`, and `cast` |
| Local chain | Anvil chain ID 31337 on localhost |
| Contract library | OpenZeppelin Contracts Upgradeable |
| Proxy | UUPS behind ERC-1967 |
| Authorization | OpenZeppelin `AccessControl` |
| Upgrade checks | OpenZeppelin Foundry Upgrades and storage-layout validation |
| Static analysis | Slither |

The repository layout is:

```text
apps/web
services/api
services/allocator
services/keeper
packages/contracts
packages/shared
packages/config
```

All packages share strict TypeScript, lint, formatting, and test configuration where applicable. Detailed network, asset, oracle, wallet, and UAT requirements are controlled by `CHAIN_COMPATIBILITY.md`.
