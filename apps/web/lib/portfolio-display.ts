export function positiveBalanceSymbols(
  holdings: Record<string, string>,
): string[] {
  return Object.entries(holdings)
    .filter(([, balance]) => {
      try {
        return BigInt(balance) > 0n;
      } catch {
        return false;
      }
    })
    .map(([symbol]) => symbol);
}

export function visibleHoldingSymbols(
  holdings: Record<string, string>,
  holdingValues: Record<string, string>,
  currentWeightsBps: Record<string, number>,
): string[] {
  return positiveBalanceSymbols(holdings).filter((symbol) => {
    try {
      return (
        BigInt(holdingValues[symbol] ?? "0") >= 5_000_000_000_000_000n &&
        (currentWeightsBps[symbol] ?? 0) > 0
      );
    } catch {
      return false;
    }
  });
}

export const BASKET_CHART_COLOR_COUNT = 10;

export function basketChartColor(index: number): string {
  const normalized =
    ((Math.trunc(index) % BASKET_CHART_COLOR_COUNT) +
      BASKET_CHART_COLOR_COUNT) %
    BASKET_CHART_COLOR_COUNT;
  return `var(--chart-asset-${normalized + 1})`;
}

export function positiveAllocationEntries(
  allocation: Record<string, number>,
): Array<[string, number]> {
  return Object.entries(allocation).filter(
    ([, weight]) => Number.isFinite(weight) && weight > 0,
  );
}

export function allocationSummary(allocation: Record<string, number>): string {
  const summary = positiveAllocationEntries(allocation)
    .map(([symbol, weight]) => `${symbol} ${weight / 100}%`)
    .join(" · ");
  return summary || "No target positions";
}
