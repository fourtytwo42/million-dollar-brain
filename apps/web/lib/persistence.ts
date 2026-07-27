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
  `);
}

async function withSchema<T>(callback: (client: PoolClient) => Promise<T>) {
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
  return withSchema(async (client) => {
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
    const result = await withSchema(async (client) => {
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
      (await withSchema(async (client) => {
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
