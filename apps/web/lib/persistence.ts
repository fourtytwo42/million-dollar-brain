import { Pool, type PoolClient } from "pg";
import type {
  AssetQualificationV1,
  AssetQualificationV3,
  AssetQualificationWindowV2,
  AssetRecordV1,
} from "./asset-universe.ts";
import type {
  ResearchRequestV1,
  ResearchResultV1,
} from "./decision-research.ts";

type PersistedCycle = {
  inputHash: string;
  promptHash: string;
  modelConfig: unknown;
  rawOutput: string;
  validatedAllocation: unknown;
  decisionContext: {
    generatedAt: string;
    portfolio: unknown;
    assets: { symbol: string; provenance: unknown }[];
    sourceManifest: unknown;
  };
  portfolioAfter: unknown;
  txHash: string;
  receipt: unknown;
};

let pool: Pool | null | undefined;
let schemaReady: Promise<void> | null = null;
const json = (value: unknown) => JSON.stringify(value);

function database() {
  if (pool !== undefined) return pool;
  const connectionString = process.env.DATABASE_URL;
  pool = connectionString
    ? new Pool({ connectionString, max: 4, idleTimeoutMillis: 10_000 })
    : null;
  return pool;
}

async function ensureSchema(client: PoolClient) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS mdb_schema_migrations (
      version integer PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
    CREATE TABLE IF NOT EXISTS mdb_cycle_records (
      input_hash text PRIMARY KEY,
      created_at timestamptz NOT NULL,
      prompt_hash text NOT NULL,
      model_config jsonb NOT NULL,
      raw_output text NOT NULL,
      validated_allocation jsonb NOT NULL,
      decision_context jsonb NOT NULL,
      portfolio_before jsonb NOT NULL,
      portfolio_after jsonb NOT NULL,
      tx_hash text NOT NULL,
      receipt jsonb NOT NULL,
      source_manifest jsonb NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mdb_market_observations (
      input_hash text NOT NULL REFERENCES mdb_cycle_records(input_hash) ON DELETE CASCADE,
      symbol text NOT NULL,
      observed_at timestamptz NOT NULL,
      dossier jsonb NOT NULL,
      provenance jsonb NOT NULL,
      PRIMARY KEY (input_hash, symbol)
    );
    CREATE TABLE IF NOT EXISTS mdb_portfolio_snapshots (
      input_hash text NOT NULL REFERENCES mdb_cycle_records(input_hash) ON DELETE CASCADE,
      phase text NOT NULL CHECK (phase IN ('before', 'after')),
      observed_at timestamptz NOT NULL,
      snapshot jsonb NOT NULL,
      PRIMARY KEY (input_hash, phase)
    );
    CREATE INDEX IF NOT EXISTS mdb_cycle_records_created_at_idx
      ON mdb_cycle_records (created_at DESC);

    CREATE TABLE IF NOT EXISTS mdb_asset_registry (
      symbol text PRIMARY KEY,
      role text NOT NULL CHECK (role IN ('executable', 'reference')),
      source text NOT NULL,
      source_uid text,
      token_name text NOT NULL,
      multiplier numeric NOT NULL,
      status text NOT NULL,
      metadata jsonb NOT NULL,
      observed_at timestamptz NOT NULL,
      retrieved_at timestamptz NOT NULL,
      source_hash text NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mdb_quote_observations (
      symbol text NOT NULL REFERENCES mdb_asset_registry(symbol),
      source_generated_at timestamptz NOT NULL,
      retrieved_at timestamptz NOT NULL,
      bid numeric NOT NULL,
      ask numeric NOT NULL,
      midpoint numeric NOT NULL,
      adjusted_midpoint numeric NOT NULL,
      spread_bps integer NOT NULL,
      daily_volume numeric,
      halted boolean NOT NULL,
      multiplier numeric NOT NULL,
      oracle_price_wad numeric,
      chain_block numeric,
      valid boolean NOT NULL,
      source_hash text NOT NULL,
      PRIMARY KEY (symbol, source_generated_at)
    );
    CREATE INDEX IF NOT EXISTS mdb_quote_observations_symbol_time_idx
      ON mdb_quote_observations (symbol, source_generated_at DESC);
    CREATE TABLE IF NOT EXISTS mdb_price_candles (
      symbol text NOT NULL,
      interval text NOT NULL CHECK (interval IN ('1m','15m','1h','1d')),
      bucket_start timestamptz NOT NULL,
      open numeric NOT NULL,
      high numeric NOT NULL,
      low numeric NOT NULL,
      close numeric NOT NULL,
      average_spread_bps integer NOT NULL,
      sample_count integer NOT NULL,
      source_hash text NOT NULL,
      PRIMARY KEY (symbol, interval, bucket_start)
    );
    CREATE TABLE IF NOT EXISTS mdb_market_features (
      symbol text NOT NULL,
      observed_at timestamptz NOT NULL,
      formula_version text NOT NULL,
      features jsonb NOT NULL,
      coverage jsonb NOT NULL,
      source_hash text NOT NULL,
      PRIMARY KEY (symbol, observed_at)
    );
    CREATE INDEX IF NOT EXISTS mdb_market_features_latest_idx
      ON mdb_market_features (symbol, observed_at DESC);
    CREATE TABLE IF NOT EXISTS mdb_trade_ledger (
      tx_hash text NOT NULL,
      log_index integer NOT NULL,
      block_number numeric NOT NULL,
      observed_at timestamptz NOT NULL,
      operation text NOT NULL,
      symbol text NOT NULL,
      side text NOT NULL CHECK (side IN ('buy','sell')),
      asset_amount_wad numeric NOT NULL,
      usdg_amount_wad numeric NOT NULL,
      valuation_usd_wad numeric,
      gas_wei numeric,
      metadata jsonb NOT NULL,
      PRIMARY KEY (tx_hash, log_index)
    );
    CREATE TABLE IF NOT EXISTS mdb_cash_flows (
      tx_hash text NOT NULL,
      log_index integer NOT NULL,
      block_number numeric NOT NULL,
      observed_at timestamptz NOT NULL,
      kind text NOT NULL,
      account text NOT NULL,
      gross_usdg_wad numeric NOT NULL,
      fee_usdg_wad numeric NOT NULL,
      shares_wad numeric NOT NULL,
      PRIMARY KEY (tx_hash, log_index)
    );
    CREATE TABLE IF NOT EXISTS mdb_accounting_snapshots (
      observed_at timestamptz PRIMARY KEY,
      block_number numeric,
      activation_basis boolean NOT NULL DEFAULT false,
      snapshot jsonb NOT NULL,
      source_hash text NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mdb_decision_outcomes (
      input_hash text NOT NULL REFERENCES mdb_cycle_records(input_hash) ON DELETE CASCADE,
      horizon text NOT NULL CHECK (horizon IN ('1h','24h')),
      matured_at timestamptz NOT NULL,
      outcome jsonb NOT NULL,
      source_hash text NOT NULL,
      PRIMARY KEY (input_hash, horizon)
    );
    CREATE TABLE IF NOT EXISTS mdb_worker_state (
      worker text PRIMARY KEY,
      last_started_at timestamptz,
      last_succeeded_at timestamptz,
      last_failed_at timestamptz,
      last_error text,
      duration_ms integer,
      details jsonb NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE TABLE IF NOT EXISTS mdb_price_syncs (
      id bigserial PRIMARY KEY,
      observed_at timestamptz NOT NULL DEFAULT now(),
      symbol text NOT NULL,
      source text NOT NULL,
      source_observed_at timestamptz NOT NULL,
      price_wad numeric NOT NULL,
      previous_oracle_price_wad numeric NOT NULL,
      previous_router_price_wad numeric NOT NULL,
      oracle_tx_hash text,
      router_tx_hash text,
      status text NOT NULL CHECK (status IN ('updated','unchanged','failed')),
      source_hash text NOT NULL,
      details jsonb NOT NULL DEFAULT '{}'::jsonb
    );
    CREATE INDEX IF NOT EXISTS mdb_price_syncs_symbol_time_idx
      ON mdb_price_syncs (symbol, observed_at DESC);

    CREATE TABLE IF NOT EXISTS mdb_asset_candidates_v4 (
      asset_id text PRIMARY KEY,
      chain_id integer NOT NULL,
      token_address text NOT NULL,
      symbol text NOT NULL,
      robinhood_uid text,
      kind text NOT NULL,
      risk_class text NOT NULL,
      active boolean NOT NULL DEFAULT false,
      record jsonb NOT NULL,
      manifest_hash text NOT NULL,
      updated_at timestamptz NOT NULL,
      UNIQUE(chain_id, token_address)
    );
    CREATE INDEX IF NOT EXISTS mdb_asset_candidates_v4_active_idx
      ON mdb_asset_candidates_v4 (chain_id, active, symbol);
    CREATE TABLE IF NOT EXISTS mdb_asset_qualification_daily_v4 (
      asset_id text NOT NULL REFERENCES mdb_asset_candidates_v4(asset_id) ON DELETE CASCADE,
      observation_date date NOT NULL,
      observed_at timestamptz NOT NULL,
      qualification jsonb NOT NULL,
      evidence_hash text NOT NULL,
      passed boolean NOT NULL,
      PRIMARY KEY (asset_id, observation_date)
    );
    CREATE INDEX IF NOT EXISTS mdb_asset_qualification_daily_v4_latest_idx
      ON mdb_asset_qualification_daily_v4 (asset_id, observed_at DESC);
    CREATE TABLE IF NOT EXISTS mdb_asset_qualification_hourly_v5 (
      asset_id text NOT NULL REFERENCES mdb_asset_candidates_v4(asset_id) ON DELETE CASCADE,
      observation_hour timestamptz NOT NULL,
      observed_at timestamptz NOT NULL,
      qualification jsonb NOT NULL,
      evidence_hash text NOT NULL,
      passed boolean NOT NULL,
      PRIMARY KEY (asset_id, observation_hour)
    );
    CREATE INDEX IF NOT EXISTS mdb_asset_qualification_hourly_v5_latest_idx
      ON mdb_asset_qualification_hourly_v5 (asset_id, observed_at DESC);
    CREATE TABLE IF NOT EXISTS mdb_decision_research_v4 (
      input_hash text NOT NULL,
      round integer NOT NULL CHECK (round = 1),
      created_at timestamptz NOT NULL,
      requests jsonb NOT NULL,
      results jsonb NOT NULL,
      research_hash text NOT NULL,
      PRIMARY KEY (input_hash, round)
    );
    CREATE TABLE IF NOT EXISTS mdb_shadow_simulations_v4 (
      input_hash text PRIMARY KEY,
      created_at timestamptz NOT NULL,
      chain_id integer NOT NULL CHECK (chain_id = 4663),
      block_number numeric NOT NULL,
      allocation jsonb NOT NULL,
      quote_bundle jsonb NOT NULL,
      simulation_receipt jsonb NOT NULL,
      broadcast boolean NOT NULL CHECK (broadcast = false),
      evidence_hash text NOT NULL
    );
    CREATE TABLE IF NOT EXISTS mdb_dex_pool_observations_v6 (
      symbol text NOT NULL,
      pool_address text NOT NULL,
      observed_at timestamptz NOT NULL,
      block_number numeric NOT NULL,
      twap_price_usdg numeric NOT NULL,
      spot_price_usdg numeric NOT NULL,
      liquidity_raw numeric NOT NULL,
      observation_cardinality integer NOT NULL,
      buy_impact_bps integer,
      sell_impact_bps integer,
      route jsonb NOT NULL,
      valid boolean NOT NULL,
      source_hash text NOT NULL,
      PRIMARY KEY (symbol, pool_address, block_number)
    );
    CREATE INDEX IF NOT EXISTS mdb_dex_pool_observations_v6_time_idx
      ON mdb_dex_pool_observations_v6 (symbol, observed_at DESC);
    CREATE TABLE IF NOT EXISTS mdb_dex_price_candles_v6 (
      symbol text NOT NULL,
      interval text NOT NULL CHECK (interval IN ('1m','15m','1h','1d')),
      bucket_start timestamptz NOT NULL,
      open numeric NOT NULL,
      high numeric NOT NULL,
      low numeric NOT NULL,
      close numeric NOT NULL,
      sample_count integer NOT NULL,
      source_hash text NOT NULL,
      PRIMARY KEY (symbol, interval, bucket_start)
    );
    CREATE TABLE IF NOT EXISTS mdb_dex_quote_bundles_v6 (
      quote_hash text PRIMARY KEY,
      created_at timestamptz NOT NULL,
      action text NOT NULL CHECK (action IN ('deposit','redeem','rebalance','qualification')),
      amount numeric NOT NULL,
      quote_block numeric NOT NULL,
      expires_at timestamptz NOT NULL,
      selected_routes jsonb NOT NULL,
      rejected_routes jsonb NOT NULL,
      bundle jsonb NOT NULL
    );
    CREATE INDEX IF NOT EXISTS mdb_dex_quote_bundles_v6_time_idx
      ON mdb_dex_quote_bundles_v6 (created_at DESC);
    CREATE TABLE IF NOT EXISTS mdb_dex_execution_receipts_v6 (
      tx_hash text NOT NULL,
      log_index integer NOT NULL,
      block_number numeric NOT NULL,
      observed_at timestamptz NOT NULL,
      token_in text NOT NULL,
      token_out text NOT NULL,
      amount_in numeric NOT NULL,
      amount_out numeric NOT NULL,
      first_pool text NOT NULL,
      second_pool text NOT NULL,
      reference_block numeric NOT NULL,
      effective_price numeric NOT NULL,
      receipt jsonb NOT NULL,
      PRIMARY KEY (tx_hash, log_index)
    );
    INSERT INTO mdb_schema_migrations(version) VALUES (1), (2), (3), (4), (5), (6)
      ON CONFLICT (version) DO NOTHING;
  `);
}

export async function withDatabase<T>(
  callback: (client: PoolClient) => Promise<T>,
) {
  const activePool = database();
  if (!activePool) return null;
  const client = await activePool.connect();
  try {
    schemaReady ??= ensureSchema(client);
    await schemaReady;
    return await callback(client);
  } finally {
    client.release();
  }
}

export async function persistCycle(record: PersistedCycle) {
  return withDatabase(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO mdb_cycle_records (
          input_hash, created_at, prompt_hash, model_config, raw_output,
          validated_allocation, decision_context, portfolio_before,
          portfolio_after, tx_hash, receipt, source_manifest
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (input_hash) DO NOTHING`,
        [
          record.inputHash,
          record.decisionContext.generatedAt,
          record.promptHash,
          json(record.modelConfig),
          record.rawOutput,
          json(record.validatedAllocation),
          json(record.decisionContext),
          json(record.decisionContext.portfolio),
          json(record.portfolioAfter),
          record.txHash,
          json(record.receipt),
          json(record.decisionContext.sourceManifest),
        ],
      );
      for (const asset of record.decisionContext.assets) {
        await client.query(
          `INSERT INTO mdb_market_observations
            (input_hash, symbol, observed_at, dossier, provenance)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (input_hash, symbol) DO NOTHING`,
          [
            record.inputHash,
            asset.symbol,
            record.decisionContext.generatedAt,
            json(asset),
            json(asset.provenance),
          ],
        );
      }
      for (const [phase, snapshot] of [
        ["before", record.decisionContext.portfolio],
        ["after", record.portfolioAfter],
      ] as const) {
        await client.query(
          `INSERT INTO mdb_portfolio_snapshots
            (input_hash, phase, observed_at, snapshot)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (input_hash, phase) DO NOTHING`,
          [record.inputHash, phase, new Date(), json(snapshot)],
        );
      }
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function databaseHealth() {
  try {
    const result = await withDatabase(async (client) => {
      const count = await client.query<{ count: string }>(
        "SELECT count(*)::text AS count FROM mdb_cycle_records",
      );
      return Number(count.rows[0]?.count ?? 0);
    });
    return {
      configured: Boolean(database()),
      available: result !== null,
      cycleRecords: result ?? 0,
    };
  } catch (error) {
    return {
      configured: Boolean(database()),
      available: false,
      cycleRecords: 0,
      error: error instanceof Error ? error.message : "database unavailable",
    };
  }
}

export async function recentPortfolioSnapshots(limit = 32) {
  try {
    return (
      (await withDatabase(async (client) => {
        const result = await client.query<{ snapshot: unknown }>(
          `SELECT snapshot
             FROM mdb_portfolio_snapshots
            WHERE phase = 'after'
            ORDER BY observed_at DESC
            LIMIT $1`,
          [limit],
        );
        return result.rows.map((row) => row.snapshot);
      })) ?? []
    );
  } catch {
    return [];
  }
}

export async function persistAssetCandidate(
  asset: AssetRecordV1,
  qualification:
    AssetQualificationV1 | AssetQualificationWindowV2 | AssetQualificationV3,
  manifestHash: string,
  passed: boolean,
) {
  return withDatabase(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO mdb_asset_candidates_v4
          (asset_id,chain_id,token_address,symbol,robinhood_uid,kind,risk_class,
           active,record,manifest_hash,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         ON CONFLICT(asset_id) DO UPDATE SET
           symbol=excluded.symbol, robinhood_uid=excluded.robinhood_uid,
           kind=excluded.kind, risk_class=excluded.risk_class,
           active=excluded.active, record=excluded.record,
           manifest_hash=excluded.manifest_hash, updated_at=excluded.updated_at`,
        [
          asset.id,
          asset.chainId,
          asset.address.toLowerCase(),
          asset.symbol,
          asset.robinhoodUid,
          asset.kind,
          asset.riskClass,
          asset.active,
          json(asset),
          manifestHash,
          qualification.observedAt,
        ],
      );
      await client.query(
        `INSERT INTO mdb_asset_qualification_hourly_v5
          (asset_id,observation_hour,observed_at,qualification,evidence_hash,passed)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT(asset_id,observation_hour) DO UPDATE SET
           observed_at=excluded.observed_at, qualification=excluded.qualification,
           evidence_hash=excluded.evidence_hash, passed=excluded.passed`,
        [
          asset.id,
          `${qualification.observedAt.slice(0, 13)}:00:00.000Z`,
          qualification.observedAt,
          json(qualification),
          qualification.evidenceHash,
          passed,
        ],
      );
      await client.query("COMMIT");
      return true;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}

export async function loadAssetCandidates(chainId: number) {
  return (
    (await withDatabase(async (client) => {
      const result = await client.query<{ record: AssetRecordV1 }>(
        `SELECT record
           FROM mdb_asset_candidates_v4
          WHERE chain_id=$1
          ORDER BY active DESC, symbol ASC, asset_id ASC`,
        [chainId],
      );
      return result.rows.map((row) => row.record);
    })) ?? []
  );
}

export async function persistResearchRound(
  inputHash: string,
  requests: ResearchRequestV1[],
  results: ResearchResultV1[],
  researchHash: string,
) {
  return withDatabase(async (client) => {
    await client.query(
      `INSERT INTO mdb_decision_research_v4
        (input_hash,round,created_at,requests,results,research_hash)
       VALUES ($1,1,now(),$2,$3,$4)
       ON CONFLICT(input_hash,round) DO NOTHING`,
      [inputHash, json(requests), json(results), researchHash],
    );
    return true;
  });
}

export async function persistShadowSimulation(input: {
  inputHash: string;
  blockNumber: string;
  allocation: unknown;
  quoteBundle: unknown;
  simulationReceipt: unknown;
  evidenceHash: string;
}) {
  return withDatabase(async (client) => {
    await client.query(
      `INSERT INTO mdb_shadow_simulations_v4
        (input_hash,created_at,chain_id,block_number,allocation,quote_bundle,
         simulation_receipt,broadcast,evidence_hash)
       VALUES ($1,now(),4663,$2,$3,$4,$5,false,$6)
       ON CONFLICT(input_hash) DO NOTHING`,
      [
        input.inputHash,
        input.blockNumber,
        json(input.allocation),
        json(input.quoteBundle),
        json(input.simulationReceipt),
        input.evidenceHash,
      ],
    );
    return true;
  });
}

export async function persistDexQuoteBundle(input: {
  quoteHash: string;
  createdAt: string;
  action: "deposit" | "redeem" | "rebalance" | "qualification";
  amount: string;
  quoteBlock: string;
  expiresAt: string;
  selectedRoutes: unknown;
  rejectedRoutes: unknown;
  bundle: unknown;
}) {
  return withDatabase(async (client) => {
    await client.query(
      `INSERT INTO mdb_dex_quote_bundles_v6
        (quote_hash,created_at,action,amount,quote_block,expires_at,
         selected_routes,rejected_routes,bundle)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT(quote_hash) DO NOTHING`,
      [
        input.quoteHash,
        input.createdAt,
        input.action,
        input.amount,
        input.quoteBlock,
        input.expiresAt,
        json(input.selectedRoutes),
        json(input.rejectedRoutes),
        json(input.bundle),
      ],
    );
    return true;
  });
}

export async function persistDexPoolObservation(input: {
  symbol: string;
  poolAddress: string;
  observedAt: string;
  blockNumber: string;
  twapPriceUsdG: string;
  spotPriceUsdG: string;
  liquidityRaw: string;
  observationCardinality: number;
  buyImpactBps: number | null;
  sellImpactBps: number | null;
  route: unknown;
  valid: boolean;
  sourceHash: string;
}) {
  return withDatabase(async (client) => {
    await client.query(
      `INSERT INTO mdb_dex_pool_observations_v6
        (symbol,pool_address,observed_at,block_number,twap_price_usdg,
         spot_price_usdg,liquidity_raw,observation_cardinality,buy_impact_bps,
         sell_impact_bps,route,valid,source_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT(symbol,pool_address,block_number) DO UPDATE SET
         observed_at=excluded.observed_at,twap_price_usdg=excluded.twap_price_usdg,
         spot_price_usdg=excluded.spot_price_usdg,
         liquidity_raw=excluded.liquidity_raw,
         observation_cardinality=excluded.observation_cardinality,
         buy_impact_bps=excluded.buy_impact_bps,
         sell_impact_bps=excluded.sell_impact_bps,route=excluded.route,
         valid=excluded.valid,source_hash=excluded.source_hash`,
      [
        input.symbol,
        input.poolAddress.toLowerCase(),
        input.observedAt,
        input.blockNumber,
        input.twapPriceUsdG,
        input.spotPriceUsdG,
        input.liquidityRaw,
        input.observationCardinality,
        input.buyImpactBps,
        input.sellImpactBps,
        json(input.route),
        input.valid,
        input.sourceHash,
      ],
    );
    const buckets = [
      ["1m", "date_trunc('minute',observed_at)"],
      [
        "15m",
        "date_trunc('hour',observed_at) + floor(extract(minute from observed_at) / 15) * interval '15 minutes'",
      ],
      ["1h", "date_trunc('hour',observed_at)"],
      ["1d", "date_trunc('day',observed_at)"],
    ] as const;
    for (const [interval, bucket] of buckets) {
      await client.query(
        `INSERT INTO mdb_dex_price_candles_v6
          (symbol,interval,bucket_start,open,high,low,close,sample_count,source_hash)
         SELECT symbol,'${interval}',${bucket},
                (array_agg(twap_price_usdg ORDER BY observed_at ASC))[1],
                max(twap_price_usdg),min(twap_price_usdg),
                (array_agg(twap_price_usdg ORDER BY observed_at DESC))[1],
                count(*)::integer,
                md5(string_agg(source_hash,'' ORDER BY observed_at))
           FROM mdb_dex_pool_observations_v6
          WHERE symbol=$1 AND valid=true
          GROUP BY symbol,${bucket}
         ON CONFLICT(symbol,interval,bucket_start) DO UPDATE SET
           open=excluded.open,high=excluded.high,low=excluded.low,
           close=excluded.close,sample_count=excluded.sample_count,
           source_hash=excluded.source_hash`,
        [input.symbol],
      );
    }
    return true;
  });
}
