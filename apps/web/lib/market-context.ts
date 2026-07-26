import type { Address } from "viem";
import { deployment, publicClient } from "./chain";

const routerAbi = [{
  type: "function",
  name: "quoteUsd",
  stateMutability: "view",
  inputs: [{ name: "token", type: "address" }, { name: "amount", type: "uint256" }],
  outputs: [{ type: "uint256" }],
}] as const;

export const DATA_AVAILABILITY: Record<string, boolean> = {
  asset_registry: true,
  market_metrics: true,
  returns: true,
  volatility: true,
  drawdown: true,
  liquidity: true,
  execution_cost: true,
  correlation: true,
  market_cap: true,
  corporate_actions: true,
  confidence: true,
  portfolio_pnl: true,
  fundamentals: false,
  dividends: false,
  macro: false,
};

const registry = {
  USDG: {
    assetClass: "stable",
    tags: ["stable_reserve", "deep_liquidity"],
    metrics: { return1hBps: 0, return24hBps: 0, return7dBps: 0, volatility30dBps: 5, drawdownBps: 0, liquidityScoreBps: 10000 },
  },
  NVDA: {
    assetClass: "equity",
    tags: ["equity", "technology", "ai_semiconductor", "mega_cap", "high_beta"],
    metrics: { return1hBps: 32, return24hBps: 118, return7dBps: 246, volatility30dBps: 3800, drawdownBps: 420, liquidityScoreBps: 9600 },
  },
  AAPL: {
    assetClass: "equity",
    tags: ["equity", "technology", "consumer_discretionary", "mega_cap", "quality"],
    metrics: { return1hBps: 9, return24hBps: 41, return7dBps: 88, volatility30dBps: 2400, drawdownBps: 190, liquidityScoreBps: 9800 },
  },
  ETHX: {
    assetClass: "crypto",
    tags: ["crypto", "crypto_major", "high_beta"],
    metrics: { return1hBps: -18, return24hBps: 76, return7dBps: 164, volatility30dBps: 5200, drawdownBps: 730, liquidityScoreBps: 9300 },
  },
} as const;

export async function marketContext(holdings: Record<string, string>) {
  const d = deployment();
  const addresses: Record<keyof typeof registry, Address> = {
    USDG: d.usdg,
    NVDA: d.nvda,
    AAPL: d.aapl,
    ETHX: d.ethx,
  };
  const rows = await Promise.all((Object.keys(registry) as (keyof typeof registry)[]).map(async (symbol) => {
    const priceWad = symbol === "USDG"
      ? 10n ** 18n
      : await publicClient.readContract({
        address: d.router,
        abi: routerAbi,
        functionName: "quoteUsd",
        args: [addresses[symbol], 10n ** 18n],
      });
    return {
      symbol,
      address: addresses[symbol],
      approved: true,
      priceUsdWad: priceWad.toString(),
      holdingUnitsWad: holdings[symbol] ?? "0",
      source: "local_mock_router_and_deterministic_metrics",
      ...registry[symbol],
    };
  }));
  return {
    asOf: new Date().toISOString(),
    mode: "local_devnet_simulation",
    assets: rows,
    dataAvailability: DATA_AVAILABILITY,
    hardLimits: {
      stableReserveMinBps: 2000,
      longOnly: true,
      totalWeightBps: 10000,
      arbitraryContracts: false,
    },
  };
}
