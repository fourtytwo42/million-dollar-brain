# 42 Braincells Cloudflare Deployment

## Public routes

| Hostname                   | Origin                  | Purpose                         |
| -------------------------- | ----------------------- | ------------------------------- |
| `42braincells.com`         | `http://localhost:3002` | Mainnet Coming Soon page        |
| `www.42braincells.com`     | `http://localhost:3002` | Mainnet Coming Soon page        |
| `testnet.42braincells.com` | `http://localhost:3001` | Robinhood Testnet application   |
| Tunnel catch-all           | HTTP 404                | Reject unknown public hostnames |

The tunnel is remotely managed in Cloudflare. DNS records and hostname-to-origin
routes are configured in the Cloudflare dashboard. The connector runs as
`mdb-cloudflared.service`.

## Secret handling

- The remotely managed tunnel token is stored only at
  `/etc/mdb/cloudflared-token`.
- The file is owned by `cloudflared:cloudflared` with mode `0600`.
- The token must never be committed, printed in logs, or included in release
  evidence.
- Rotate the token in Cloudflare and replace the file if it is exposed.

## Origins

- `mdb-web-testnet.service` serves the testnet application on port `3001`.
- `mdb-coming-soon.service` serves the static apex page on loopback port `3002`.
- Local devnet on port `3000` is not published by the named tunnel.

## Verification

```bash
systemctl is-active mdb-web-testnet.service mdb-coming-soon.service mdb-cloudflared.service
curl --fail http://127.0.0.1:3001/
curl --fail http://127.0.0.1:3002/healthz
curl --fail https://testnet.42braincells.com/
curl --fail https://42braincells.com/
```

Verify that the apex contains `MAINNET // COMING SOON`, the testnet contains
`42 BRAINCELLS`, both use valid HTTPS, and unknown tunnel hostnames return 404.
