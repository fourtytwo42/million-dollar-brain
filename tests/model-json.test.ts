import assert from "node:assert/strict";
import test from "node:test";
import { parseFirstJsonObject } from "../apps/web/lib/model-json.ts";

test("parses one bounded object and ignores duplicate trailing output", () => {
  assert.deepEqual(
    parseFirstJsonObject(
      '```json\n{"allocation":{"USDG":4000},"brainPulse":"Braces { stay } quoted."}\n```\n{"duplicate":true}',
    ),
    {
      allocation: { USDG: 4000 },
      brainPulse: "Braces { stay } quoted.",
    },
  );
});

test("rejects missing and incomplete objects", () => {
  assert.throws(() => parseFirstJsonObject("no object"), /did not return JSON/);
  assert.throws(() => parseFirstJsonObject('{"USDG":4000'), /incomplete JSON/);
});
