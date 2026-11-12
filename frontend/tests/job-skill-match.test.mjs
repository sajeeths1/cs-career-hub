import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/job-skill-match.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 },
});
const { getJobSkillMatch, meetsSkillMinimum } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const row = (id, name) => ({ skill_id: id, skills: { id, name } });
const job = { job_skills: [row(1, "Python"), row(2, "SQL"), row(3, "Docker")] };

test("skill match exposes its evidence using canonical IDs, not names or descriptions", () => {
  const match = getJobSkillMatch(job, [1, 2, 99]);
  assert.equal(match.percent, 67);
  assert.equal(match.total, 3);
  assert.deepEqual(match.matched.map(s => s.name), ["Python", "SQL"]);
  assert.deepEqual(match.missing.map(s => s.name), ["Docker"]);
  assert.equal(meetsSkillMinimum(match, 50), true);
  assert.equal(meetsSkillMinimum(match, 75), false);
  assert.equal(getJobSkillMatch({ job_skills: [row(7, "C++")] }, [8]).percent, 0);
});

test("missing job metadata, empty skills and failed reads never produce a false score", () => {
  for (const input of [{}, { job_skills: [] }, { job_skills: [{ skill_id: 1, skills: null }] }]) {
    const match = getJobSkillMatch(input, [1]);
    assert.equal(match.percent, null);
    assert.equal(meetsSkillMinimum(match, 0), true);
    assert.equal(meetsSkillMinimum(match, 50), false);
  }
  assert.equal(getJobSkillMatch(job, []).percent, null);
  assert.equal(getJobSkillMatch(job, null).percent, null);
  assert.equal(getJobSkillMatch(job, [99]).percent, 0);
});

test("duplicate relations and mismatched metadata cannot inflate the numerator or denominator", () => {
  const match = getJobSkillMatch({ job_skills: [row(1, "Python"), row(1, "Python"), row(2, ""), { skill_id: 9, skills: { id: 1, name: "Python" } }] }, [1, 1]);
  assert.equal(match.total, 1);
  assert.equal(match.percent, 100);
  assert.equal(meetsSkillMinimum(match, 100), true);
});

test("minimum filter uses unrounded coverage and skill edits change matches", () => {
  const many = { job_skills: Array.from({ length: 101 }, (_, i) => row(i, `Skill ${i}`)) };
  const match = getJobSkillMatch(many, Array.from({ length: 50 }, (_, i) => i));
  assert.equal(match.percent, 50);
  assert.equal(meetsSkillMinimum(match, 50), false);
  assert.equal(getJobSkillMatch(job, [1]).percent, 33);
  assert.equal(getJobSkillMatch(job, [1, 2, 3]).percent, 100);
  assert.equal(getJobSkillMatch(job, [2, 3]).percent, 67);
});
