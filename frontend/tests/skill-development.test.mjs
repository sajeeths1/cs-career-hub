import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

// Use the project's compiler so these tests also run on Node 20.
const source = await readFile(new URL("../lib/skill-development.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { findSkillGaps, learningFor, learningCatalog } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const skills = [{ id: 1, name: "Python" }, { id: 2, name: "SQL" }, { id: 3, name: "React" }];
const job = (id, description, title = "Software engineer") => ({ id, title, description });

test("ranks missing skills by postings and excludes known skills", () => {
  const gaps = findSkillGaps([job(1, "Python SQL"), job(2, "SQL React")], skills, [1]);
  assert.deepEqual(gaps.map((g) => [g.skill.name, g.count]), [["SQL", 2], ["React", 1]]);
});
test("counts each job once across aliases, repeated mentions and extracted tags", () => {
  const gaps = findSkillGaps([job(1, "SQL SQL PostgreSQL"), job(1, "SQL")], skills, [], [{ job_id: 1, skill_id: 2 }]);
  assert.equal(gaps[0].count, 1);
});
test("does not match skills inside unrelated words", () => {
  assert.deepEqual(findSkillGaps([job(1, "reactive pythons nosql")], skills, []), []);
});
test("matches aliases case-insensitively in title and description", () => {
  const gaps = findSkillGaps([job(1, "PostgreSQL", "REACT.JS developer")], skills, []);
  assert.deepEqual(gaps.map((g) => g.skill.name).sort(), ["React", "SQL"]);
});
test("uses extracted skill tags only for jobs in the selected set", () => {
  const gaps = findSkillGaps([job(1, null)], skills, [], [{ job_id: 1, skill_id: 1 }, { job_id: 2, skill_id: 2 }]);
  assert.deepEqual(gaps.map((g) => g.skill.name), ["Python"]);
});
test("normalizes synonym skills and combines tags for duplicate names", () => {
  const aliases = [{ id: 1, name: "React" }, { id: 2, name: "react.js" }];
  assert.deepEqual(findSkillGaps([job(1, "React")], aliases, [2]), []);
  const gaps = findSkillGaps([job(1, null)], aliases, [], [{ job_id: 1, skill_id: 2 }]);
  assert.equal(gaps.length, 1);
  assert.equal(gaps[0].count, 1);
});
test("handles no jobs, all known skills, null descriptions and punctuation", () => {
  assert.deepEqual(findSkillGaps([], skills, []), []);
  assert.deepEqual(findSkillGaps([job(1, "Python React SQL")], skills, [1, 2, 3]), []);
  assert.equal(findSkillGaps([job(1, null, "Python/SQL")], skills, []).length, 2);
  assert.equal(findSkillGaps([job(1, "C++")], [{ id: 9, name: "C++" }], [])[0].count, 1);
});
test("each curated suggestion has an HTTPS resource and actionable goal", () => {
  for (const item of learningCatalog) {
    assert.equal(new URL(item.url).protocol, "https:");
    assert.ok(item.goal.length > 30);
    assert.equal(learningFor(item.name), item);
  }
  assert.equal(learningFor("unlisted skill"), undefined);
});
