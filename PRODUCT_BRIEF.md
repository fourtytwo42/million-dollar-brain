# MillionDollar Brain

## Working concept

MillionDollar Brain is a community-influenced portfolio protocol on Robinhood Chain.

It combines:

- A basket-backed share token whose supply expands on deposits and contracts on redemptions.
- A 42-piece visual brain whose owners influence the AI's portfolio thesis and public personality.
- A scheduled AI review that proposes target allocations.
- A deterministic risk engine and on-chain executor that decide whether and how proposals become trades.
- A creator DAO and brain-owner rewards funded by protocol fees.

This is a product and protocol design document, not an implementation plan or launch authorization.

## The essential separation

The system should be designed as three connected products rather than one contract:

1. **Vault and basket share**
   - Holds the portfolio assets.
   - Accepts a base asset such as USDG.
   - Mints shares at net asset value.
   - Burns shares for a proportional redemption.

2. **Brain market**
   - Represents 42 individually owned pieces, probably as NFTs.
   - Assigns each piece a fixed influence weight.
   - Assigns each piece an immutable affinity and a closed set of preset options.
   - Lets an owner select one allowed option, with no free-text input.
   - Tracks the piece's current purchase price and claimable rewards.

3. **Agent and execution system**
   - Compiles the 42 choices into structured context.
   - Produces a target portfolio and explanation on the configured schedule.
   - Passes the proposal through deterministic constraints.
   - Uses an automated keeper to execute permitted trades.

The AI must never hold a private key or have authority to bypass the risk engine.

## Recommended basket-share model

The portfolio token should be a variable-supply vault share, not a fixed-supply meme token.

### Deposit

1. A user deposits the approved base asset.
2. The system values all holdings from an accepted price snapshot.
3. Shares are minted using the current net asset value per share.
4. Any entry fee is included in the quote shown before signing.

### Redemption

The initial design should support queued redemption rather than promise instant redemption under all conditions.

Possible settlement modes:

- **In-kind:** the user receives a proportional amount of every asset. This avoids forced selling but creates dust, gas, and transfer-eligibility problems.
- **Base-asset:** the system sells the required holdings and returns USDG. This is simpler for users but introduces slippage, latency, and front-running.
- **Hybrid:** small redemptions settle in USDG from a liquidity buffer; large redemptions are queued or settled in kind.

The recommended starting design is hybrid.

### NAV

At a high level:

`NAV per share = (priced assets - accrued liabilities - reserved costs) / circulating vault shares`

NAV needs:

- An allowlisted asset registry.
- A price-source hierarchy.
- Stale-price and deviation checks.
- Conservative treatment of illiquid assets.
- Explicit accrued protocol liabilities.
- Deposit and redemption slippage bounds.
- Protection against first-depositor and donation attacks.

Do not let the agent discover and buy arbitrary contracts. It may research candidates, but only governance can add an asset to the executable allowlist.

## Scheduled AI decision cycle

AI review and user actions operate on separate clocks.

The AI reviews the portfolio on a configured schedule, initially once per hour:

1. The off-chain agent assembles the complete constrained decision package.
2. It creates a signed proposal containing the cycle ID, brain snapshot version, source block, price timestamp, model and prompt versions, target weights, rationale hash, expiry, and nonce.
3. A scheduler or permissionless keeper submits the proposal on-chain.
4. The contract verifies the schedule window, signature, nonce, expiry, and approved asset set.
5. The deterministic risk engine modifies or rejects impermissible targets using current on-chain state.
6. Trades occur only when allocations exceed their rebalance thresholds.
7. The protocol records the proposed targets, risk adjustments, trades, gas cost, and resulting portfolio.
8. The next scheduled cycle advances.

A scheduled review does not necessarily produce trades. If current allocations remain inside their permitted bands, the cycle records a no-trade decision and avoids swap gas.

The accepted target allocation becomes the basket's intended state for the next hour, until the following scheduled cycle replaces it.

### Constrained allocator role

The model is a constrained portfolio allocator. It does not discover contracts, call tools, submit transactions, change protocol settings, or decide what information it receives.

For every cycle, the application supplies the model with:

1. **Protocol constitution**
   - The model's role and output rules.
   - The hard statement that it may choose only from the supplied asset IDs.
   - The requirement that target weights sum to exactly 10,000 basis points.
   - The option to make no material change.

2. **Complete brain state**
   - All 42 affinities.
   - Every piece's selected option, immutable weight, and selection version.
   - Canonical protocol-authored instructions associated with those options.
   - No user-authored text.

3. **Approved asset universe**
   - Stable asset ID and contract.
   - Every approved asset ID and contract.
   - Asset category and risk tier.
   - Current price, price age, liquidity, volume, spread, volatility, and recent returns.
   - Per-asset minimum and maximum allocation.
   - Whether an asset is currently paused or unavailable.

4. **Current basket**
   - Balances, market values, and current weights.
   - NAV, circulating shares, and base-asset reserve.
   - Cost basis and unrealized and realized performance where available.
   - Current target weights and drift from target.
   - Recent turnover, trades, fees, deposits, and redemptions.
   - Previous cycle's decision and result.

5. **Current operating limits**
   - Maximum positions.
   - Stable-asset minimum.
   - High-volatility exposure cap.
   - Per-asset caps.
   - Cycle and daily turnover limits.
   - Minimum trade size.
   - Maximum expected price impact and slippage.
   - Circuit-breaker and oracle status.

The full package is versioned and hashed so the exact context used for every decision can be reproduced and audited.

### Strict model output

The model must return structured data matching a fixed schema. A conceptual output is:

```json
{
  "cycle_id": 1204,
  "decision": "rebalance",
  "targets_bps": [
    {"asset_id": 0, "weight_bps": 2500},
    {"asset_id": 3, "weight_bps": 2000},
    {"asset_id": 7, "weight_bps": 1500},
    {"asset_id": 9, "weight_bps": 4000}
  ],
  "confidence_bps": 6800,
  "reason_codes": ["BRAIN_BALANCED", "VOLATILITY_ELEVATED"],
  "summary": "Canonical protocol-generated explanation."
}
```

Validation requires:

- Every asset ID exists in the supplied allowlist.
- Weights are non-negative integers and sum to 10,000 basis points.
- The output contains no contract calls, wallet instructions, new assets, or free-form executable content.
- The cycle ID and input hash match the scheduled request.
- The schema is valid before signing or submitting anything on-chain.
- The deterministic risk engine remains authoritative even when the output is schema-valid.

### Model provider boundary

The decision engine uses a provider adapter so the same request and response schema can be sent to:

- The primary Ornith model hosted on the user's local GPU45 appliance.
- A future approved model through OpenRouter.
- A future approved provider without changing the vault, brain, or execution contracts.

Provider-specific API formats stay behind the adapter. Every decision record includes the provider, exact model identifier, model configuration, prompt version, input hash, and output hash.

The recommended model configuration is low-temperature and schema-constrained. Model changes should be treated as strategy changes: test them in simulation, publish the change, and activate them through a timelock rather than silently switching.

The model and provider never receive a private key. They return a proposed allocation only.

### Selected primary model

- Provider: GPU45 local appliance.
- Base URL: `http://192.168.50.189:30001/v1`.
- Model: Ornith 1.0 35B MoE Q5_K_M.
- Live API model ID: `ornith-1.0-35b-Q5_K_M-688b8d0a`.
- Modality: text only.
- Context: 262,144 tokens.

The Responses adapter must ignore reasoning events and validate only the final assistant `output_text`. Tests confirmed that Ornith returns exact JSON when given sufficient output allowance; small output budgets may be exhausted by reasoning before the final message is emitted.

### Fail-closed behavior

The portfolio keeps its current holdings when:

- The model provider is unavailable.
- The local appliance is unreachable.
- The response is late, invalid, malformed, or fails schema validation.
- The input snapshot or oracle data is stale.
- The proposal references the wrong cycle, brain version, asset universe, or input hash.
- The deterministic engine cannot execute safely inside its limits.

A failed cycle records the reason and tries again at the next scheduled cycle. It does not fall back to an unconstrained prompt or arbitrary asset selection.

### Scheduled-trigger gas

- The scheduler or keeper pays transaction gas up front.
- The creator DAO's share of protocol revenue funds the automation and gas budget.
- A permissionless keeper design may reimburse the successful caller for actual gas plus a small capped incentive.
- Failed, duplicate, early, expired, or invalid proposals receive no reimbursement.
- The automation budget comes from the DAO's existing 50% share and does not reduce the brain-owner share.
- If a scheduled cycle is missed, a valid proposal may be submitted late before the next cycle supersedes it.

The AI itself remains off-chain because a smart contract cannot directly invoke a conventional language model. The proposal, target weights, verification, execution, and permanent result record are on-chain.

## Anytime on-chain user actions

Users do not wait for an AI cycle. The following actions remain independently available on-chain at any time:

- Deposit into the basket.
- Request or complete a redemption.
- Purchase an unowned brain piece.
- Buy an already-owned brain piece at its displayed price.
- Change a brain piece's preset decision.
- Claim brain-owner rewards.

Each user pays only the gas for their own action. A user action does not trigger, fund, or wait for the scheduled AI review.

### Live action pricing

- Deposits mint shares from current on-chain NAV using fresh approved oracle prices.
- Redemptions burn shares against current on-chain NAV, subject to the selected liquidity and queue rules.
- An action reverts rather than use an expired or invalid price.
- Brain purchases use the currently displayed on-chain price.
- Brain reward claims use the stored reward-per-weight accumulator.

### Interaction with scheduled proposals

- Every brain change increments `brainVersion`.
- A scheduled proposal uses the brain snapshot captured for that cycle.
- Brain purchases or setting changes after the snapshot affect the next scheduled cycle.
- Deposits and redemptions that occur after proposal creation do not change its percentage targets; execution applies those targets to current holdings and current NAV.
- The deterministic engine rechecks current liquidity, oracle freshness, limits, and slippage at execution time.

### Suggested hard risk envelope for a prototype

- No leverage, lending, shorting, options, or perpetuals.
- Approved spot assets only.
- Maximum 10 active positions.
- Maximum 20% in one asset.
- Minimum 20% in the base stable asset.
- Maximum 30% combined in high-volatility native or meme tokens.
- Maximum 10% portfolio turnover per scheduled review.
- Maximum 35% turnover per day.
- Minimum liquidity and volume requirements for every asset.
- Maximum price impact per order.
- Oracle staleness and cross-source deviation limits.
- Daily loss circuit breaker.
- Pause on sequencer, oracle, bridge, or price-feed anomalies.
- Governance timelock for asset-universe and risk-limit changes.

These are design defaults for simulation, not investment recommendations.

## The 42-piece brain

The brain should influence the agent inside the risk envelope. It must not be able to change custody, code, asset allowlists, oracle rules, or hard risk limits.

Each brain piece is a structured control rather than an open prompt. It has:

- An immutable affinity describing the dimension it influences.
- An immutable influence weight.
- A closed list of protocol-defined option IDs.
- One currently selected option.
- An owner address.
- A selection version and effective timestamp.

Owners cannot submit custom text, links, images, instructions, or prompt fragments. They can only switch their piece among its predefined options.

Example:

```text
Piece: Risk Temperament 02
Affinity: risk_temperament
Weight: 500 basis points
Allowed options:
  0 = defensive
  1 = balanced
  2 = aggressive_within_limits
Selected option: 1
```

Each option maps to a canonical, protocol-authored meaning used by the AI compiler. The on-chain state stores the affinity, option ID, weight, and version; the agent converts that structured state into its primary context.

### Suggested piece groups

| Group | Pieces | What owners can influence |
| --- | ---: | --- |
| Mandate and time horizon | 6 | Growth vs preservation, holding horizon, rebalance patience |
| Market worldview | 8 | Macro regimes, momentum vs value, sector theses |
| Asset preferences | 10 | Relative preferences among already approved assets and sectors |
| Soft risk posture | 6 | Where within the hard risk bands the agent should operate |
| Research method | 6 | Evidence weighting, contrarianism, confidence requirements |
| Voice and public behavior | 6 | Tone, explanation style, debate behavior, personality |
| **Total** | **42** | |

The affinity and option list define the full scope of a piece's control. A portfolio-oriented affinity affects target preferences inside the risk envelope. A personality-oriented affinity affects only the agent's public voice. Neither type can expand its own authority.

### Influence weights

- Each piece has an immutable weight based on its visual size.
- All 42 weights sum to 10,000 basis points.
- The compiled context exposes each affinity, selected option, and weight.
- Contradictory selections are aggregated by category rather than concatenated as raw prompts.
- A permanent constitution and risk policy outrank every owned piece.
- Consider a cap so that no single piece controls more than 15% of the owner-directed influence.

### Option behavior

- Every piece starts with a protocol-defined default option.
- Buying a piece does not automatically change its selection.
- A new owner may change the selection to another allowed option at any time.
- A selection change is an on-chain transaction paid by the owner.
- The change influences the next scheduled AI snapshot.
- Invalid option IDs revert.
- No option can reference an unapproved asset contract or bypass deterministic limits.
- Option definitions should be immutable at launch. If future option-version upgrades are allowed, they require the configured upgrade-admin timelock and must not silently change an owner's existing selection.

## Brain-piece pricing

### Decided model: always-for-sale pieces

- Every piece has an initial price based on its influence weight.
- Buying it transfers ownership immediately.
- The next listed purchase price becomes `last settled price x 1.20`.
- The current owner cannot block a purchase at the displayed price.
- Brain pieces may transfer only through the brain marketplace so owners cannot bypass the required price increase and distribution with an ordinary wallet transfer.
- Rewards accrued before the transfer remain claimable by the prior owner.
- The new owner begins earning brain rewards only after the purchase checkpoint.

This resembles a forced-sale or Harberger-style market. It needs very clear disclosure because an owner can be bought out at any time.

### Initial purchase

The full initial purchase price of every unowned brain piece goes to the creator DAO.

No part of an initial purchase is distributed to brain-piece owners. Brain-owner rewards begin with basket entry and redemption fees and with the 20% price increase on subsequent brain-piece purchases. This removes the self-rebate and empty-recipient problems from initial sales.

### Subsequent purchase

On every later purchase:

`new purchase price = previous settled price x 1.20`

- The seller receives the previous settled price.
- The 20% price increase is protocol revenue.
- Half of the price increase goes to the creator DAO.
- Half of the price increase goes to the brain-owner reward pool.
- The brain-owner distribution uses the ownership snapshot immediately before the transfer.

Example:

- Previous settled price: 100 USDG.
- Next buyer pays: 120 USDG.
- Seller receives: 100 USDG.
- Creator DAO receives: 10 USDG.
- Brain-owner reward pool receives: 10 USDG.
- The new settled price becomes 120 USDG and the next displayed purchase price becomes 144 USDG.

The brain reward pool is distributed among all pieces owned at the applicable snapshot in proportion to their immutable influence weights. An owner with multiple pieces receives the combined weight of those pieces.

The initial piece prices or the formula that derives them from influence weight remain undecided.

## Fee design

### Basket entry and redemption fees

The working fee model preserves a 2% round-trip charge:

- 1% when entering the basket.
- 1% when redeeming from the basket.

Each collected fee is split:

- 50% to the creator DAO.
- 50% to the brain-owner reward pool.

The brain pool is distributed to brain-piece owners in proportion to their immutable piece weights using the ownership snapshot at the time the fee accrues.

### NFT purchase revenue

The same 50/50 creator-DAO and brain-owner split applies to:

- Basket entry and redemption fees.
- Only the 20% price increase on every subsequent brain-piece purchase.

The full initial purchase price of an unowned brain piece goes to the creator DAO. The principal portion of a subsequent purchase is returned to the seller. This lets the protocol monetize price appreciation without taking the seller's recorded purchase basis.

### Reward accounting

- Accrue rewards with a global reward-per-weight index.
- Checkpoint a piece before every ownership transfer.
- Pay rewards in a stable asset when possible.
- Do not make users claim by iterating through all 42 pieces.
- State whether unclaimed rewards expire and what happens when a piece is transferred.

## Transparency requirements

The public dashboard should show:

- Current NAV and supply.
- Holdings, weights, marks, and price-source status.
- Deposits, redemptions, fees, and treasury liabilities.
- Current brain-piece owners, affinities, option selections, weights, and prices.
- The compiled decision state in structured form.
- Each scheduled proposal, its submitting keeper, gas cost, and confidence level.
- Risk-engine modifications and rejected proposals.
- Executed transactions linked to the block explorer.
- Slippage, turnover, realized and unrealized results.
- Circuit-breaker and pause status.
- Clear separation of deposits from investment performance.

## Security requirements

- Independent smart-contract audit before real value.
- Every protocol smart contract is upgradeable.
- Upgrade authority is creator-controlled in the MVP; a multisig and timelock are recommended.
- Separate roles for asset listing, risk policy, pausing, upgrades, and execution.
- No single hot key capable of withdrawing vault assets.
- Keeper permissions limited to approved venues and bounded trades.
- Oracle manipulation, flash-loan, donation, rounding, reentrancy, and MEV testing.
- Fuzz and invariant tests for mint, redeem, NAV, and reward accounting.
- Emergency pause and recovery procedures.
- Monitoring for asset depegs, price-feed failure, abnormal turnover, and stuck redemptions.
- Documented upgrade policy and user exit window before material changes.

## Upgradeability

All protocol smart contracts must be upgradeable, including the basket vault/share, brain NFT, marketplace, settings registry, reward distributor, asset registry, oracle adapter, risk controller, trade executor, automation module, and Creator DAO Vault.

The MVP uses creator-controlled upgrade authority. Upgrade implementations must preserve storage compatibility, use initializer protection, emit version and upgrade events, and be verified publicly. A multisig, timelock, and user exit window remain recommended because upgrade authority can change protocol behavior.

## Creator DAO Vault

The MVP DAO is a simple upgradeable creator-controlled revenue vault, not a governance system.

It receives:

- Full initial brain-piece purchase revenue.
- Half of basket entry and redemption fees.
- Half of the 20% markup on later brain-piece purchases.

The creator-controlled owner may withdraw available Creator DAO Vault funds. The vault must account only for creator-side protocol revenue and must not expose a normal withdrawal path into basket principal or brain-owner reward liabilities. Deposits, reimbursements, withdrawals, ownership transfers, and upgrades emit public events.

## Legal and operational gate

The current concept closely resembles a pooled, redeemable investment product: users contribute value, receive proportional shares, rely on portfolio management, and redeem near NAV. Holding tokenized stocks increases the chance that investment-company, securities-offering, investment-adviser, broker/dealer, custody, transfer-restriction, and investor-eligibility rules apply. Revenue rights for brain owners create an additional securities-like feature.

Before accepting real funds, obtain written analysis from counsel experienced in:

- U.S. securities and Investment Company Act issues.
- Investment-adviser and automated-advice rules.
- Broker/dealer, exchange, and transfer-agent questions.
- Tokenized-stock eligibility and geographic restrictions.
- Custody, KYC/AML, sanctions, and money-transmission rules.
- Commodity-pool rules if the universe ever includes derivatives.
- DAO entity structure, contributor compensation, and tax reporting.

Robinhood Chain being permissionless does not mean Robinhood approves, lists, distributes, or legally sponsors the product.

## Recommended validation sequence

### Phase 0: design and counsel

- Decide the legal jurisdiction, eligible users, entity, and asset universe.
- Choose the share-fee model.
- Choose forced-sale or voluntary resale for brain pieces.
- Finalize the 42-piece taxonomy and immutable influence weights.
- Write the constitution and deterministic risk policy.

### Phase 1: no-money simulation

- Use historical or delayed market data.
- Simulate scheduled proposals, anytime user actions, and deterministic risk filtering.
- Publish a shadow NAV and full decision ledger.
- Measure turnover, slippage assumptions, prompt stability, and manipulation resistance.

### Phase 2: Robinhood Chain testnet

- Use valueless test assets only.
- Test share mint/burn, queued redemptions, price failures, and reward checkpoints.
- Run adversarial and invariant tests.
- Do not market expected returns.

### Phase 3: closed pilot

- Proceed only under the structure approved by counsel.
- Use strict caps, allowlisted participants if required, and a narrow asset universe.
- Complete audits, incident response, monitoring, and operational runbooks.

### Phase 4: public launch

- Only after the legal path, liquidity, transfer compatibility, custody model, audits, and redemption behavior are proven.

## Remaining decisions needed before architecture

1. Who is legally allowed to buy and redeem the basket share?
2. Is the product intended for the United States, another jurisdiction, or both?
3. What is each piece's initial price, or what formula derives it from influence weight?
4. What are the exact 42 affinities, option lists, and immutable weights?
5. Are 1% entry and 1% redemption the final basket fee rates?
6. What asset pays the fees and brain rewards?
7. Is redemption in kind, in USDG, or hybrid?
8. Which assets are allowed at launch?
9. What happens when a holder cannot legally or technically receive one basket asset?
10. Who can update the asset allowlist and hard risk policy?
11. Which upgrade pattern, timelock, emergency process, and user exit period should apply?
12. What is the initial seed capital and initial share price?
13. What withdrawal safeguards, multisig structure, and upgrade delay should apply to the creator-controlled vault?
14. Can brain owners influence portfolio decisions, personality only, or both?
15. What is the final rebalance interval, keeper reimbursement formula, and missed-cycle policy?
16. Which OpenRouter model, if any, is approved as fallback, and is automatic provider fallback allowed?

## Working recommendation

For the first coherent version:

- Launch no real token yet.
- Simulate a 10-asset, long-only portfolio with USDG as the accounting asset.
- Use 42 weighted NFT-like brain pieces, each with an immutable affinity and closed on-chain option list.
- Run the AI review on a one-hour schedule independently of user activity.
- Use a provider adapter that can send the same constrained decision package to OpenRouter or the local appliance.
- Require a strict target-weight schema, complete context hashing, and fail-closed behavior.
- Fund scheduled keeper gas and bounded reimbursement from the creator DAO's existing fee share.
- Keep deposits, redemptions, brain-piece activity, and reward claims available on-chain at any time, with each user paying only their own action gas.
- Let a deterministic engine enforce all risk and execution rules.
- Rebalance only beyond thresholds.
- Model the basket share as a standard vault share.
- Use a transparent 1% entry and 1% redemption fee rather than a universal token-transfer tax.
- Split collected fees equally between the creator DAO and brain reward pool.
- Make every brain piece always purchasable through the marketplace at 120% of its last settled price.
- Send each initial brain-piece sale entirely to the creator DAO.
- On later brain-piece purchases, return the prior settled price to the seller and split only the 20% increase equally between the DAO and brain reward pool.
- Use a hybrid redemption queue in the design.
- Treat legal structure as the gating item before any real-funds implementation.

## References reviewed

- Brainfart mind and documentation: <https://brainfart.live/mind>
- Malory product and dashboard: <https://www.malory.trade/>
- Robinhood Chain documentation: <https://docs.robinhood.com/chain/>
- OpenZeppelin ERC-4626 documentation: <https://docs.openzeppelin.com/contracts/4.x/erc4626>
- SEC investment company overview: <https://www.sec.gov/about/divisions-offices/division-investment-management/investment-company-registration-regulation-package>
- Uniswap fee-on-transfer compatibility note: <https://support.uniswap.org/hc/en-us/articles/20981158150029-I-can-t-remove-my-liquidity-position>
