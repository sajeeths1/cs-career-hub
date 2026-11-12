import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/job-match.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { averagePercent, matchTone } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("averages only the postings that can be scored", () => {
  assert.equal(averagePercent([{ matched: 3, total: 4, percent: 75 }, null, { matched: 1, total: 2, percent: 50 }]), 63);
  assert.equal(averagePercent([null, null]), null);
  assert.equal(averagePercent([]), null);
});

test("colour bands: strong 70+, fair 50-69, low below 50", () => {
  assert.equal(matchTone(70), "strong");
  assert.equal(matchTone(69), "fair");
  assert.equal(matchTone(50), "fair");
  assert.equal(matchTone(49), "low");
});
