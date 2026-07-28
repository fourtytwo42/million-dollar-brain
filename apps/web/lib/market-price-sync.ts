import { keccak256, parseAbi, stringToHex, type Address } from "viem";
import {
  adminClient,
  deployment,
  publicClient,
  waitForReliableTransactionReceipt,
} from "./chain";
import { coinbaseEthTicker } from "./market-sources";
import { withDatabase } from "./persistence";
import {
  changedByAtLeastOneBps,
  decimalWad,
  needsOracleFreshnessRefresh,
  retryRpcConsistency,
} from "./price-sync-math";
import { networkConfig } from "./network";
import { withAdminTransactionLock } from "./admin-transaction-lock";

const oracleAbi = parseAbi([
  "function prices(address token) view returns (uint256 priceWad,uint256 updatedAt,bool valid)",
  "function setPrice(address token,uint256 priceWad)",
]);
const routerPriceAbi = parseAbi([
  "function priceWad(address token) view returns (uint256)",
  "function setPrice(address token,uint256 priceWad)",
]);
const publisherAbi = parseAbi([
  "function publish(address[] tokens,uint256[] prices,bytes32 evidenceHash)",
]);

type PriceCandidate = {
  symbol: string;
  token: Address;
  priceWad: bigint;
  source: string;
  sourceObservedAt: string;
  sourceHash: string;
};

function hash(value: unknown) {
  return keccak256(stringToHex(JSON.stringify(value)));
}

async function candidates() {
  const d = deployment();
  const stockAssets = d.assets?.filter(
    (asset) => asset.kind === "stock" || asset.kind === "etf",
  ) ?? [
    { symbol: "NVDA", address: d.nvda },
    { symbol: "AAPL", address: d.aapl },
  ];
  const stockSymbols = stockAssets.map((asset) => asset.symbol);
  const stockRows =
    (await withDatabase(async (client) => {
      const result = await client.query<{
        symbol: string;
        price: string;
        observed_at: string;
        source_hash: string;
      }>(
        `SELECT DISTINCT ON (symbol) symbol,
                adjusted_midpoint::text AS price,
                source_generated_at::text AS observed_at,
                source_hash
           FROM mdb_quote_observations
          WHERE symbol = ANY($1::text[])
            AND valid=true AND halted=false
          ORDER BY symbol,source_generated_at DESC`,
        [stockSymbols],
      );
      return result.rows;
    })) ?? [];
  if (stockRows.length !== stockAssets.length) {
    throw new Error(
      `fresh official observations required for ${stockSymbols.join(", ")}`,
    );
  }
  const now = Date.now();
  const stocks = stockRows.map((row) => {
    if (now - Date.parse(row.observed_at) > 120_000) {
      throw new Error(`${row.symbol} quote is older than 120 seconds`);
    }
    const configured = stockAssets.find((asset) => asset.symbol === row.symbol);
    if (!configured) throw new Error(`${row.symbol} is not in the manifest`);
    return {
      symbol: row.symbol,
      token: configured.address,
      priceWad: decimalWad(row.price),
      source: "Robinhood Stock Token API",
      sourceObservedAt: new Date(row.observed_at).toISOString(),
      sourceHash: row.source_hash,
    } satisfies PriceCandidate;
  });
  const eth = await coinbaseEthTicker();
  if (!eth.valid || !eth.value?.price || !eth.value.time) {
    throw new Error(
      `ETH-USD ticker unavailable: ${eth.error ?? "invalid response"}`,
    );
  }
  if (now - Date.parse(eth.value.time) > 120_000) {
    throw new Error("ETH-USD ticker is older than 120 seconds");
  }
  const ethValue = eth.value;
  const cryptoAssets = d.assets?.filter((asset) => asset.kind === "crypto") ?? [
    { symbol: "ETHX", address: d.ethx },
  ];
  if (cryptoAssets.some((asset) => !["WETH", "ETHX"].includes(asset.symbol))) {
    throw new Error(
      "no approved official price source for a configured crypto asset",
    );
  }
  return [
    ...stocks,
    ...cryptoAssets.map(
      (asset) =>
        ({
          symbol: asset.symbol,
          token: asset.address,
          priceWad: decimalWad(ethValue.price),
          source: "Coinbase Exchange ETH-USD ticker",
          sourceObservedAt: new Date(ethValue.time).toISOString(),
          sourceHash: hash(ethValue),
        }) satisfies PriceCandidate,
    ),
  ];
}

async function syncLocalMarketPricesUnlocked() {
  if (process.env.MDB_LOCAL_PRICE_SYNC_ENABLED === "false") {
    return { enabled: false, updated: [], unchanged: [] };
  }
  const chainId = await publicClient.getChainId();
  if (chainId === 4663) {
    return {
      enabled: false,
      updated: [],
      unchanged: [],
      reason: "mock-price synchronization is permanently disabled on mainnet",
    };
  }
  const permitted =
    chainId === 31337 ||
    (chainId === 46630 &&
      networkConfig.mode === "testnet" &&
      networkConfig.mockAssets);
  if (!permitted) {
    return {
      enabled: false,
      updated: [],
      unchanged: [],
      reason: "mock-price synchronization is not permitted on this network",
    };
  }
  const started = Date.now();
  await withDatabase((client) =>
    client.query(
      `INSERT INTO mdb_worker_state(worker,last_started_at,details)
       VALUES ('market-price-sync',now(),'{}')
       ON CONFLICT(worker) DO UPDATE SET last_started_at=excluded.last_started_at`,
    ),
  );
  try {
    const d = deployment();
    const oracle = d.oracle;
    if (!oracle) throw new Error("local valuation oracle is not configured");
    const prices = await candidates();
    if (d.pricePublisher) {
      const stateBlock = await publicClient.getBlockNumber();
      const previous = await Promise.all(
        prices.map(async (candidate) => {
          const [oraclePrice, routerPrice] = await retryRpcConsistency(() =>
            Promise.all([
              publicClient.readContract({
                address: oracle,
                abi: oracleAbi,
                functionName: "prices",
                args: [candidate.token],
                blockNumber: stateBlock,
              }),
              publicClient.readContract({
                address: d.router,
                abi: routerPriceAbi,
                functionName: "priceWad",
                args: [candidate.token],
                blockNumber: stateBlock,
              }),
            ]),
          );
          return { oraclePrice, routerPrice };
        }),
      );
      const evidenceHash = hash(
        prices.map((price) => ({
          symbol: price.symbol,
          priceWad: price.priceWad.toString(),
          sourceHash: price.sourceHash,
        })),
      );
      const publisherTxHash = await adminClient.writeContract({
        address: d.pricePublisher,
        abi: publisherAbi,
        functionName: "publish",
        args: [
          prices.map((price) => price.token),
          prices.map((price) => price.priceWad),
          evidenceHash,
        ],
      });
      const receipt = await waitForReliableTransactionReceipt(publisherTxHash);
      await retryRpcConsistency(async () => {
        const verified = await Promise.all(
          prices.map((candidate) =>
            Promise.all([
              publicClient.readContract({
                address: oracle,
                abi: oracleAbi,
                functionName: "prices",
                args: [candidate.token],
                blockNumber: receipt.blockNumber,
              }),
              publicClient.readContract({
                address: d.router,
                abi: routerPriceAbi,
                functionName: "priceWad",
                args: [candidate.token],
                blockNumber: receipt.blockNumber,
              }),
            ]),
          ),
        );
        verified.forEach(([oraclePrice, routerPrice], index) => {
          if (
            oraclePrice[0] !== prices[index].priceWad ||
            routerPrice !== prices[index].priceWad
          ) {
            throw new Error(
              `${prices[index].symbol} batch verification failed`,
            );
          }
        });
      });
      await Promise.all(
        prices.map((candidate, index) =>
          withDatabase((client) =>
            client.query(
              `INSERT INTO mdb_price_syncs
                (symbol,source,source_observed_at,price_wad,
                 previous_oracle_price_wad,previous_router_price_wad,
                 oracle_tx_hash,router_tx_hash,status,source_hash,details)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'updated',$9,$10)`,
              [
                candidate.symbol,
                candidate.source,
                candidate.sourceObservedAt,
                candidate.priceWad.toString(),
                previous[index].oraclePrice[0].toString(),
                previous[index].routerPrice.toString(),
                publisherTxHash,
                publisherTxHash,
                candidate.sourceHash,
                JSON.stringify({
                  chainId,
                  batchPublisher: d.pricePublisher,
                  evidenceHash,
                }),
              ],
            ),
          ),
        ),
      );
      const details = {
        updated: prices.map((price) => price.symbol),
        unchanged: [] as string[],
        durationMs: Date.now() - started,
        publisherTxHash,
        evidenceHash,
        sources: prices.map((price) => ({
          symbol: price.symbol,
          source: price.source,
          observedAt: price.sourceObservedAt,
          priceWad: price.priceWad.toString(),
        })),
      };
      await withDatabase((client) =>
        client.query(
          `UPDATE mdb_worker_state SET last_succeeded_at=now(),
             last_error=null,duration_ms=$1,details=$2
           WHERE worker='market-price-sync'`,
          [Date.now() - started, JSON.stringify(details)],
        ),
      );
      return { enabled: true, ...details };
    }
    const updated: string[] = [];
    const unchanged: string[] = [];
    for (const candidate of prices) {
      const stateBlock = await publicClient.getBlockNumber();
      const [oraclePrice, routerPrice] = await retryRpcConsistency(() =>
        Promise.all([
          publicClient.readContract({
            address: oracle,
            abi: oracleAbi,
            functionName: "prices",
            args: [candidate.token],
            blockNumber: stateBlock,
          }),
          publicClient.readContract({
            address: d.router,
            abi: routerPriceAbi,
            functionName: "priceWad",
            args: [candidate.token],
            blockNumber: stateBlock,
          }),
        ]),
      );
      const oracleNeedsPriceUpdate = changedByAtLeastOneBps(
        oraclePrice[0],
        candidate.priceWad,
      );
      const oracleNeedsFreshnessRefresh = needsOracleFreshnessRefresh(
        chainId,
        Number(oraclePrice[1]),
        Math.floor(Date.now() / 1000),
      );
      const routerNeedsPriceUpdate =
        oraclePrice[0] !== routerPrice ||
        changedByAtLeastOneBps(routerPrice, candidate.priceWad) ||
        (oracleNeedsFreshnessRefresh && routerPrice !== candidate.priceWad);
      const shouldUpdate =
        oracleNeedsPriceUpdate ||
        routerNeedsPriceUpdate ||
        oracleNeedsFreshnessRefresh;
      let oracleTxHash: `0x${string}` | null = null;
      let routerTxHash: `0x${string}` | null = null;
      let verificationBlock: bigint | undefined;
      if (shouldUpdate) {
        if (oracleNeedsPriceUpdate || oracleNeedsFreshnessRefresh) {
          oracleTxHash = await adminClient.writeContract({
            address: oracle,
            abi: oracleAbi,
            functionName: "setPrice",
            args: [candidate.token, candidate.priceWad],
          });
          const receipt = await waitForReliableTransactionReceipt(oracleTxHash);
          verificationBlock = receipt.blockNumber;
        }
        try {
          if (routerNeedsPriceUpdate) {
            routerTxHash = await adminClient.writeContract({
              address: d.router,
              abi: routerPriceAbi,
              functionName: "setPrice",
              args: [candidate.token, candidate.priceWad],
            });
            const receipt =
              await waitForReliableTransactionReceipt(routerTxHash);
            verificationBlock =
              verificationBlock === undefined ||
              receipt.blockNumber > verificationBlock
                ? receipt.blockNumber
                : verificationBlock;
          }
          await retryRpcConsistency(async () => {
            const [verifiedOracle, verifiedRouter] = await Promise.all([
              publicClient.readContract({
                address: oracle,
                abi: oracleAbi,
                functionName: "prices",
                args: [candidate.token],
                blockNumber: verificationBlock,
              }),
              publicClient.readContract({
                address: d.router,
                abi: routerPriceAbi,
                functionName: "priceWad",
                args: [candidate.token],
                blockNumber: verificationBlock,
              }),
            ]);
            if (
              verifiedOracle[0] !== candidate.priceWad ||
              verifiedRouter !== candidate.priceWad
            ) {
              throw new Error(`${candidate.symbol} price verification failed`);
            }
          });
        } catch (error) {
          if (oracleTxHash) {
            const oracleRollback = await adminClient.writeContract({
              address: oracle,
              abi: oracleAbi,
              functionName: "setPrice",
              args: [candidate.token, oraclePrice[0]],
            });
            await waitForReliableTransactionReceipt(oracleRollback);
          }
          if (routerTxHash) {
            const routerRollback = await adminClient.writeContract({
              address: d.router,
              abi: routerPriceAbi,
              functionName: "setPrice",
              args: [candidate.token, routerPrice],
            });
            await waitForReliableTransactionReceipt(routerRollback);
          }
          throw error;
        }
        updated.push(candidate.symbol);
      } else {
        unchanged.push(candidate.symbol);
      }
      await withDatabase((client) =>
        client.query(
          `INSERT INTO mdb_price_syncs
            (symbol,source,source_observed_at,price_wad,
             previous_oracle_price_wad,previous_router_price_wad,
             oracle_tx_hash,router_tx_hash,status,source_hash,details)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [
            candidate.symbol,
            candidate.source,
            candidate.sourceObservedAt,
            candidate.priceWad.toString(),
            oraclePrice[0].toString(),
            routerPrice.toString(),
            oracleTxHash,
            routerTxHash,
            shouldUpdate ? "updated" : "unchanged",
            candidate.sourceHash,
            JSON.stringify({ chainId, thresholdBps: 1 }),
          ],
        ),
      );
    }
    const details = {
      updated,
      unchanged,
      durationMs: Date.now() - started,
      sources: prices.map((price) => ({
        symbol: price.symbol,
        source: price.source,
        observedAt: price.sourceObservedAt,
        priceWad: price.priceWad.toString(),
      })),
    };
    await withDatabase((client) =>
      client.query(
        `UPDATE mdb_worker_state SET last_succeeded_at=now(),
           last_error=null,duration_ms=$1,details=$2
         WHERE worker='market-price-sync'`,
        [Date.now() - started, JSON.stringify(details)],
      ),
    );
    return { enabled: true, ...details };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "price sync failed";
    await withDatabase((client) =>
      client.query(
        `UPDATE mdb_worker_state SET last_failed_at=now(),
           last_error=$1,duration_ms=$2
         WHERE worker='market-price-sync'`,
        [message, Date.now() - started],
      ),
    );
    throw error;
  }
}

export async function syncLocalMarketPrices() {
  return withAdminTransactionLock(syncLocalMarketPricesUnlocked);
}

export async function localPriceSyncHealth() {
  return (
    (await withDatabase(async (client) => {
      const [worker, prices] = await Promise.all([
        client.query<{
          last_started_at: string | null;
          last_succeeded_at: string | null;
          last_failed_at: string | null;
          last_error: string | null;
          duration_ms: number | null;
          details: unknown;
        }>("SELECT * FROM mdb_worker_state WHERE worker='market-price-sync'"),
        client.query<{
          symbol: string;
          source: string;
          source_observed_at: string;
          price_wad: string;
          oracle_tx_hash: string | null;
          router_tx_hash: string | null;
          status: string;
        }>(
          `SELECT DISTINCT ON (symbol) symbol,source,
                  source_observed_at::text,price_wad::text,
                  oracle_tx_hash,router_tx_hash,status
             FROM mdb_price_syncs
            ORDER BY symbol,observed_at DESC`,
        ),
      ]);
      return { worker: worker.rows[0] ?? null, prices: prices.rows };
    })) ?? { worker: null, prices: [] }
  );
}
