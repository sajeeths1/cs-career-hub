import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

async function moduleUrl(path) {
  const source = await readFile(new URL(path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
  });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}
const filterUrl = await moduleUrl("../lib/job-filters.ts");
const feedUrl = await moduleUrl("../lib/job-feed.ts");
const source = Buffer.from(feedUrl.split(",")[1], "base64").toString().replace('"./job-filters"', JSON.stringify(filterUrl));
const { jobFeedParameters, JOB_PAGE_SIZE } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const today = new Date(2026, 9, 29, 12);

test("pagination reaches beyond 300 results in bounded pages", () => {
  assert.equal(JOB_PAGE_SIZE, 50);
  assert.equal(jobFeedParameters({}, 6).p_offset, 300);
  assert.equal(jobFeedParameters({}, 20).p_offset, 1000);
  assert.equal(jobFeedParameters({}, 20).p_limit, 50);
  for (const page of [-1, 0.5, NaN]) assert.throws(() => jobFeedParameters({}, page), /page/);
});

test("all feed filters are supplied as RPC parameters, not query grammar", () => {
  const params = jobFeedParameters({
    search: "  ACME),is_open.eq.false  ", workMode: "remote",
    postedDate: "week", locations: ["  Raleigh  ", "Austin, TX"], minimumMatch: 75,
  }, 0, today);
  assert.equal(params.p_search, "ACME),is_open.eq.false");
  assert.equal(params.p_work_mode, "remote");
  assert.equal(params.p_posted_from, "2026-10-23");
  assert.equal(params.p_posted_to, "2026-10-29");
  assert.deepEqual(params.p_locations, ["raleigh", "austin tx"]);
  assert.equal(params.p_min_match, 75);
});

test("default filters impose no date, role, location or skill restriction", () => {
  const params = jobFeedParameters({});
  assert.equal(params.p_posted_from, null);
  assert.equal(params.p_posted_to, null);
  assert.deepEqual(params.p_locations, []);
  assert.equal(params.p_min_match, 0);
  assert.equal(params.p_for_you, false);
});

test("For you requests positive score ranking without requiring saved roles", () => {
  const params = jobFeedParameters({ forYou: true });
  assert.equal(params.p_for_you, true);
  assert.equal(params.p_min_match, 0);
  assert.equal(jobFeedParameters({ forYou: true, minimumMatch: 50 }).p_min_match, 50);
});

test("location chips normalize and deduplicate without splitting city/state names", () => {
  const params = jobFeedParameters({ locations: ["Raleigh, NC", "raleigh nc", "São Paulo", "!!!"] });
  assert.deepEqual(params.p_locations, ["raleigh nc", "sao paulo"]);
});

test("all-recorded-skills option reaches the database and invalid thresholds fail explicitly", () => {
  assert.equal(jobFeedParameters({ minimumMatch: 100 }).p_min_match, 100);
  for (const minimumMatch of [-1, 49, 101, NaN]) {
    assert.throws(() => jobFeedParameters({ minimumMatch }), /minimum skill match/);
  }
});
