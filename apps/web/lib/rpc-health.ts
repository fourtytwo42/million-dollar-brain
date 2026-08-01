export type RpcFailoverHealth = {
  status: "ok" | "degraded";
  expectedChainId: number;
  active: "primary" | "secondary";
  routingMode: "failover" | "primary_only";
  secondaryUsagePermitted: boolean;
  headLag: number | null;
  primary: {
    healthy: boolean;
    reachable: boolean;
    chainId: number | null;
    blockNumber: number | null;
    syncing: boolean | object | null;
    latencyMs: number | null;
    checkedAt: string | null;
    error: string | null;
  };
  secondary: RpcFailoverHealth["primary"];
  lastSwitchAt: string | null;
  lastSwitchReason: string | null;
  switchCount: number;
};

export async function rpcFailoverHealth(): Promise<RpcFailoverHealth | null> {
  const mode = process.env.MDB_NETWORK_MODE;
  if (mode !== "testnet" && mode !== "mainnet") return null;
  try {
    const response = await fetch(
      process.env.MDB_RPC_HEALTH_URL ??
        (mode === "mainnet"
          ? "http://127.0.0.1:18549/health"
          : "http://127.0.0.1:18548/health"),
      {
        cache: "no-store",
        signal: AbortSignal.timeout(2_000),
      },
    );
    if (!response.ok) return null;
    return (await response.json()) as RpcFailoverHealth;
  } catch {
    return null;
  }
}
