export type SnapshotAttempt = {
  attemptedAt: string;
  succeeded: boolean;
};

export function deriveSnapshotState(input: {
  observedAt: string;
  now: number;
  staleAfterSeconds: number;
  attempt?: SnapshotAttempt | null;
}) {
  const ageSeconds = Math.max(
    0,
    Math.floor((input.now - Date.parse(input.observedAt)) / 1_000),
  );
  const failedAfterSnapshot = Boolean(
    input.attempt &&
    !input.attempt.succeeded &&
    Date.parse(input.attempt.attemptedAt) > Date.parse(input.observedAt),
  );
  if (failedAfterSnapshot) {
    return {
      state: "degraded" as const,
      reasonCodes: ["snapshot_refresh_failed"],
      ageSeconds,
    };
  }
  if (ageSeconds > input.staleAfterSeconds) {
    return {
      state: "stale" as const,
      reasonCodes: ["snapshot_age_exceeded"],
      ageSeconds,
    };
  }
  return { state: "live" as const, reasonCodes: [] as string[], ageSeconds };
}
