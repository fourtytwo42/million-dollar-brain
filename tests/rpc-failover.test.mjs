import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import {
  createRpcFailover,
  isMutatingRpcBody,
  syncingIsHealthy,
  startRpcFailoverServer,
} from "../scripts/rpc-failover-proxy.mjs";

function rpcResult(id, result) {
  return { jsonrpc: "2.0", id, result };
}

async function mockRpc({ chainId = 46630, blockNumber = 100 } = {}) {
  const state = {
    chainId,
    blockNumber,
    syncing: false,
    syncingUnsupported: false,
    fail: false,
    calls: [],
  };
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const raw = Buffer.concat(chunks).toString("utf8");
    state.calls.push(raw);
    if (state.fail) {
      response.writeHead(503).end("offline");
      return;
    }
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const results = rows.map((row) => {
      if (row.method === "eth_chainId")
        return rpcResult(row.id, `0x${state.chainId.toString(16)}`);
      if (row.method === "eth_blockNumber")
        return rpcResult(row.id, `0x${state.blockNumber.toString(16)}`);
      if (row.method === "eth_syncing" && state.syncingUnsupported) {
        return {
          jsonrpc: "2.0",
          id: row.id,
          error: { code: -32601, message: "method unavailable" },
        };
      }
      if (row.method === "eth_syncing") return rpcResult(row.id, state.syncing);
      if (row.method === "eth_sendRawTransaction")
        return rpcResult(row.id, `0x${"a".repeat(64)}`);
      return rpcResult(row.id, "0x1");
    });
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(Array.isArray(parsed) ? results : results[0]));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return {
    state,
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      ),
  };
}

test("healthy primary remains active and is periodically compared", async (t) => {
  const primary = await mockRpc({ blockNumber: 500 });
  const secondary = await mockRpc({ blockNumber: 501 });
  t.after(() => Promise.all([primary.close(), secondary.close()]));
  const failover = createRpcFailover({
    primaryUrl: primary.url,
    secondaryUrl: secondary.url,
    routingMode: "failover",
    secondaryRoutingAuthorized: true,
    checkIntervalMs: 60_000,
    requestTimeoutMs: 1_000,
    logger: { info() {} },
  });
  t.after(() => failover.stop());
  await failover.start();
  assert.equal(failover.health().active, "primary");
  assert.equal(failover.health().headLag, 1);
  assert.equal(failover.health().status, "ok");
  assert.ok(primary.state.calls.length > 0);
  assert.ok(secondary.state.calls.length > 0);
});

test("head lag fails over with hysteresis and later recovers", async (t) => {
  const primary = await mockRpc({ blockNumber: 90 });
  const secondary = await mockRpc({ blockNumber: 100 });
  t.after(() => Promise.all([primary.close(), secondary.close()]));
  const failover = createRpcFailover({
    primaryUrl: primary.url,
    secondaryUrl: secondary.url,
    routingMode: "failover",
    secondaryRoutingAuthorized: true,
    lagFailureThreshold: 2,
    recoveryThreshold: 2,
    checkIntervalMs: 60_000,
    requestTimeoutMs: 1_000,
    logger: { info() {} },
  });
  t.after(() => failover.stop());
  await failover.start();
  assert.equal(failover.health().active, "primary");
  assert.equal(failover.health().status, "degraded");
  await failover.checkNow();
  assert.equal(failover.health().active, "secondary");
  assert.equal(failover.health().headLag, 10);

  primary.state.blockNumber = 100;
  await failover.checkNow();
  assert.equal(failover.health().active, "secondary");
  await failover.checkNow();
  assert.equal(failover.health().active, "primary");
});

test("wrong-chain primary fails closed to the valid secondary", async (t) => {
  const primary = await mockRpc({ chainId: 4663, blockNumber: 100 });
  const secondary = await mockRpc({ chainId: 46630, blockNumber: 100 });
  t.after(() => Promise.all([primary.close(), secondary.close()]));
  const failover = createRpcFailover({
    primaryUrl: primary.url,
    secondaryUrl: secondary.url,
    routingMode: "failover",
    secondaryRoutingAuthorized: true,
    checkIntervalMs: 60_000,
    requestTimeoutMs: 1_000,
    logger: { info() {} },
  });
  t.after(() => failover.stop());
  await failover.start();
  assert.equal(failover.health().active, "secondary");
  assert.match(failover.health().lastSwitchReason, /wrong chain/);
});

test("remote comparison remains valid when eth_syncing is unsupported", async (t) => {
  const primary = await mockRpc({ blockNumber: 100 });
  const secondary = await mockRpc({ blockNumber: 100 });
  secondary.state.syncingUnsupported = true;
  t.after(() => Promise.all([primary.close(), secondary.close()]));
  const failover = createRpcFailover({
    primaryUrl: primary.url,
    secondaryUrl: secondary.url,
    routingMode: "failover",
    secondaryRoutingAuthorized: true,
    checkIntervalMs: 60_000,
    requestTimeoutMs: 1_000,
    logger: { info() {} },
  });
  t.after(() => failover.stop());
  await failover.start();
  assert.equal(failover.health().primary.healthy, true);
  assert.equal(failover.health().secondary.healthy, true);
  assert.equal(failover.health().secondary.syncing, null);
  assert.equal(failover.health().headLag, 0);
});

test("secondary routing is disabled by default on public networks", async (t) => {
  const primary = await mockRpc({ blockNumber: 90 });
  const secondary = await mockRpc({ blockNumber: 100 });
  t.after(() => Promise.all([primary.close(), secondary.close()]));
  const gateway = createRpcFailover({
    primaryUrl: primary.url,
    secondaryUrl: secondary.url,
    checkIntervalMs: 60_000,
    requestTimeoutMs: 1_000,
    logger: { info() {} },
  });
  t.after(() => gateway.stop());
  await gateway.start();
  assert.equal(gateway.health().status, "degraded");
  assert.equal(gateway.health().active, "primary");
  assert.equal(gateway.health().routingMode, "primary_only");
  assert.equal(gateway.health().secondaryUsagePermitted, false);
});

test("Nitro structured sync status is healthy when execution and consensus are caught up", () => {
  assert.equal(
    syncingIsHealthy({
      blockNum: 22_516_809,
      executionSyncTarget: 22_516_803,
      consensusMaxMessageCount: 22_516_809,
      consensusSyncTargetMsgCount: 22_516_794,
      feedPendingMessageCount: 0,
    }),
    true,
  );
  assert.equal(
    syncingIsHealthy({
      blockNum: 22_516_700,
      executionSyncTarget: 22_516_803,
      consensusMaxMessageCount: 22_516_700,
      consensusSyncTargetMsgCount: 22_516_794,
      feedPendingMessageCount: 2,
    }),
    false,
  );
});

test("the same gateway validates Robinhood mainnet chain 4663", async (t) => {
  const primary = await mockRpc({ chainId: 4663, blockNumber: 500 });
  const secondary = await mockRpc({ chainId: 4663, blockNumber: 501 });
  t.after(() => Promise.all([primary.close(), secondary.close()]));
  const failover = createRpcFailover({
    primaryUrl: primary.url,
    secondaryUrl: secondary.url,
    expectedChainId: 4663,
    routingMode: "primary_only",
    secondaryRoutingAuthorized: false,
    checkIntervalMs: 60_000,
    requestTimeoutMs: 1_000,
    logger: { info() {} },
  });
  t.after(() => failover.stop());
  await failover.start();
  assert.equal(failover.health().status, "ok");
  assert.equal(failover.health().expectedChainId, 4663);
  assert.equal(failover.health().active, "primary");
  assert.equal(failover.health().routingMode, "primary_only");
  assert.equal(failover.health().secondaryUsagePermitted, false);
});

test("automatic secondary routing requires explicit authorization", async (t) => {
  const primary = await mockRpc({ chainId: 4663 });
  const secondary = await mockRpc({ chainId: 4663 });
  t.after(() => Promise.all([primary.close(), secondary.close()]));
  assert.throws(
    () =>
      createRpcFailover({
        primaryUrl: primary.url,
        secondaryUrl: secondary.url,
        expectedChainId: 4663,
        routingMode: "failover",
      }),
    /explicit authorization/,
  );
});

test("mainnet primary-only mode reports lag without switching", async (t) => {
  const primary = await mockRpc({ chainId: 4663, blockNumber: 90 });
  const secondary = await mockRpc({ chainId: 4663, blockNumber: 100 });
  t.after(() => Promise.all([primary.close(), secondary.close()]));
  const failover = createRpcFailover({
    primaryUrl: primary.url,
    secondaryUrl: secondary.url,
    expectedChainId: 4663,
    routingMode: "primary_only",
    secondaryRoutingAuthorized: false,
    lagFailureThreshold: 1,
    checkIntervalMs: 60_000,
    requestTimeoutMs: 1_000,
    logger: { info() {} },
  });
  t.after(() => failover.stop());
  await failover.start();
  assert.equal(failover.health().status, "degraded");
  assert.equal(failover.health().headLag, 10);
  assert.equal(failover.health().active, "primary");
  assert.equal(failover.health().switchCount, 0);
});

test("mainnet primary-only mode never forwards user calls to secondary", async (t) => {
  const primary = await mockRpc({ chainId: 4663, blockNumber: 100 });
  const secondary = await mockRpc({ chainId: 4663, blockNumber: 100 });
  t.after(() => Promise.all([primary.close(), secondary.close()]));
  const running = await startRpcFailoverServer({
    primaryUrl: primary.url,
    secondaryUrl: secondary.url,
    expectedChainId: 4663,
    routingMode: "primary_only",
    secondaryRoutingAuthorized: false,
    listenPort: 0,
    checkIntervalMs: 60_000,
    requestTimeoutMs: 1_000,
    logger: { info() {} },
  });
  t.after(() => running.close());
  primary.state.calls = [];
  secondary.state.calls = [];
  primary.state.fail = true;
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 9,
    method: "eth_blockNumber",
    params: [],
  });
  const response = await fetch(`http://127.0.0.1:${running.address.port}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  assert.equal(response.status, 502);
  assert.equal(running.failover.health().active, "primary");
  assert.equal(
    secondary.state.calls.some((call) => call.includes('"id":9')),
    false,
  );
});

test("ambiguous raw transaction failures are never replayed", async (t) => {
  const primary = await mockRpc({ blockNumber: 100 });
  const secondary = await mockRpc({ blockNumber: 100 });
  t.after(() => Promise.all([primary.close(), secondary.close()]));
  const running = await startRpcFailoverServer({
    primaryUrl: primary.url,
    secondaryUrl: secondary.url,
    routingMode: "failover",
    secondaryRoutingAuthorized: true,
    listenPort: 0,
    checkIntervalMs: 60_000,
    requestTimeoutMs: 1_000,
    logger: { info() {} },
  });
  t.after(() => running.close());
  primary.state.calls = [];
  secondary.state.calls = [];
  primary.state.fail = true;
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: 7,
    method: "eth_sendRawTransaction",
    params: ["0xdeadbeef"],
  });
  assert.equal(isMutatingRpcBody(body), true);
  const address = running.address;
  const response = await fetch(`http://127.0.0.1:${address.port}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
  assert.equal(response.status, 502);
  assert.equal(running.failover.health().active, "secondary");
  assert.equal(
    secondary.state.calls.some((call) =>
      call.includes("eth_sendRawTransaction"),
    ),
    false,
  );
});
