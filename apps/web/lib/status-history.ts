import { readFileSync } from "node:fs";

export function readCycleHistory(limit = 50) {
  try {
    const file = `${process.env.MDB_STATE_DIR ?? "/home/hendo420/projects/million-dollar-brain/var"}/cycles.jsonl`;
    const contents = readFileSync(file, "utf8").trim();
    if (!contents) return [];
    return contents
      .split("\n")
      .flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      })
      .slice(-Math.max(1, Math.min(limit, 100)))
      .reverse();
  } catch {
    return [];
  }
}
