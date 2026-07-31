export function parseFirstJsonObject(rawOutput: string) {
  const start = rawOutput.indexOf("{");
  if (start < 0) throw new Error("model did not return JSON");

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < rawOutput.length; index += 1) {
    const character = rawOutput[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(rawOutput.slice(start, index + 1)) as Record<
          string,
          unknown
        >;
      }
    }
  }
  throw new Error("model returned incomplete JSON");
}
