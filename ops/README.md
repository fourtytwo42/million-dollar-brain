# VM runtime units

`mdb-cycle.timer` executes the constrained allocation endpoint hourly. It is intentionally local-devnet-only: the active Anvil chain and VM-hosted web app must already be running. The endpoint validates the AI result and the contract rechecks the asset allowlist, weights, and USDG reserve before a transaction can succeed.

The checked-in cycle token is only a local-devnet access guard. Testnet and production deployments must inject a generated secret through a root-readable systemd environment file instead of committing it.

`mdb-cloudflared.service` exposes the local web service through a temporary, randomly assigned `trycloudflare.com` Quick Tunnel. It is for short-lived public demonstrations only: Cloudflare provides no Quick Tunnel SLA, the hostname changes when the tunnel is recreated, and this unit is not a production ingress design. Disable the unit when the demo is over.
