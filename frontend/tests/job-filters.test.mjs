import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/job-filters.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const { matchesPostedDate } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const today = new Date(2026, 9, 29, 12);

test("date filters include today and their exact calendar-day boundaries", () => {
  assert.equal(matchesPostedDate("2026-10-29", "today", today), true);
  assert.equal(matchesPostedDate("2026-10-28", "today", today), false);
  assert.equal(matchesPostedDate("2026-10-23", "week", today), true);
  assert.equal(matchesPostedDate("2026-10-22", "week", today), false);
  assert.equal(matchesPostedDate("2026-09-30", "month", today), true);
  assert.equal(matchesPostedDate("2026-09-29", "month", today), false);
  assert.equal(matchesPostedDate("2026-10-30", "week", today), false);
});

test("undated postings remain visible only when no date filter is selected", () => {
  assert.equal(matchesPostedDate(null, "any", today), true);
  assert.equal(matchesPostedDate(null, "week", today), false);
  assert.equal(matchesPostedDate("invalid", "month", today), false);
});
