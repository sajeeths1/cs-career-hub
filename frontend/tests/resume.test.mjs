import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/resume.ts", import.meta.url), "utf8");
const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } });
const { resumeSkills } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`);
const catalog = [{ id: 1, name: "Java" }, { id: 2, name: "JavaScript" }, { id: 3, name: "C++" }, { id: 4, name: "C#" }, { id: 5, name: "React" }, { id: 6, name: "C" }];

test("resume skill matching uses canonical names and catalog aliases", () => {
  assert.deepEqual(resumeSkills("JAVASCRIPT and React.js", catalog, [{ skill_id: 5, alias: "React.js" }]).map(s => s.id), [2, 5]);
});
test("resume skill boundaries avoid substring and C-family false positives", () => {
  assert.deepEqual(resumeSkills("JavaScript; C++; C#; reactive", catalog, []).map(s => s.id), [2, 3, 4]);
  assert.deepEqual(resumeSkills("éJava database reactive", catalog, []), []);
});
test("duplicate aliases and unknown aliases do not invent or duplicate skills", () => {
  assert.deepEqual(resumeSkills("React.js React", catalog, [{ skill_id: 5, alias: "React.js" }, { skill_id: 5, alias: "React" }, { skill_id: 999, alias: "React" }]).map(s => s.id), [5]);
  assert.deepEqual(resumeSkills("Python SQL", catalog, []), []);
});
