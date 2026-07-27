export function stableDecisionJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableDecisionJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([key, item]) => `${JSON.stringify(key)}:${stableDecisionJson(item)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function calculateCandleMetrics(
  closes: { time: number; close: number }[],
) {
  const sorted = [...closes].sort((a, b) => a.time - b.time);
  const latest = sorted.at(-1)?.close;
  const result = (hours: number) => {
    const prior = sorted.at(-(hours + 1))?.close;
    return latest && prior ? Math.round((latest / prior - 1) * 10_000) : null;
  };
  if (!latest || sorted.length < 2) {
    return {
      return1hBps: null,
      return24hBps: null,
      return7dBps: null,
      return30dBps: null,
      volatility30dBps: null,
      maximumDrawdownBps: null,
    };
  }
  const periodic = sorted
    .slice(1)
    .map((row, index) => Math.log(row.close / sorted[index].close));
  const mean =
    periodic.reduce((sum, value) => sum + value, 0) / periodic.length;
  const variance =
    periodic.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    periodic.length;
  let peak = sorted[0].close;
  let drawdown = 0;
  for (const row of sorted) {
    peak = Math.max(peak, row.close);
    drawdown = Math.min(drawdown, row.close / peak - 1);
  }
  return {
    return1hBps: result(1),
    return24hBps: result(24),
    return7dBps: result(24 * 7),
    return30dBps: result(24 * 30),
    volatility30dBps: Math.round(Math.sqrt(variance * 24 * 365) * 10_000),
    maximumDrawdownBps: Math.round(drawdown * -10_000),
  };
}
