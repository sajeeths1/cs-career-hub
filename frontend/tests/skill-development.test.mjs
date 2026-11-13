import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/skill-development.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { rankSkills, goalFor, resourcesFor, externalUrl } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const skills = [{ id: 1, name: "Python" }, { id: 2, name: "React" }, { id: 3, name: "SQL" }];
const demand = (skill_id, count) => ({ skill_id, count, recent_count: count, previous_count: 0, examples: [] });
const overview = (rows) => ({ total_open_jobs: 500, matching_jobs: 500, analyzed_jobs: 400, skills: rows });

test("ranks saved demand deterministically and identifies known skills", () => {
  const result = rankSkills(overview([demand(3, 20), demand(2, 20), demand(1, 30)]), skills, [1]);
  assert.deepEqual(result.map((row) => [row.skill.name, row.known]), [["Python", true], ["React", false], ["SQL", false]]);
});
test("does not invent demand from descriptions or missing skill metadata", () => {
  assert.deepEqual(rankSkills(overview([demand(999, 10), demand(1, 0)]), skills, []), []);
  assert.deepEqual(rankSkills(overview([]), skills, []), []);
});
test("preserves reporting counts and evidence without computing match scores", () => {
  const row = { ...demand(1, 320), previous_count: 250, examples: [{ id: 3, title: "Python engineer", url: "https://example.com/job", company_name: "Example" }] };
  const result = rankSkills(overview([row]), skills, [])[0];
  assert.equal(result.count, 320);
  assert.equal(result.previous_count, 250);
  assert.deepEqual(result.examples, row.examples);
});
test("resources and suggested goals come from database records", () => {
  const resources = [{ skill_id: 1, title: "Python tutorial", url: "https://docs.python.org/3/tutorial/", suggested_goal: "Build a command-line tool." }];
  assert.equal(goalFor(skills[0], resources), "Build a command-line tool.");
  assert.equal(resourcesFor(1, resources).length, 1);
  assert.equal(resourcesFor(2, resources).length, 0);
  assert.match(goalFor(skills[1], resources), /React/);
});
test("rejects executable or invalid external links and hides unsafe resources", () => {
  for (const value of ["javascript:alert(1)", "data:text/html,test", "file:///tmp/a", "/relative", "invalid"])
    assert.equal(externalUrl(value), null);
  assert.equal(externalUrl("https://example.com/job"), "https://example.com/job");
  assert.deepEqual(resourcesFor(1, [{ skill_id: 1, url: "javascript:alert(1)" }]), []);
});
