# VM runtime units

`mdb-cycle.timer` executes the constrained allocation endpoint hourly. It is intentionally local-devnet-only: the active Anvil chain and VM-hosted web app must already be running. The endpoint validates the AI result and the contract rechecks the asset allowlist, weights, and USDG reserve before a transaction can succeed.

Cycle, collector, deployer, and wallet secrets are loaded from
permission-restricted `/etc/mdb/*.env` files. No service unit contains an inline
token or private key. `infrastructure/systemd/` is the canonical unit source;
the local copies in this directory remain compatibility references.

`mdb-cloudflared.service` exposes the local web service through a temporary, randomly assigned `trycloudflare.com` Quick Tunnel. It is for short-lived public demonstrations only: Cloudflare provides no Quick Tunnel SLA, the hostname changes when the tunnel is recreated, and this unit is not a production ingress design. Disable the unit when the demo is over.

`mdb-web.service` uses the native PostgreSQL database `milliondollarbrain` through local peer authentication. Each V3 cycle stores the exact bounded decision context, hashes, model configuration, raw output, portfolio/accounting snapshots, calculated market features, validated allocation, outcomes, and execution receipt. `FRED_API_KEY` is optional; macro-dependent brain pieces remain inactive until a free key is configured.

`mdb-market-collector.timer` invokes the authenticated collector route every minute. The route deduplicates official NVDA, AAPL, SPY, QQQ, and SOXX observations, aggregates retained candles, calculates independently gated features, indexes post-activation vault events, matures decision outcomes, and records worker health under a PostgreSQL advisory lock. SPY, QQQ, and SOXX are reference-only and never enter the contract or allocator allowlist.

When the connected chain ID is `31337`, the collector also synchronizes the
local mock valuation oracle and mock router to the same fresh official
Robinhood AAPL/NVDA and Coinbase ETH-USD prices. It skips sub-basis-point noise,
records every update in `mdb_price_syncs`, verifies both contract reads, and
restores both previous values if the pair cannot be updated safely.
`MDB_LOCAL_PRICE_SYNC_ENABLED=false` disables this local-only behavior. It must
never be used as the production oracle design.
