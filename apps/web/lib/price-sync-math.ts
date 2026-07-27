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
