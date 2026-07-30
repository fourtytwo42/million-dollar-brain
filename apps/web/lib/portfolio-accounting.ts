import {
  decodeEventLog,
  formatUnits,
  keccak256,
  parseAbi,
  stringToHex,
  type Address,
} from "viem";
import { stableDecisionJson } from "./decision-math";
import { withDatabase } from "./persistence";
import { deployment, publicClient } from "./chain";

export type AccountingPositionV1 = {
  symbol: string;
  balanceWad: string;
  valueUsdWad: string;
  costBasisUsdWad: string;
  averageCostUsdWad: string | null;
  realizedPnlUsdWad: string;
  unrealizedPnlUsdWad: string;
  contributionUsdWad: string;
  basisOrigin: "activation_mark" | "tracked";
};

export type PortfolioAccountingV1 = {
  formulaVersion: "weighted-average-cost-v1";
  observedAt: string;
  activationBlock: string | null;
  navUsdWad: string;
  navPerShareWad: string;
  positions: Record<string, AccountingPositionV1>;
  realizedPnlUsdWad: string;
  unrealizedPnlUsdWad: string;
  totalPnlUsdWad: string;
  timeWeightedReturn1hBps: number | null;
  timeWeightedReturn24hBps: number | null;
  timeWeightedReturn7dBps: number | null;
  timeWeightedReturn30dBps: number | null;
  turnover24hBps: number | null;
  deposits24hUsdWad: string;
  redemptions24hUsdWad: string;
  fees24hUsdWad: string;
  gas24hWei: string;
  sourceHash: string;
};

export type DecisionOutcomeV2 = {
  horizon: "1h" | "24h";
  matured: boolean;
  actualReturnBps: number | null;
  noRebalanceReturnBps: number | null;
  previousAllocationReturnBps: number | null;
  benchmarkReturnsBps: Record<string, number | null>;
  turnoverBps: number | null;
  slippageBps: number | null;
  gasWei: string | null;
  drawdownChangeBps: number | null;
  assetContributionBps: Record<string, number | null>;
  unavailableReasons: string[];
};

type PortfolioState = {
  blockNumber?: string;
  nav: string;
  navPerShare: string;
  holdings: Record<string, string>;
  holdingValues: Record<string, string>;
};

const stableHash = (value: unknown) =>
  keccak256(stringToHex(stableDecisionJson(value)));

const vaultEvents = parseAbi([
  "event Deposited(address indexed account,uint256 gross,uint256 shares,uint256 fee)",
  "event DepositAssetPurchased(address indexed account,address indexed asset,uint256 usdgSpent,uint256 assetReceived)",
  "event Redeemed(address indexed account,uint256 shares,uint256 net,uint256 fee)",
  "event RedemptionAssetSold(address indexed account,address indexed asset,uint256 assetSold,uint256 usdgReceived)",
  "event QueuedRedemptionSettled(uint256 indexed requestId,address indexed account,uint256 shares,uint256 net,uint256 fee)",
  "event RebalanceAssetTraded(bytes32 indexed cycleHash,address indexed asset,bool isBuy,uint256 assetAmount,uint256 usdgAmount,uint256 valuationUsd)",
]);
const dexExecutionEvents = parseAbi([
  "event SwapExecuted(address indexed tokenIn,address indexed tokenOut,uint256 amountIn,uint256 amountOut,address firstPool,address secondPool,uint64 referenceBlock)",
]);

const sum = (values: bigint[]) =>
  values.reduce((total, value) => total + value, 0n);

function returnBps(current: bigint, prior: bigint) {
  return prior > 0n ? Number(((current - prior) * 10_000n) / prior) : null;
}

export async function buildPortfolioAccounting(
  state: PortfolioState,
): Promise<PortfolioAccountingV1> {
  const observedAt = new Date().toISOString();
  return (
    (await withDatabase(async (client) => {
      const priorResult = await client.query<{
        observed_at: string;
        block_number: string | null;
        activation_basis: boolean;
        snapshot: PortfolioAccountingV1;
      }>(
        `SELECT observed_at,block_number::text,activation_basis,snapshot
           FROM mdb_accounting_snapshots
          ORDER BY observed_at DESC LIMIT 1`,
      );
      const prior = priorResult.rows[0]?.snapshot ?? null;
      const activation = !prior;
      const positions: Record<string, AccountingPositionV1> = {};
      for (const symbol of Object.keys(state.holdings)) {
        const balance = BigInt(state.holdings[symbol] ?? "0");
        const value = BigInt(state.holdingValues[symbol] ?? "0");
        const old = prior?.positions[symbol];
        const oldBalance = BigInt(old?.balanceWad ?? "0");
        const oldBasis = BigInt(old?.costBasisUsdWad ?? "0");
        const oldRealized = BigInt(old?.realizedPnlUsdWad ?? "0");
        let basis = activation ? value : oldBasis;
        let realized = oldRealized;
        const delta = balance - oldBalance;
        if (!activation && delta > 0n) {
          const acquisitionValue =
            balance > 0n ? (value * delta) / balance : 0n;
          basis += acquisitionValue;
        } else if (!activation && delta < 0n && oldBalance > 0n) {
          const quantitySold = -delta;
          const removedBasis = (oldBasis * quantitySold) / oldBalance;
          const proceeds =
            balance > 0n
              ? (value * quantitySold) / balance
              : oldBalance > 0n
                ? (BigInt(old.valueUsdWad) * quantitySold) / oldBalance
                : 0n;
          basis = oldBasis > removedBasis ? oldBasis - removedBasis : 0n;
          realized += proceeds - removedBasis;
        }
        if (balance === 0n) basis = 0n;
        const unrealized = value - basis;
        positions[symbol] = {
          symbol,
          balanceWad: balance.toString(),
          valueUsdWad: value.toString(),
          costBasisUsdWad: basis.toString(),
          averageCostUsdWad:
            balance > 0n ? ((basis * 10n ** 18n) / balance).toString() : null,
          realizedPnlUsdWad: realized.toString(),
          unrealizedPnlUsdWad: unrealized.toString(),
          contributionUsdWad: (realized + unrealized).toString(),
          basisOrigin: activation ? "activation_mark" : "tracked",
        };
      }
      const portfolioRows = await client.query<{
        observed_at: string;
        snapshot: { navPerShareWad?: string };
      }>(
        `SELECT observed_at::text,snapshot
           FROM mdb_accounting_snapshots
          WHERE observed_at >= now() - interval '31 days'
            AND snapshot ? 'navPerShareWad'
          ORDER BY observed_at ASC`,
      );
      const currentPrice = BigInt(state.navPerShare);
      const atHorizon = (hours: number) => {
        const target = Date.now() - hours * 3_600_000;
        const row = [...portfolioRows.rows]
          .reverse()
          .find((candidate) => Date.parse(candidate.observed_at) <= target);
        return row?.snapshot.navPerShareWad
          ? returnBps(currentPrice, BigInt(row.snapshot.navPerShareWad))
          : null;
      };
      const flowRows = await client.query<{
        kind: string;
        gross: string;
        fee: string;
      }>(
        `SELECT kind,sum(gross_usdg_wad)::text AS gross,
                sum(fee_usdg_wad)::text AS fee
           FROM mdb_cash_flows
          WHERE observed_at >= now() - interval '24 hours'
          GROUP BY kind`,
      );
      const flow = Object.fromEntries(
        flowRows.rows.map((row) => [row.kind, row]),
      );
      const tradeRows = await client.query<{ usdg: string; gas: string }>(
        `SELECT coalesce(sum(usdg_amount_wad),0)::text AS usdg,
                coalesce(sum(gas_wei),0)::text AS gas
           FROM mdb_trade_ledger
          WHERE observed_at >= now() - interval '24 hours'`,
      );
      const totalRealized = sum(
        Object.values(positions).map((position) =>
          BigInt(position.realizedPnlUsdWad),
        ),
      );
      const totalUnrealized = sum(
        Object.values(positions).map((position) =>
          BigInt(position.unrealizedPnlUsdWad),
        ),
      );
      const partial = {
        formulaVersion: "weighted-average-cost-v1" as const,
        observedAt,
        activationBlock:
          priorResult.rows[0]?.block_number ?? state.blockNumber ?? null,
        navUsdWad: state.nav,
        navPerShareWad: state.navPerShare,
        positions,
        realizedPnlUsdWad: totalRealized.toString(),
        unrealizedPnlUsdWad: totalUnrealized.toString(),
        totalPnlUsdWad: (totalRealized + totalUnrealized).toString(),
        timeWeightedReturn1hBps: atHorizon(1),
        timeWeightedReturn24hBps: atHorizon(24),
        timeWeightedReturn7dBps: atHorizon(24 * 7),
        timeWeightedReturn30dBps: atHorizon(24 * 30),
        turnover24hBps:
          BigInt(state.nav) > 0n
            ? Number(
                (BigInt(tradeRows.rows[0]?.usdg ?? "0") * 10_000n) /
                  BigInt(state.nav),
              )
            : null,
        deposits24hUsdWad: flow.deposit?.gross ?? "0",
        redemptions24hUsdWad: flow.redemption?.gross ?? "0",
        fees24hUsdWad: (
          BigInt(flow.deposit?.fee ?? "0") + BigInt(flow.redemption?.fee ?? "0")
        ).toString(),
        gas24hWei: tradeRows.rows[0]?.gas ?? "0",
      };
      return { ...partial, sourceHash: stableHash(partial) };
    })) ?? {
      formulaVersion: "weighted-average-cost-v1",
      observedAt,
      activationBlock: null,
      navUsdWad: state.nav,
      navPerShareWad: state.navPerShare,
      positions: {},
      realizedPnlUsdWad: "0",
      unrealizedPnlUsdWad: "0",
      totalPnlUsdWad: "0",
      timeWeightedReturn1hBps: null,
      timeWeightedReturn24hBps: null,
      timeWeightedReturn7dBps: null,
      timeWeightedReturn30dBps: null,
      turnover24hBps: null,
      deposits24hUsdWad: "0",
      redemptions24hUsdWad: "0",
      fees24hUsdWad: "0",
      gas24hWei: "0",
      sourceHash: stableHash({ unavailable: true, observedAt }),
    }
  );
}

export async function portfolioPerformanceHistory() {
  return (
    (await withDatabase(async (client) => {
      const result = await client.query<{
        observed_at: string;
        nav_per_share_wad: string;
        nav_usd_wad: string;
        total_pnl_usd_wad: string;
      }>(
        `SELECT DISTINCT ON (
             date_trunc('hour',observed_at)
             + floor(extract(minute from observed_at) / 5) * interval '5 minutes'
           )
           observed_at::text,
           snapshot->>'navPerShareWad' AS nav_per_share_wad,
           snapshot->>'navUsdWad' AS nav_usd_wad,
           snapshot->>'totalPnlUsdWad' AS total_pnl_usd_wad
         FROM mdb_accounting_snapshots
        WHERE observed_at >= now() - interval '30 days'
          AND snapshot ? 'navPerShareWad'
        ORDER BY
          date_trunc('hour',observed_at)
          + floor(extract(minute from observed_at) / 5) * interval '5 minutes',
          observed_at DESC
        LIMIT 8640`,
      );
      return result.rows
        .map((row) => ({
          observedAt: new Date(row.observed_at).toISOString(),
          navPerShareWad: row.nav_per_share_wad,
          navUsdWad: row.nav_usd_wad,
          totalPnlUsdWad: row.total_pnl_usd_wad,
        }))
        .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
    })) ?? []
  );
}

export async function persistAccountingSnapshot(
  accounting: PortfolioAccountingV1,
  blockNumber?: string,
) {
  return withDatabase(async (client) => {
    const existing = await client.query<{ count: string }>(
      "SELECT count(*)::text AS count FROM mdb_accounting_snapshots",
    );
    await client.query(
      `INSERT INTO mdb_accounting_snapshots
        (observed_at,block_number,activation_basis,snapshot,source_hash)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT(observed_at) DO NOTHING`,
      [
        accounting.observedAt,
        blockNumber ?? accounting.activationBlock,
        Number(existing.rows[0]?.count ?? 0) === 0,
        JSON.stringify(accounting),
        accounting.sourceHash,
      ],
    );
  });
}

export async function syncVaultLedger() {
  const d = deployment();
  const currentBlock = await publicClient.getBlockNumber();
  return withDatabase(async (client) => {
    const state = await client.query<{
      details: { lastIndexedBlock?: string };
    }>("SELECT details FROM mdb_worker_state WHERE worker='vault-ledger'");
    const cursor = state.rows[0]?.details?.lastIndexedBlock;
    if (!cursor) {
      await client.query(
        `INSERT INTO mdb_worker_state
          (worker,last_started_at,last_succeeded_at,details)
         VALUES ('vault-ledger',now(),now(),$1)
         ON CONFLICT(worker) DO UPDATE SET
           last_succeeded_at=excluded.last_succeeded_at,details=excluded.details`,
        [
          JSON.stringify({
            lastIndexedBlock: currentBlock.toString(),
            activation: true,
          }),
        ],
      );
      return { initializedAt: currentBlock.toString(), indexed: 0 };
    }
    const fromBlock = BigInt(cursor) + 1n;
    if (fromBlock > currentBlock) return { indexed: 0, through: cursor };
    const logs = await publicClient.getLogs({
      address: d.basket,
      fromBlock,
      toBlock: currentBlock,
    });
    const manifestAssets = d.assets ?? [];
    const symbols = new Map(
      manifestAssets.map((asset) => [
        asset.address.toLowerCase(),
        asset.symbol,
      ]),
    );
    const assetsByAddress = new Map(
      manifestAssets.map((asset) => [asset.address.toLowerCase(), asset]),
    );
    const blockTimes = new Map<bigint, Date>();
    const gasByTx = new Map<string, bigint>();
    const gasRecorded = new Set<string>();
    const dexReceiptsRecorded = new Set<string>();
    let indexed = 0;
    await client.query("BEGIN");
    try {
      for (const log of logs) {
        let decoded;
        try {
          decoded = decodeEventLog({
            abi: vaultEvents,
            data: log.data,
            topics: log.topics,
          });
        } catch {
          continue;
        }
        const blockNumber = log.blockNumber;
        const txHash = log.transactionHash;
        if (!blockNumber || !txHash) continue;
        let observedAt = blockTimes.get(blockNumber);
        if (!observedAt) {
          const block = await publicClient.getBlock({ blockNumber });
          observedAt = new Date(Number(block.timestamp) * 1_000);
          blockTimes.set(blockNumber, observedAt);
        }
        if (!gasByTx.has(txHash)) {
          const receipt = await publicClient.getTransactionReceipt({
            hash: txHash,
          });
          gasByTx.set(
            txHash,
            receipt.gasUsed * (receipt.effectiveGasPrice ?? 0n),
          );
          if (d.dexExecutionAdapter && !dexReceiptsRecorded.has(txHash)) {
            for (const receiptLog of receipt.logs) {
              if (
                receiptLog.address.toLowerCase() !==
                d.dexExecutionAdapter.toLowerCase()
              ) {
                continue;
              }
              let swap;
              try {
                swap = decodeEventLog({
                  abi: dexExecutionEvents,
                  eventName: "SwapExecuted",
                  data: receiptLog.data,
                  topics: receiptLog.topics,
                });
              } catch {
                continue;
              }
              const swapArgs = swap.args as {
                tokenIn: Address;
                tokenOut: Address;
                amountIn: bigint;
                amountOut: bigint;
                firstPool: Address;
                secondPool: Address;
                referenceBlock: bigint;
              };
              const tokenIn = assetsByAddress.get(
                swapArgs.tokenIn.toLowerCase(),
              );
              const tokenOut = assetsByAddress.get(
                swapArgs.tokenOut.toLowerCase(),
              );
              if (!tokenIn || !tokenOut) continue;
              const input = Number(
                formatUnits(swapArgs.amountIn, tokenIn.decimals),
              );
              const output = Number(
                formatUnits(swapArgs.amountOut, tokenOut.decimals),
              );
              const effectivePrice =
                tokenIn.kind === "reserve" ? input / output : output / input;
              await client.query(
                `INSERT INTO mdb_dex_execution_receipts_v6
                  (tx_hash,log_index,block_number,observed_at,token_in,token_out,
                   amount_in,amount_out,first_pool,second_pool,reference_block,
                   effective_price,receipt)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
                 ON CONFLICT(tx_hash,log_index) DO NOTHING`,
                [
                  txHash,
                  receiptLog.logIndex,
                  blockNumber.toString(),
                  observedAt,
                  swapArgs.tokenIn.toLowerCase(),
                  swapArgs.tokenOut.toLowerCase(),
                  swapArgs.amountIn.toString(),
                  swapArgs.amountOut.toString(),
                  swapArgs.firstPool.toLowerCase(),
                  swapArgs.secondPool.toLowerCase(),
                  swapArgs.referenceBlock.toString(),
                  effectivePrice,
                  JSON.stringify({
                    eventName: "SwapExecuted",
                    tokenIn: tokenIn.symbol,
                    tokenOut: tokenOut.symbol,
                    amountIn: swapArgs.amountIn.toString(),
                    amountOut: swapArgs.amountOut.toString(),
                    effectivePrice,
                  }),
                ],
              );
            }
            dexReceiptsRecorded.add(txHash);
          }
        }
        const args = decoded.args as Record<string, unknown>;
        if (
          decoded.eventName === "Deposited" ||
          decoded.eventName === "Redeemed" ||
          decoded.eventName === "QueuedRedemptionSettled"
        ) {
          const net = BigInt((args.net as bigint | undefined) ?? 0n);
          const fee = BigInt(args.fee as bigint);
          const gross =
            decoded.eventName === "Deposited"
              ? BigInt(args.gross as bigint)
              : net + fee;
          await client.query(
            `INSERT INTO mdb_cash_flows
              (tx_hash,log_index,block_number,observed_at,kind,account,
               gross_usdg_wad,fee_usdg_wad,shares_wad)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT(tx_hash,log_index) DO NOTHING`,
            [
              txHash,
              log.logIndex,
              blockNumber.toString(),
              observedAt,
              decoded.eventName === "Deposited" ? "deposit" : "redemption",
              String(args.account),
              gross.toString(),
              fee.toString(),
              String(args.shares),
            ],
          );
          indexed += 1;
          continue;
        }
        const asset = String(args.asset ?? "").toLowerCase() as Address;
        const symbol = symbols.get(asset);
        if (!symbol) continue;
        const isBuy =
          decoded.eventName === "DepositAssetPurchased" ||
          (decoded.eventName === "RebalanceAssetTraded" && args.isBuy === true);
        const assetAmount = BigInt(
          (args.assetReceived as bigint | undefined) ??
            (args.assetSold as bigint | undefined) ??
            (args.assetAmount as bigint | undefined) ??
            0n,
        );
        const usdgAmount = BigInt(
          (args.usdgSpent as bigint | undefined) ??
            (args.usdgReceived as bigint | undefined) ??
            (args.usdgAmount as bigint | undefined) ??
            0n,
        );
        const gas = gasRecorded.has(txHash) ? 0n : (gasByTx.get(txHash) ?? 0n);
        gasRecorded.add(txHash);
        await client.query(
          `INSERT INTO mdb_trade_ledger
            (tx_hash,log_index,block_number,observed_at,operation,symbol,side,
             asset_amount_wad,usdg_amount_wad,valuation_usd_wad,gas_wei,metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           ON CONFLICT(tx_hash,log_index) DO NOTHING`,
          [
            txHash,
            log.logIndex,
            blockNumber.toString(),
            observedAt,
            decoded.eventName === "RebalanceAssetTraded"
              ? "rebalance"
              : decoded.eventName === "DepositAssetPurchased"
                ? "deposit"
                : "redemption",
            symbol,
            isBuy ? "buy" : "sell",
            assetAmount.toString(),
            usdgAmount.toString(),
            String(args.valuationUsd ?? usdgAmount),
            gas.toString(),
            JSON.stringify({ eventName: decoded.eventName }),
          ],
        );
        indexed += 1;
      }
      await client.query(
        `INSERT INTO mdb_worker_state
          (worker,last_started_at,last_succeeded_at,details)
         VALUES ('vault-ledger',now(),now(),$1)
         ON CONFLICT(worker) DO UPDATE SET
           last_succeeded_at=excluded.last_succeeded_at,details=excluded.details`,
        [
          JSON.stringify({
            lastIndexedBlock: currentBlock.toString(),
            indexed,
          }),
        ],
      );
      await client.query("COMMIT");
      return { indexed, through: currentBlock.toString() };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export function emptyDecisionOutcomes(): {
  oneHour: DecisionOutcomeV2;
  twentyFourHour: DecisionOutcomeV2;
} {
  const make = (horizon: "1h" | "24h"): DecisionOutcomeV2 => ({
    horizon,
    matured: false,
    actualReturnBps: null,
    noRebalanceReturnBps: null,
    previousAllocationReturnBps: null,
    benchmarkReturnsBps: {
      SPY: null,
      QQQ: null,
      SOXX: null,
      "ETH-USD": null,
    },
    turnoverBps: null,
    slippageBps: null,
    gasWei: null,
    drawdownChangeBps: null,
    assetContributionBps: {},
    unavailableReasons: [
      "Outcome horizon has not matured with sufficient official history.",
    ],
  });
  return { oneHour: make("1h"), twentyFourHour: make("24h") };
}

export async function matureDecisionOutcomes() {
  return (
    (await withDatabase(async (client) => {
      const cycles = await client.query<{
        input_hash: string;
        created_at: string;
        portfolio_after: { navPerShareWad?: string };
      }>(
        `SELECT input_hash,created_at::text,portfolio_after
           FROM mdb_cycle_records
          WHERE created_at <= now() - interval '1 hour'
          ORDER BY created_at DESC LIMIT 100`,
      );
      let matured = 0;
      for (const cycle of cycles.rows) {
        for (const horizon of ["1h", "24h"] as const) {
          const hours = horizon === "1h" ? 1 : 24;
          if (Date.parse(cycle.created_at) > Date.now() - hours * 3_600_000) {
            continue;
          }
          const existing = await client.query(
            "SELECT 1 FROM mdb_decision_outcomes WHERE input_hash=$1 AND horizon=$2",
            [cycle.input_hash, horizon],
          );
          if (existing.rowCount) continue;
          const target = new Date(
            Date.parse(cycle.created_at) + hours * 3_600_000,
          );
          const snapshot = await client.query<{
            snapshot: { navPerShareWad?: string };
          }>(
            `SELECT snapshot FROM mdb_portfolio_snapshots
              WHERE phase='after' AND observed_at >= $1
              ORDER BY observed_at ASC LIMIT 1`,
            [target],
          );
          const startPrice = cycle.portfolio_after.navPerShareWad;
          const endPrice = snapshot.rows[0]?.snapshot.navPerShareWad;
          if (!startPrice || !endPrice) continue;
          const benchmarkReturnsBps: Record<string, number | null> = {};
          for (const symbol of ["SPY", "QQQ", "SOXX"]) {
            const prices = await client.query<{ close: string }>(
              `(
                 SELECT close FROM mdb_price_candles
                  WHERE symbol=$1 AND interval='1h' AND bucket_start <= $2
                  ORDER BY bucket_start DESC LIMIT 1
               ) UNION ALL (
                 SELECT close FROM mdb_price_candles
                  WHERE symbol=$1 AND interval='1h' AND bucket_start >= $3
                  ORDER BY bucket_start ASC LIMIT 1
               )`,
              [symbol, cycle.created_at, target],
            );
            benchmarkReturnsBps[symbol] =
              prices.rows.length === 2
                ? Math.round(
                    (Number(prices.rows[1].close) /
                      Number(prices.rows[0].close) -
                      1) *
                      10_000,
                  )
                : null;
          }
          benchmarkReturnsBps["ETH-USD"] = null;
          const outcome: DecisionOutcomeV2 = {
            horizon,
            matured: true,
            actualReturnBps: returnBps(BigInt(endPrice), BigInt(startPrice)),
            noRebalanceReturnBps: null,
            previousAllocationReturnBps: null,
            benchmarkReturnsBps,
            turnoverBps: null,
            slippageBps: null,
            gasWei: null,
            drawdownChangeBps: null,
            assetContributionBps: {},
            unavailableReasons: [
              "No-rebalance attribution waits for aligned history for every held asset.",
              "ETH benchmark outcome is omitted until official Coinbase observations are persisted locally.",
            ],
          };
          await client.query(
            `INSERT INTO mdb_decision_outcomes
              (input_hash,horizon,matured_at,outcome,source_hash)
             VALUES ($1,$2,now(),$3,$4)
             ON CONFLICT(input_hash,horizon) DO NOTHING`,
            [
              cycle.input_hash,
              horizon,
              JSON.stringify(outcome),
              stableHash(outcome),
            ],
          );
          matured += 1;
        }
      }
      return matured;
    })) ?? 0
  );
}

export async function decisionOutcomeMap() {
  return (
    (await withDatabase(async (client) => {
      const result = await client.query<{
        input_hash: string;
        horizon: "1h" | "24h";
        outcome: DecisionOutcomeV2;
      }>("SELECT input_hash,horizon,outcome FROM mdb_decision_outcomes");
      const mapped: Record<
        string,
        { oneHour?: DecisionOutcomeV2; twentyFourHour?: DecisionOutcomeV2 }
      > = {};
      for (const row of result.rows) {
        mapped[row.input_hash] ??= {};
        if (row.horizon === "1h") mapped[row.input_hash].oneHour = row.outcome;
        else mapped[row.input_hash].twentyFourHour = row.outcome;
      }
      return mapped;
    })) ?? {}
  );
}
