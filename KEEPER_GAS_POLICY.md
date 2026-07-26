# MillionDollar Brain Keeper Wallet and Gas Policy

**Version:** 0.1  
**Status:** MVP decisions locked

## 1. Why the server needs a wallet

User actions happen at arbitrary times and users pay their own gas. The hourly allocation is different: no user is guaranteed to be present when Ornith produces a target.

The automation server therefore operates an authorized Keeper Wallet that:

- Holds native ETH for Robinhood Chain gas.
- Submits one eligible allocation transaction per cycle.
- May call only the Allocation and Risk Controller entrypoint.
- Receives capped gas reimbursement.

The model never receives the private key and cannot construct or submit arbitrary transactions.

## 2. Fee funding

The MVP basket entry and redemption fee is 1%.

Each collected fee is allocated:

| Destination | Share of collected fee | Effective rate on deposit or redemption |
| --- | ---: | ---: |
| Brain Reward Distributor | 50% | 0.50% |
| Creator-withdrawable DAO revenue | 40% | 0.40% |
| Automation Reserve | 10% | 0.10% |

The Automation Reserve is part of the Creator DAO Vault's original 50% share. This preserves the agreed 50/50 split between brain owners and the creator side.

Initial brain-piece purchases and secondary markup revenue do not fund automation in the MVP. Governance may add those sources later.

## 3. USDG-to-ETH refueling

Fees arrive in USDG, but Robinhood Chain gas is paid in native ETH.

The system uses:

1. An on-chain Automation Reserve accounting bucket holding USDG.
2. An approved, slippage-limited USDG-to-WETH route.
3. WETH withdrawal to native ETH.
4. A capped transfer of native ETH to the configured Keeper Wallet.

Refueling may be triggered by the keeper or another caller, but the contract determines the amount, route, price protection, destination, and frequency.

No refill function may:

- Use basket principal.
- Use brain-owner reward liabilities.
- Send funds to an unregistered wallet.
- Use an unapproved venue.
- Exceed the configured refill cap.

## 4. Balance policy

Gas funding is managed in estimated cycle coverage rather than a fixed ETH amount:

- **Target balance:** estimated gas for 72 cycles plus a 25% buffer.
- **Low-balance warning:** estimated gas for fewer than 24 cycles.
- **Critical balance:** estimated gas for fewer than 6 cycles.
- **Refill trigger:** below the 24-cycle threshold.

Estimates use a bounded rolling gas-price and gas-used calculation. Governance sets absolute maximum ETH balance, gas price, refill size, and reimbursement values.

The initial Keeper Wallet and Automation Reserve require a manual ETH bootstrap before the first scheduled cycle.

## 5. Reimbursement

For an accepted cycle transaction:

```text
reimbursement =
  min(
    measured gas used × effective gas price + fixed submission overhead,
    configured per-cycle reimbursement cap
  )
```

Rules:

- At most one reimbursement per cycle ID.
- The cycle must be due and have a valid signed proposal.
- Reimbursement goes only to the registered transaction sender.
- Gas price and total reimbursement are capped.
- Failed validation does not receive trade-execution reimbursement.
- A valid on-chain Hold record may receive the smaller submission reimbursement.
- Refills and reimbursements emit public events.

## 6. Wallet permissions

The Keeper Wallet may:

- Submit a due signed allocation.
- Record an eligible Hold cycle.
- Trigger its bounded refill.
- Claim an approved reimbursement.

The Keeper Wallet may not:

- Withdraw basket assets.
- Withdraw Creator DAO revenue.
- Withdraw brain-owner rewards.
- Add or change assets.
- Change brain presets.
- Change risk limits.
- Upgrade contracts.
- Pause or unpause the protocol.
- Change its own authorized address.
- Call arbitrary Trade Executor functions.

The controller, not the Keeper Wallet, derives and authorizes trades.

## 7. Key handling

- Store the key in an operating-system secret store, HSM, or managed signer.
- Never place the key in the model prompt, application repository, logs, or browser client.
- Run the signer in a process separated from the model adapter.
- Restrict outbound transaction targets to the configured controller contract.
- Support immediate keeper revocation and key rotation.
- Maintain a manually controlled backup keeper for recovery.

The allocator proposal signer and transaction-paying Keeper Wallet should be separate keys, even when they run on the same server.

## 8. Failure behavior

If the Keeper Wallet lacks gas:

- No rebalance transaction occurs.
- Basket assets remain where they are.
- User deposits, redemptions, claims, and brain actions remain available unless separately paused.
- The missed cycle and low-balance state appear publicly.
- An authorized backup keeper may submit the same still-valid proposal before its deadline.

If the proposal expires, the protocol records a missed cycle and waits for the next scheduled cycle.

## 9. Required interface visibility

The Decisions and Admin interfaces show:

- Keeper address.
- Current ETH balance.
- Estimated cycles remaining.
- Automation Reserve USDG balance.
- Last refill and reimbursement.
- Current gas-price and reimbursement caps.
- Low and critical balance warnings.
- Primary and backup keeper status.
