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
    search: "  ACME),is_open.eq.false  ", roles: ["Java developer"], workMode: "remote",
    postedDate: "week", location: "custom", locationQuery: "  Raleigh  ", matchFilter: "75",
  }, 0, today);
  assert.equal(params.p_search, "ACME),is_open.eq.false");
  assert.deepEqual(params.p_roles, ["Java developer"]);
  assert.equal(params.p_work_mode, "remote");
  assert.equal(params.p_posted_from, "2026-10-23");
  assert.equal(params.p_posted_to, "2026-10-29");
  assert.equal(params.p_location, "Raleigh");
  assert.equal(params.p_location_city, "");
  assert.equal(params.p_min_match, 75);
});

test("default filters impose no date, role, location or skill restriction", () => {
  const params = jobFeedParameters({});
  assert.deepEqual(params.p_roles, []);
  assert.equal(params.p_posted_from, null);
  assert.equal(params.p_posted_to, null);
  assert.equal(params.p_location_required, false);
  assert.equal(params.p_min_match, 0);
  assert.equal(params.p_for_you, false);
});

test("For you requests positive score ranking without requiring saved roles", () => {
  const params = jobFeedParameters({ forYou: true });
  assert.equal(params.p_for_you, true);
  assert.deepEqual(params.p_roles, []);
  assert.equal(params.p_min_match, 0);
  assert.equal(jobFeedParameters({ forYou: true, matchFilter: "50" }).p_min_match, 50);
});

test("near-me preserves the saved-city fallback and empty-location behavior", () => {
  const params = jobFeedParameters({ location: "near_me", preferredLocation: "Raleigh, NC or Remote" });
  assert.equal(params.p_location, "Raleigh, NC");
  assert.equal(params.p_location_city, "Raleigh");
  assert.equal(params.p_location_required, true);
  const empty = jobFeedParameters({ location: "near_me", preferredLocation: null });
  assert.equal(empty.p_location_required, true);
  assert.equal(empty.p_location, "");
  assert.equal(empty.p_location_city, "");
});
