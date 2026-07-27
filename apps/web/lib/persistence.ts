import { Pool, type PoolClient } from "pg";

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
    INSERT INTO mdb_schema_migrations(version) VALUES (1), (2), (3)
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
