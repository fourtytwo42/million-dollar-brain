# VM runtime units

`mdb-cycle.timer` executes the constrained allocation endpoint hourly. It is intentionally local-devnet-only: the active Anvil chain and VM-hosted web app must already be running. The endpoint validates the AI result and the contract rechecks the asset allowlist, weights, and USDG reserve before a transaction can succeed.

The checked-in cycle token is only a local-devnet access guard. Testnet and production deployments must inject a generated secret through a root-readable systemd environment file instead of committing it.
