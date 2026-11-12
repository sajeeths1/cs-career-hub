import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/job-filters.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const { matchesPostedDate, matchesLocation, matchesAnyLocation, normalizeLocation } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
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

test("preferred and custom location filters do not infer a GPS radius", () => {
  assert.equal(matchesLocation("Raleigh, NC", "near_me", "Raleigh, NC or Remote", ""), true);
  assert.equal(matchesLocation("Raleigh", "near_me", "Raleigh, NC or Remote", ""), true);
  assert.equal(matchesLocation("Charlotte, NC", "near_me", "Raleigh, NC", ""), false);
  assert.equal(matchesLocation("Remote, USA", "near_me", null, ""), false);
  assert.equal(matchesLocation("Austin, TX", "custom", null, "austin"), true);
  assert.equal(matchesLocation(null, "custom", null, "austin"), false);
});

test("multiple locations match any selected place, including multi-office postings", () => {
  assert.equal(matchesAnyLocation("Raleigh, NC; Austin, TX", ["Seattle", "Austin, TX"]), true);
  assert.equal(matchesAnyLocation("Seattle, WA", ["Raleigh", "Seattle"]), true);
  assert.equal(matchesAnyLocation("Raleigh, NC", ["Raleigh, NC"]), true);
  assert.equal(matchesAnyLocation("Charlotte, NC", ["Raleigh", "Seattle"]), false);
  assert.equal(matchesAnyLocation(null, []), true);
  assert.equal(matchesAnyLocation(null, ["Raleigh"]), false);
  assert.equal(matchesAnyLocation("Remote, US", ["Raleigh"]), false);
});

test("location names ignore case, accents and punctuation, but respect word boundaries", () => {
  assert.equal(matchesAnyLocation("Montréal, Québec", ["montreal"]), true);
  assert.equal(matchesAnyLocation("RALEIGH, NC", [" Raleigh nc "]), true);
  assert.equal(matchesAnyLocation("France", ["NC"]), false);
  assert.equal(matchesAnyLocation("Austintown, OH", ["Austin"]), false);
  assert.equal(matchesAnyLocation("New York, NY", ["York"]), true);
  assert.equal(normalizeLocation(" Raleigh, NC "), normalizeLocation("raleigh nc"));
});
