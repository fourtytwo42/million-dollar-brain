import { parseUnits } from "viem";

export function decimalWad(value: string) {
  const normalized = value.trim();
  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    throw new Error(`invalid decimal price: ${value}`);
  }
  const [whole, fraction = ""] = normalized.split(".");
  return parseUnits(fraction ? `${whole}.${fraction.slice(0, 18)}` : whole, 18);
}

export function changedByAtLeastOneBps(current: bigint, next: bigint) {
  if (current === 0n) return true;
  const difference = current > next ? current - next : next - current;
  return difference * 10_000n >= current;
}

export function needsOracleFreshnessRefresh(
  chainId: number,
  updatedAt: number,
  nowSeconds: number,
  refreshAfterSeconds = 45,
) {
  return chainId === 46630 && nowSeconds - updatedAt >= refreshAfterSeconds;
}

export async function retryRpcConsistency<T>(
  operation: () => Promise<T>,
  attempts = 10,
  delayMs = 500,
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }
  throw lastError;
}
