export type RpcFailoverHealth = {
  status: "ok" | "degraded";
  expectedChainId: number;
  active: "primary" | "secondary";
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
  if (process.env.MDB_NETWORK_MODE !== "testnet") return null;
  try {
    const response = await fetch(
      process.env.MDB_RPC_HEALTH_URL ?? "http://127.0.0.1:18548/health",
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
