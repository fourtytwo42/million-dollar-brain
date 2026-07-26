# VM runtime units

`mdb-cycle.timer` executes the constrained allocation endpoint hourly. It is intentionally local-devnet-only: the active Anvil chain and VM-hosted web app must already be running. The endpoint validates the AI result and the contract rechecks the asset allowlist, weights, and USDG reserve before a transaction can succeed.
