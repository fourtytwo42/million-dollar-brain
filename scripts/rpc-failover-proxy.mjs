#!/usr/bin/env node
import { createServer } from "node:http";
import { pathToFileURL } from "node:url";

const DEFAULT_EXPECTED_CHAIN_ID = 46630;
const DEFAULT_MAX_HEAD_LAG = 3;
const DEFAULT_RECOVERY_HEAD_LAG = 1;
const DEFAULT_CHECK_INTERVAL_MS = 15_000;
const DEFAULT_LAG_FAILURE_THRESHOLD = 2;
const DEFAULT_RECOVERY_THRESHOLD = 5;
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000;
const MAX_BODY_BYTES = 2 * 1024 * 1024;

const MUTATING_METHODS = new Set([
  "eth_sendRawTransaction",
  "eth_sendTransaction",
  "personal_sendTransaction",
  "wallet_sendTransaction",
]);

function integer(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nowIso() {
  return new Date().toISOString();
}

function emptyProbe() {
  return {
    healthy: false,
    reachable: false,
    chainId: null,
    blockNumber: null,
    syncing: null,
    latencyMs: null,
    checkedAt: null,
    error: "not checked",
  };
}

function rpcRequest(id, method) {
  return { jsonrpc: "2.0", id, method, params: [] };
}

function resultFor(responses, id) {
  const row = responses.find((item) => item?.id === id);
  if (!row || row.error || row.result === undefined) {
    throw new Error(row?.error?.message ?? `missing ${id} response`);
  }
  return row.result;
}

function optionalResultFor(responses, id) {
  const row = responses.find((item) => item?.id === id);
  if (!row || row.error || row.result === undefined) return null;
  return row.result;
}

export function syncingIsHealthy(syncing, allowMissingSyncing = false) {
  if (syncing === false) return true;
  if (syncing === null) return allowMissingSyncing;
  if (!syncing || typeof syncing !== "object") return false;

  const currentBlock = Number(syncing.currentBlock ?? syncing.blockNum);
  const highestBlock = Number(
    syncing.highestBlock ?? syncing.executionSyncTarget,
  );
  const consensusCurrent = Number(
    syncing.consensusMaxMessageCount ?? syncing.messageOfLastBlock,
  );
  const consensusTarget = Number(
    syncing.consensusSyncTargetMsgCount ?? syncing.consensusMaxMessageCount,
  );
  const feedPending = Number(syncing.feedPendingMessageCount ?? 0);
  return (
    Number.isFinite(currentBlock) &&
    Number.isFinite(highestBlock) &&
    currentBlock >= highestBlock &&
    (!Number.isFinite(consensusCurrent) ||
      !Number.isFinite(consensusTarget) ||
      consensusCurrent >= consensusTarget) &&
    feedPending === 0
  );
}

async function probeUpstream(
  url,
  expectedChainId,
  timeoutMs,
  allowMissingSyncing,
) {
  const startedAt = performance.now();
  const checkedAt = nowIso();
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify([
        rpcRequest("chain", "eth_chainId"),
        rpcRequest("head", "eth_blockNumber"),
        rpcRequest("sync", "eth_syncing"),
      ]),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const body = await response.json();
    if (!Array.isArray(body)) throw new Error("batch response required");
    const chainId = Number(BigInt(resultFor(body, "chain")));
    const blockNumber = Number(BigInt(resultFor(body, "head")));
    const syncing = optionalResultFor(body, "sync");
    const syncHealthy = syncingIsHealthy(syncing, allowMissingSyncing);
    const healthy = chainId === expectedChainId && syncHealthy;
    return {
      healthy,
      reachable: true,
      chainId,
      blockNumber,
      syncing,
      latencyMs: Math.round(performance.now() - startedAt),
      checkedAt,
      error: healthy
        ? null
        : chainId !== expectedChainId
          ? `wrong chain ${chainId}`
          : syncing === null
            ? "sync status unavailable"
            : "upstream is syncing",
    };
  } catch (error) {
    return {
      ...emptyProbe(),
      checkedAt,
      latencyMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : "probe failed",
    };
  }
}

function requestMethods(body) {
  try {
    const parsed = JSON.parse(body);
    const calls = Array.isArray(parsed) ? parsed : [parsed];
    return calls
      .map((call) => call?.method)
      .filter((method) => typeof method === "string");
  } catch {
    return [];
  }
}

export function isMutatingRpcBody(body) {
  return requestMethods(body).some((method) => MUTATING_METHODS.has(method));
}

export function createRpcFailover({
  primaryUrl,
  secondaryUrl,
  expectedChainId = DEFAULT_EXPECTED_CHAIN_ID,
  maxHeadLag = DEFAULT_MAX_HEAD_LAG,
  recoveryHeadLag = DEFAULT_RECOVERY_HEAD_LAG,
  checkIntervalMs = DEFAULT_CHECK_INTERVAL_MS,
  lagFailureThreshold = DEFAULT_LAG_FAILURE_THRESHOLD,
  recoveryThreshold = DEFAULT_RECOVERY_THRESHOLD,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  logger = console,
}) {
  if (!primaryUrl || !secondaryUrl) {
    throw new Error("Both primary and secondary RPC URLs are required");
  }
  if (primaryUrl === secondaryUrl) {
    throw new Error("Primary and secondary RPC URLs must differ");
  }

  const state = {
    active: "primary",
    primary: emptyProbe(),
    secondary: emptyProbe(),
    headLag: null,
    primaryLagFailures: 0,
    primaryRecoverySamples: 0,
    lastSwitchAt: null,
    lastSwitchReason: null,
    switchCount: 0,
    startedAt: nowIso(),
  };
  let checking = null;
  let timer = null;

  function activeProbe() {
    return state[state.active];
  }

  function switchTo(next, reason) {
    if (state.active === next) return;
    state.active = next;
    state.lastSwitchAt = nowIso();
    state.lastSwitchReason = reason;
    state.switchCount += 1;
    logger.info?.(`[rpc-failover] active=${next} reason=${reason}`);
  }

  async function runCheck() {
    const [primary, secondary] = await Promise.all([
      probeUpstream(primaryUrl, expectedChainId, requestTimeoutMs, false),
      probeUpstream(secondaryUrl, expectedChainId, requestTimeoutMs, true),
    ]);
    state.primary = primary;
    state.secondary = secondary;
    state.headLag =
      primary.blockNumber != null && secondary.blockNumber != null
        ? Math.max(0, secondary.blockNumber - primary.blockNumber)
        : null;

    const primaryHardFailure =
      !primary.reachable ||
      primary.chainId !== expectedChainId ||
      !primary.healthy;
    const primaryLagged =
      secondary.healthy && state.headLag != null && state.headLag > maxHeadLag;
    const primaryUsable = primary.healthy && !primaryLagged;

    if (state.active === "primary") {
      state.primaryRecoverySamples = 0;
      if (primaryHardFailure && secondary.healthy) {
        state.primaryLagFailures = 0;
        switchTo("secondary", primary.error ?? "primary unavailable");
      } else if (primaryLagged) {
        state.primaryLagFailures += 1;
        if (
          state.primaryLagFailures >= lagFailureThreshold &&
          secondary.healthy
        ) {
          switchTo("secondary", `primary behind by ${state.headLag} blocks`);
        }
      } else {
        state.primaryLagFailures = 0;
      }
    } else {
      state.primaryLagFailures = 0;
      const primaryRecovered =
        primaryUsable &&
        (!secondary.healthy ||
          (state.headLag != null && state.headLag <= recoveryHeadLag));
      state.primaryRecoverySamples = primaryRecovered
        ? state.primaryRecoverySamples + 1
        : 0;
      if (!secondary.healthy && primaryUsable) {
        switchTo("primary", "secondary unavailable");
        state.primaryRecoverySamples = 0;
      } else if (state.primaryRecoverySamples >= recoveryThreshold) {
        switchTo("primary", "primary recovered");
        state.primaryRecoverySamples = 0;
      }
    }
    return health();
  }

  function checkNow() {
    if (!checking) {
      checking = runCheck().finally(() => {
        checking = null;
      });
    }
    return checking;
  }

  function health() {
    const active = activeProbe();
    const activeIsLagged =
      state.active === "primary" &&
      state.secondary.healthy &&
      state.headLag != null &&
      state.headLag > maxHeadLag;
    return {
      status: active.healthy && !activeIsLagged ? "ok" : "degraded",
      expectedChainId,
      active: state.active,
      headLag: state.headLag,
      thresholds: {
        maximumHeadLag: maxHeadLag,
        recoveryHeadLag,
        lagFailureSamples: lagFailureThreshold,
        recoverySamples: recoveryThreshold,
      },
      primary: { ...state.primary },
      secondary: { ...state.secondary },
      lastSwitchAt: state.lastSwitchAt,
      lastSwitchReason: state.lastSwitchReason,
      switchCount: state.switchCount,
      startedAt: state.startedAt,
    };
  }

  async function forward(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
      signal: AbortSignal.timeout(requestTimeoutMs),
    });
    const text = await response.text();
    if (!response.ok) {
      const error = new Error(`upstream HTTP ${response.status}`);
      error.status = response.status;
      throw error;
    }
    return {
      status: response.status,
      contentType: response.headers.get("content-type") ?? "application/json",
      body: text,
    };
  }

  async function forwardActive(body) {
    const activeAtStart = state.active;
    const activeUrl = activeAtStart === "primary" ? primaryUrl : secondaryUrl;
    try {
      return await forward(activeUrl, body);
    } catch (firstError) {
      await checkNow();
      const changed = state.active !== activeAtStart;
      if (!changed || isMutatingRpcBody(body)) throw firstError;
      const failoverUrl =
        state.active === "primary" ? primaryUrl : secondaryUrl;
      return forward(failoverUrl, body);
    }
  }

  async function start() {
    await checkNow();
    timer = setInterval(() => void checkNow(), checkIntervalMs);
    timer.unref();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { checkNow, forwardActive, health, start, stop };
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error("request body too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export async function startRpcFailoverServer(options = {}) {
  const listenHost =
    options.listenHost ?? process.env.MDB_RPC_LISTEN_HOST ?? "127.0.0.1";
  const listenPort =
    options.listenPort ?? integer(process.env.MDB_RPC_LISTEN_PORT, 18548);
  const failover = createRpcFailover({
    primaryUrl: options.primaryUrl ?? process.env.MDB_RPC_PRIMARY_URL,
    secondaryUrl:
      options.secondaryUrl ??
      process.env.MDB_RPC_SECONDARY_URL ??
      process.env.MDB_BACKUP_RPC_URL,
    expectedChainId:
      options.expectedChainId ??
      integer(process.env.MDB_RPC_EXPECTED_CHAIN_ID, DEFAULT_EXPECTED_CHAIN_ID),
    maxHeadLag:
      options.maxHeadLag ??
      integer(process.env.MDB_RPC_MAX_HEAD_LAG, DEFAULT_MAX_HEAD_LAG),
    recoveryHeadLag:
      options.recoveryHeadLag ??
      integer(process.env.MDB_RPC_RECOVERY_HEAD_LAG, DEFAULT_RECOVERY_HEAD_LAG),
    checkIntervalMs:
      options.checkIntervalMs ??
      integer(process.env.MDB_RPC_CHECK_INTERVAL_MS, DEFAULT_CHECK_INTERVAL_MS),
    lagFailureThreshold:
      options.lagFailureThreshold ??
      integer(
        process.env.MDB_RPC_LAG_FAILURE_SAMPLES,
        DEFAULT_LAG_FAILURE_THRESHOLD,
      ),
    recoveryThreshold:
      options.recoveryThreshold ??
      integer(process.env.MDB_RPC_RECOVERY_SAMPLES, DEFAULT_RECOVERY_THRESHOLD),
    requestTimeoutMs:
      options.requestTimeoutMs ??
      integer(
        process.env.MDB_RPC_REQUEST_TIMEOUT_MS,
        DEFAULT_REQUEST_TIMEOUT_MS,
      ),
    logger: options.logger,
  });

  await failover.start();
  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      const body = JSON.stringify(failover.health());
      response.writeHead(200, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      response.end(body);
      return;
    }
    if (request.method !== "POST" || request.url !== "/") {
      response.writeHead(404).end();
      return;
    }
    try {
      const body = await readBody(request);
      const result = await failover.forwardActive(body);
      response.writeHead(result.status, {
        "content-type": result.contentType,
        "cache-control": "no-store",
      });
      response.end(result.body);
    } catch (error) {
      response.writeHead(502, {
        "content-type": "application/json",
        "cache-control": "no-store",
      });
      response.end(
        JSON.stringify({
          jsonrpc: "2.0",
          id: null,
          error: {
            code: -32098,
            message:
              error instanceof Error ? error.message : "RPC upstream failed",
          },
        }),
      );
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(listenPort, listenHost, resolve);
  });
  return {
    failover,
    server,
    address: server.address(),
    async close() {
      failover.stop();
      await new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    },
  };
}

const isEntrypoint =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  const running = await startRpcFailoverServer();
  const shutdown = async () => {
    await running.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
