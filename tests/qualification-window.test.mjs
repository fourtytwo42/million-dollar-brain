import assert from "node:assert/strict";
import test from "node:test";
import {
  continuousPassingWindow,
  qualificationWindowPassed,
  regularMarketDate,
} from "../scripts/lib/qualification-window.mjs";

const hourly = (start, count, passed = true) =>
  Array.from({ length: count }, (_, index) => ({
    at: new Date(Date.parse(start) + index * 3_600_000).toISOString(),
    passed,
  }));

test("48 continuous hourly passes qualify a non-session asset", () => {
  const window = continuousPassingWindow(hourly("2026-07-27T00:00:00Z", 48));
  assert.equal(window.qualificationHours, 48);
  assert.equal(
    qualificationWindowPassed({
      ...window,
      requiresMarketSessions: false,
    }),
    true,
  );
});

test("a failed observation resets only the later continuous window", () => {
  const rows = hourly("2026-07-27T00:00:00Z", 49);
  rows[44].passed = false;
  assert.equal(continuousPassingWindow(rows).qualificationHours, 4);
});

test("a gap larger than 90 minutes breaks continuity", () => {
  const rows = [
    ...hourly("2026-07-27T00:00:00Z", 46),
    ...hourly("2026-07-29T00:00:00Z", 2),
  ];
  assert.equal(continuousPassingWindow(rows).qualificationHours, 2);
});

test("stocks require observations in two regular US sessions", () => {
  const rows = [
    ...hourly("2026-07-27T13:00:00Z", 24),
    ...hourly("2026-07-28T13:00:00Z", 24),
  ];
  const window = continuousPassingWindow(rows);
  assert.equal(window.qualificationHours, 48);
  assert.equal(window.regularMarketSessions, 2);
  assert.equal(qualificationWindowPassed(window), true);
  assert.equal(regularMarketDate("2026-07-26T15:00:00Z"), null);
});
