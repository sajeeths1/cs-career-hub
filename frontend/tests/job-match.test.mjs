import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/job-match.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { matchScore, matchesScoreFilter, formatMatch } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("scores the share of a posting's skills the student has", () => {
  assert.deepEqual(matchScore([1, 2, 3, 4, 5], [1, 2, 3, 99]), { matched: 3, total: 5, percent: 60 });
  assert.deepEqual(matchScore([1, 2], [1, 2]), { matched: 2, total: 2, percent: 100 });
});
test("rounds to a whole percent", () => {
  assert.equal(matchScore([1, 2, 3], [1]).percent, 33);
  assert.equal(matchScore([1, 2, 3], [1, 2]).percent, 67);
});
test("no overlap is a real score of zero, not a missing one", () => {
  assert.deepEqual(matchScore([1, 2], [3]), { matched: 0, total: 2, percent: 0 });
});
test("has no score without posting tags or student skills", () => {
  assert.equal(matchScore([], [1]), null);
  assert.equal(matchScore([1], []), null);
});
test("repeated ids do not change the score", () => {
  assert.deepEqual(matchScore([1, 1, 2], [1, 1]), { matched: 1, total: 2, percent: 50 });
});
test("filters by threshold and hides unscored jobs from threshold filters", () => {
  const half = { matched: 1, total: 2, percent: 50 };
  assert.equal(matchesScoreFilter(null, "any"), true);
  assert.equal(matchesScoreFilter(null, "50"), false);
  assert.equal(matchesScoreFilter(half, "50"), true);
  assert.equal(matchesScoreFilter(half, "75"), false);
});
test("formats scores and the pending state", () => {
  assert.equal(formatMatch({ matched: 3, total: 5, percent: 60 }), "60% (3/5)");
  assert.equal(formatMatch(null), "Pending");
});
