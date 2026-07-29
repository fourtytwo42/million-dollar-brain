const MAXIMUM_GAP_MS = 90 * 60 * 1_000;

export function regularMarketDate(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value]),
  );
  if (parts.weekday === "Sat" || parts.weekday === "Sun") return null;
  const minutes = Number(parts.hour) * 60 + Number(parts.minute);
  if (minutes < 9 * 60 + 30 || minutes > 16 * 60) return null;
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function continuousPassingWindow(rows) {
  const ordered = rows
    .filter((row) => Number.isFinite(Date.parse(row.at ?? "")))
    .sort((left, right) => Date.parse(left.at) - Date.parse(right.at));
  const window = [];
  for (let index = ordered.length - 1; index >= 0; index -= 1) {
    const row = ordered[index];
    if (!row.passed) break;
    if (
      window.length > 0 &&
      Date.parse(window[window.length - 1].at) - Date.parse(row.at) >
        MAXIMUM_GAP_MS
    )
      break;
    window.push(row);
  }
  const regularMarketSessions = new Set(
    window.map((row) => regularMarketDate(row.at)).filter(Boolean),
  ).size;
  if (window.length === 0)
    return {
      qualificationHours: 0,
      regularMarketSessions,
      qualificationStartedAt: null,
      latestSuccessfulCheckAt: null,
    };
  const newest = Date.parse(window[0].at);
  const oldest = Date.parse(window[window.length - 1].at);
  return {
    qualificationHours: Math.min(
      window.length,
      Math.floor((newest - oldest) / 3_600_000) + 1,
    ),
    regularMarketSessions,
    qualificationStartedAt: window[window.length - 1].at,
    latestSuccessfulCheckAt: window[0].at,
  };
}

export function qualificationWindowPassed({
  qualificationHours,
  regularMarketSessions,
  requiresMarketSessions = true,
  requiredHours = 48,
}) {
  return (
    qualificationHours >= requiredHours &&
    (!requiresMarketSessions || regularMarketSessions >= 2)
  );
}
