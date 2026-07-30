# Braincell Inspector and Owner Profile V2 Testnet Acceptance

Status: Passed

Environment: Robinhood Testnet, chain 46630

Active test window: 2026-07-30 06:19:35Z through 2026-07-30 08:32:08Z

Accepted release lineage:

- Feature source: `d9f25b444d5fbfafe120c52efa4bb88d958a19b3`
- Promotion evidence: `22db52abd8a1c9fc930025929cc9e12944f2e568`
- Cadence repair: `fa0b255af18dcb2877cf0df55eef68655a072d59`
- Test USDG funding repair: `a8a351aacb76ba783ded535a33a344615248a76b`

## Acceptance evidence

- 2.04 active test hours after excluding 608,733 ms of verified repair downtime.
- Eight passing checkpoints against a seven-checkpoint minimum.
- 24 three-actor scenarios covering BRAINS buys, atomic sells, braincell
  purchases and resales, control changes, claims, oversized-exit rejection,
  concurrent requests, and rising resale prices.
- Atomic buys and sells passed; no queued sales were created.
- Oracle freshness, positive NAV, accounting reconciliation, and service health
  passed at every accepted checkpoint.
- An executed autonomous DecisionContext V6 cycle was observed by four
  checkpoints.
- Profile V2 has independent live transaction evidence:
  `0xfd898c04c8fe9bb1fa8d3b4bb33722712f6109409eab264fcddc52316cf58b0a`.
- The generated acceptance artifact is
  `var/testnet-readiness/v3-2h-acceptance.json`, source hash
  `9a28d0e485ce673f918440eea61214db5041bf833bba43169fe513d3a99570d6`.

## Final public browser UAT

The public testnet at `https://testnet.42braincells.com` passed:

- Desktop: 1440x900, compact right-side inspector, no horizontal overflow.
- Tablet: 768x1024, dedicated braincell detail view with Back to Brain.
- Mobile: 390x844, dedicated braincell detail view with Back to Brain.
- Light and dark theme checks.
- Profile V2 name, tagline, badge, reaction, portrait, controls, ownership
  action, and responsive navigation.
- No browser console errors or failed public HTTP checks.

## Operational state

- The endurance service completed normally and is inactive.
- Devnet and testnet web, cycle, collector, and RPC failover services remain
  active.
- The public testnet and local ports 3000 and 3001 return HTTP 200.
- The RPC gateway safely used its configured secondary while the LAN primary
  was unreachable; no shared RPC host was changed.
- No mainnet deployment, transaction, or activation was performed.
