export type CycleIdentity = {
  txHash?: string | null;
  inputHash?: string | null;
  at: string;
};

export function cycleSelectionKey(cycle: CycleIdentity | null | undefined) {
  if (!cycle) return null;
  if (cycle.txHash) return cycle.txHash;
  return `hold:${cycle.inputHash ?? "legacy"}:${cycle.at}`;
}
