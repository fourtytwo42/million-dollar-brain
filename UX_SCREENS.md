# MillionDollar Brain Screen Map

**Version:** 0.2  
**Status:** Consolidated MVP navigation locked

## 1. Screen-count decision

The MVP has three primary public product screens and one separate creator screen:

1. **Brain** at `/`
2. **Basket** at `/basket`
3. **Decisions** at `/decisions`
4. **Admin** at `/admin`, visible only to authorized wallets

These are supporting surfaces, not additional primary screens:

- Brain Piece drawer.
- Asset drawer.
- Wallet and Account drawer.
- Deposit modal.
- Redeem modal.
- Cycle Detail drawer with a deep link.
- How It Works and Risk drawer with a standalone disclosure URL.
- Transaction status panel.

This keeps the primary navigation understandable while preserving deep links for sharing and audit.

## 2. Global application shell

### Primary navigation

- Brain
- Basket
- Decisions

The authorized creator also sees Admin. How It Works appears as a help action, not a primary destination.

### Persistent header

- Product mark.
- Current basket share price.
- Next decision countdown.
- Compact system-status indicator.
- Connect Wallet button or connected-wallet menu.

The header must remain useful without a connected wallet.

The global account or display menu includes a `Light / Dark / System` theme control. The first visit follows the operating-system preference, and a user's explicit selection persists on that device.

### Connected-wallet menu

Opening the wallet menu shows the Account drawer:

- Basket shares and current value.
- Brain pieces owned.
- Claimable brain rewards.
- Pending transactions.
- Deposit, Redeem, and Claim All actions.
- Network and wallet controls.
- Personal transaction history.

My Account is therefore not a separate page.

### Global status banner

Show a banner only when action is needed:

- Wrong network.
- Prices or data are stale.
- Scheduled allocation is delayed.
- Execution is paused.
- Redemption is queued.
- Upgrade is pending.
- Protocol is paused.

Healthy operation uses the compact header indicator instead of a permanent banner.

## 3. Screen 1: Brain

**Route:** `/`

This is the visual identity, marketplace, and plain-language overview.

### First viewport

The first viewport must answer three questions immediately:

1. What does the brain currently prefer?
2. Which pieces do I own and control?
3. What did Ornith decide most recently?

Desktop layout:

- Brain Pulse summary strip across the top.
- Interactive 42-piece brain occupying the main visual area.
- Complete selected-piece inspector in the right rail.

Mobile layout:

- Brain Pulse summary first.
- Zoomable brain second.
- Selected-piece inspector after the map or list.

### Brain Pulse card

Show:

- Plain-language brain state, such as `Growth-oriented, equity-led, broadly diversified`.
- Strongest three active preferences.
- Strongest opposing preference or conflict.
- Current data focus.
- Current brain version.
- Number of settings changed since the previous cycle.
- Latest decision result and next cycle countdown.

Use a `See why` action to open the latest decision.

### Interactive brain

- Exactly 42 visible pieces.
- Color may represent affinity group.
- Selected overlay may show ownership, weight, preset, price, or recent change.
- Hover or tap shows piece name, current preset, influence, owner status, and price.
- Selecting a piece opens the Brain Piece drawer.
- The Brain has one character-first map rather than a Characters/Ownership/Influence/Mood selector. Ownership is shown by the permanent halo; influence and current mood remain in the tooltip and inspector.
- Personally owned pieces retain a double-outline ownership halo on the map.
- A textual `Yours (n) · double outline` key communicates the connected wallet's count without relying on color alone. It acts like a crew filter: select it to highlight only the wallet's pieces and select it again to clear.

The brain itself is the NFT marketplace. There is no separate marketplace page.

### Primary actions

- Buy the selected brain piece.
- Change the selected mood when owned.
- Claim brain-owner rewards.

Deposits, redemptions, holdings, and allocation detail belong on Basket and are not duplicated on Brain.

- Inspect or purchase a brain piece.
- View latest decision.

## 4. Brain Piece drawer

**Presentation:** Side drawer on desktop and full-height bottom sheet on mobile  
**Deep link:** `/brain/:pieceId`

### Summary

- Piece name, number, brain location, and affinity group.
- Current preset and plain-language effect.
- Immutable influence weight.
- Contribution to the current compiled brain.
- Owner and current purchase price.
- Next purchase price.
- Data status: active, partly active, or inactive.

### Preset comparison

Show all five closed moods in a simple comparison, pairing memorable character language with the exact bounded portfolio effect:

- What changes.
- Which data it uses.
- Current aggregate value.
- Previewed aggregate value after the change.
- Earliest cycle in which the change can apply.

Avoid presenting the setting as a guaranteed trade.

### Purchase states

For an unowned piece:

- Initial price.
- Statement that 100% goes to the Creator DAO Vault.
- Always-for-sale terms.

For a piece owned by another wallet:

- Required 120% payment.
- Seller proceeds.
- Creator Vault share of the markup.
- Brain-owner reward share of the markup.
- Next required purchase price.
- Maximum-price and deadline controls.

For the current owner:

- Change preset.
- Claim accrued rewards.
- View ownership and selection history.

## 5. Screen 2: Basket

**Route:** `/basket`

This combines the previous Portfolio and My Account screens.

### Page header

- Total basket NAV.
- Share price.
- Connected wallet's shares and value, when connected.
- Deposit and Redeem buttons.

### Overview section

- Current allocation chart.
- Ornith target allocation.
- Stable reserve and required minimum.
- Performance for 24 hours, seven days, 30 days, and since launch.
- Realized and unrealized basket performance.
- Current drift and expected next rebalance time.

### Holdings

Use a sortable table on desktop and cards on mobile:

The portfolio view lists only assets with a positive on-chain basket balance.
Configured, approved, or previously held assets with a zero balance are omitted
from the holdings table rather than shown as 0% positions.

- Asset and verified-contract link.
- Asset class and important tags.
- Current and target weights.
- Allowed allocation band.
- USD value.
- Price age and data health.
- Return, volatility, liquidity, and risk tier.
- Buy, sell, hold, paused, sell-only, or frozen state.

Selecting an asset opens the Asset drawer.

### Your position

When connected:

- Basket shares.
- Current redemption estimate.
- Average entry value where available.
- Personal realized and unrealized result.
- Deposit and redemption history.
- Owned brain pieces summary.
- Claimable rewards.

This section replaces a separate Account page.

### Empty and disconnected states

Without a wallet:

- Show all public basket information.
- Explain that connecting adds personal position and transaction controls.

With no shares:

- Show a concise first-deposit explanation.
- Do not hide portfolio data.

## 6. Asset drawer

**Presentation:** Drawer or bottom sheet  
**Deep link:** `/basket/assets/:assetId`

- Verified identity and contract.
- Robinhood UID when applicable.
- Current and target basket weight.
- Maximum permitted weight.
- Price source, age, and validity.
- Returns, volatility, drawdown, trend, liquidity, spread, and price impact.
- Applicable SEC-derived fundamental metrics.
- Corporate-action and trading-halt status.
- Brain affinities currently affecting the asset.
- Plain-language reason it is held, not held, increased, or reduced.
- Recent basket trades involving the asset.

## 7. Deposit modal

**Available from:** Brain, Basket, and Account drawer

- USDG wallet balance.
- Deposit amount.
- Current NAV per share.
- 1% entry fee.
- Creator and brain-owner fee split.
- Net basket contribution.
- Estimated shares received.
- Minimum-shares protection.
- Gas estimate.
- Data-freshness status.

States:

- Approval required.
- Ready.
- Pending.
- Confirmed.
- Failed with a specific recovery action.

## 8. Redeem modal

**Available from:** Brain, Basket, and Account drawer

- Share balance.
- Share amount or percentage.
- Gross NAV value.
- 1% redemption fee.
- Estimated net proceeds.
- Reserve availability.
- Expected settlement mode and time.
- Minimum-proceeds protection.
- Gas estimate.
- Data-freshness status.

The interface must not promise immediate USDG redemption when the current reserve or settlement state cannot support it.

## 9. Screen 3: Decisions

**Route:** `/decisions`

This combines AI Decisions, Cycle Detail navigation, protocol Activity, and technical Transparency.

### Tabs

1. Latest
2. History
3. Activity
4. System

Default to Latest. Preserve the selected tab in the URL query.

### Latest tab

The primary explanation uses three stages:

| Brain requested                     | Ornith proposed                   | Protocol executed                   |
| ----------------------------------- | --------------------------------- | ----------------------------------- |
| Strongest preferences and conflicts | Target allocations and confidence | Validated targets and actual trades |

Show:

- Rebalance or Hold.
- Decision time and cycle ID.
- Before, proposed, and executed allocation.
- Three to five most influential brain pieces.
- Important structured data supporting the decision.
- Hard rules that changed or rejected the proposal.
- Trading cost, turnover, and gas.
- Resulting basket state.

Allocation summaries and the Ornith-proposed stage list only positive target
weights for the selected cycle. Zero-weight candidates are omitted from both the
latest decision and every historical decision.

The first view should be understandable without showing raw JSON.

### History tab

- Chronological cycle list.
- Rebalances, holds, failures, and missed cycles.
- Search and filters.
- Brain-version marker.
- Compact before-and-after allocation preview.
- Selecting a cycle opens Cycle Detail.

### Activity tab

One searchable protocol event stream:

- Deposits and redemptions.
- Brain-piece initial and secondary purchases.
- Preset changes.
- Reward accrual and claims.
- AI cycles and trades.
- Keeper reimbursements.
- Creator Vault withdrawals.
- Registry changes.
- Pauses, circuit breakers, and upgrades.

Each item includes time, actor, amount, plain-language description, and transaction link.

### System tab

- Scheduler and Ornith availability.
- Keeper address, native ETH balance, estimated cycles remaining, and backup status.
- Automation Reserve balance, latest refill, and latest reimbursement.
- Data-source freshness.
- Current Asset Registry and brain versions.
- Contract implementations and upgrade history.
- Keeper status.
- Oracle and execution status.
- Current pause and circuit-breaker state.
- Contract addresses and audits.

## 10. Cycle Detail drawer

**Presentation:** Drawer over Decisions  
**Deep link:** `/decisions/:cycleId`

Use progressive disclosure:

### Summary

- Brain state.
- Data state.
- Ornith proposal.
- Protocol adjustments.
- Executed result.

### Influence

- Influential brain pieces.
- Aggregate preference vector.
- Asset-level effects.
- Conflicts between settings.

### Data

- Structured metrics used.
- Source IDs and timestamps.
- Formula versions.
- Missing or inactive fields.

### Validation and execution

- Hard-limit checks.
- Adjusted or rejected targets.
- Trade plan.
- Executed transactions.
- Gas, slippage, turnover, and resulting holdings.

### Technical provenance

- Provider and model ID.
- Prompt and schema versions.
- Input and output hashes.
- Proposal signature.
- Source block and transaction links.
- Validated final structured output.

Raw reasoning-stream content is not shown as authoritative reasoning.

## 11. Screen 4: Creator Admin

**Route:** `/admin`  
**Access:** Authorized creator or administrator wallet only

Admin is visually separated from public product navigation.

### Sections

- Creator Vault.
- Asset Registry.
- AI and scheduler.
- Protocol and upgrades.
- Roles and emergency controls.

### Creator Vault

- Available creator balance.
- Revenue by source.
- Keeper and infrastructure spending.
- Withdrawal history.
- Withdrawal destination and amount.

### Asset Registry

- Candidate assets synchronized from canonical metadata.
- Validation status for contract, price, liquidity, data, and legal eligibility.
- Activate, pause, unpause, sell-only, hold-only, or freeze controls.
- Risk tier, tags, weight cap, liquidity threshold, and venues.

### AI and scheduler

- Primary provider and exact model.
- Ornith health.
- Last successful inference.
- Scheduler and keeper state.
- Keeper Wallet address, ETH balance, and estimated cycle coverage.
- Automation Reserve USDG balance.
- Refill history, reimbursement history, and spending caps.
- Primary and backup keeper configuration.
- Cycle interval and reimbursement settings.
- Pause scheduled execution.

### Protocol

- Contract implementation versions.
- Upgrade proposals and status.
- Role assignments.
- Oracle status.
- Pause state and emergency controls.

High-risk actions require consequence previews, explicit confirmations, and transaction receipts.

## 12. How It Works and risks

This is supporting education, not primary product navigation.

**Presentation:** First-visit floating quick tour plus persistent `How it works` help action
**Disclosure URL:** `/about`

The first visit opens a dismissible floating tour without changing document
flow or pushing the Brain, Basket, or Decisions content down. The compact
desktop panel sits beside the product and becomes a mobile bottom sheet. It
shows one focused concept at a time while exposing all four steps:

1. Own the basket by depositing USDG for redeemable MDBS.
2. Steer preferences through the 42 brain pieces and their closed presets.
3. Let the constrained AI propose target weights on the hourly schedule.
4. Let deterministic contracts enforce the allowlist, reserve, and limits
   before execution.

The optional collapsed glossary defines MDBS, brain piece, mood, influence, and
NAV without making the panel taller by default. Dismissing the tour persists on
that device, while the header action always reopens it. Brain, Basket, and
Decisions each retain a one-sentence purpose statement so users do not lose the
product model after onboarding.

The same content is reachable from help links near unfamiliar concepts:

- Basket shares and NAV.
- Entry and redemption.
- Brain ownership and forced purchases.
- Presets and influence.
- How data reaches Ornith.
- How targets become trades.
- Fees and reward waterfall.
- Upgrade and creator authority.
- Smart-contract, model, oracle, liquidity, redemption, and legal risks.
- Contract addresses and audits.

The standalone URL exists for disclosures, searchability, and sharing, but it does not occupy a primary navigation slot.

## 13. Transaction status

All write actions use one consistent transaction panel:

1. Review.
2. Wallet approval when needed.
3. Transaction signature.
4. Pending confirmation.
5. Confirmed state with transaction link.

Users may close the panel. Pending transactions remain visible from the header and Account drawer.

## 14. Mobile navigation

Use a three-item bottom navigation:

- Brain
- Basket
- Decisions

The connected-wallet avatar opens Account. Help and system status remain in the header.

Mobile requirements:

- Brain supports zoom and pan.
- Brain Piece, Asset, and Cycle Detail use full-height bottom sheets.
- Holdings become asset cards.
- Deposit and Redeem remain accessible with a sticky action bar where appropriate.
- Admin remains functional but is desktop-optimized.
- Light and dark modes preserve the same controls, content, and semantic state colors.

## 15. MVP priority

### Required

1. Global application shell and status.
2. Brain screen and Brain Piece drawer.
3. Basket screen and Asset drawer.
4. Deposit and Redeem modals.
5. Decisions screen and Cycle Detail drawer.
6. Account drawer.
7. Creator Admin.
8. Contextual education and disclosure URL.

### Later

- Historical brain-state playback.
- Portfolio and preset simulator.
- Notifications.
- Brain configuration sandbox.
- Governance.
- Leaderboards and social sharing.
- Advanced performance attribution.
