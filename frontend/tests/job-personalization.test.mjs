import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/job-personalization.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { parseTargetRoles, matchesTargetRoles, targetRolesQuery, collectRoleMatches, ROLE_JOB_PAGE_SIZE } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);

test("parses separated roles and deduplicates normalized variants", () => {
  assert.deepEqual(parseTargetRoles(" Front-end developer, frontend engineering; Data analyst\n ; "), ["Front-end developer", "Data analyst"]);
  assert.deepEqual(parseTargetRoles(null), []);
  assert.deepEqual(parseTargetRoles(" , ; !!!"), []);
});
test("matches any target role, requiring all its words regardless of title word order", () => {
  const roles = ["frontend developer", "data analyst"];
  assert.ok(matchesTargetRoles("Frontend Software Engineer Intern", roles));
  assert.ok(matchesTargetRoles("Analyst, Data", roles));
  assert.equal(matchesTargetRoles("Data Engineer", roles), false);
  assert.equal(matchesTargetRoles("Account Executive", roles), false);
});
test("recognizes common role spellings, professions and abbreviations", () => {
  for (const [target, title] of [["software engineering", "SWE Intern"], ["full stack developer", "Full-Stack Engineer"], ["backend", "Back End Intern"], ["ML engineer", "Machine Learning Engineer"], ["AI engineer", "Artificial Intelligence Engineer"], ["data science", "Data Scientist"]])
    assert.ok(matchesTargetRoles(title, [target]), `${target} should match ${title}`);
});
test("avoids substring false positives and never matches empty preferences", () => {
  assert.equal(matchesTargetRoles("JavaScript Developer", ["Java developer"]), false);
  assert.equal(matchesTargetRoles("Database Administrator", ["data"]), false);
  assert.equal(matchesTargetRoles("Software Engineer", []), false);
  assert.equal(matchesTargetRoles("Software Engineer", ["!!!"]), false);
});
test("preserves the distinction between C, C++ and C# roles", () => {
  assert.ok(matchesTargetRoles("C++ Software Engineer", ["C++ developer"]));
  assert.ok(matchesTargetRoles("C# Developer", ["C# engineer"]));
  assert.equal(matchesTargetRoles("C# Developer", ["C++ developer"]), false);
  assert.equal(matchesTargetRoles("C++ Engineer", ["C developer"]), false);
});
test("query only interpolates normalized title terms into fixed PostgREST grammar", () => {
  assert.equal(targetRolesQuery([]), null);
  assert.match(targetRolesQuery(["front-end developer"]), /front%end/);
  const filter = targetRolesQuery(['frontend),is_open.eq.false; title.ilike.*']);
  assert.equal(filter.includes("is_open.eq.false"), false);
  assert.equal(filter.includes("*"), false);
  assert.match(filter, /^[a-z0-9%.,()]+$/);
});
test("scans past 300 candidate rows and filters substring false positives", async () => {
  const rows = Array.from({length: 405}, (_, id) => ({id, title: id < 400 ? "JavaScript Developer" : "Java Developer"}));
  const offsets = [];
  const matches = await collectRoleMatches(["Java developer"], async (offset, size) => { offsets.push(offset); return rows.slice(offset, offset + size); });
  assert.equal(matches.length, 5);
  assert.deepEqual(offsets, [0, ROLE_JOB_PAGE_SIZE, ROLE_JOB_PAGE_SIZE * 2]);
});
test("keeps order, deduplicates repeated IDs and stops at the result limit", async () => {
  const matches = await collectRoleMatches(["frontend"], async () => [{id:3,title:"Frontend Engineer"},{id:3,title:"Frontend Engineer"},{id:2,title:"Frontend Developer"},{id:1,title:"Frontend Intern"}], 2);
  assert.deepEqual(matches.map(j => j.id), [3,2]);
});
test("does not fetch without roles and surfaces failed requests", async () => {
  let calls = 0;
  assert.deepEqual(await collectRoleMatches([], async () => { calls++; return []; }), []);
  assert.equal(calls, 0);
  await assert.rejects(collectRoleMatches(["data"], async () => {throw new Error("Network failed");}), /Network failed/);
  await assert.rejects(collectRoleMatches(["data"], async () => [], 0), /limit/);
});
