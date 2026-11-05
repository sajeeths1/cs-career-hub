import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const state = {
  deleted: [], tokens: [], resumeDeletes: [], resumeFailure: false, fileFailure: false, listed: [], removed: [],
  rows: [{ storage_path: "verified-user/a.pdf" }, { storage_path: "not-stored/1" }], libraryFailure: false,
  folder: [{ name: "a.pdf" }, { name: "leftover.pdf" }],
};
globalThis.__careerHubDeleteAccountTest = state;
const asUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const mock = asUrl(`export function createClient(url, key) {
  const state = globalThis.__careerHubDeleteAccountTest;
  if (key === "public-test") return { auth: { getUser: async token => {
    state.tokens.push(token);
    return { data: { user: token === "expired" ? null : { id: "verified-user" } }, error: null };
  } } };
  return {
    from: table => ({
      select: () => ({ eq: async () => ({ data: state.rows, error: null }) }),
      delete: () => ({ eq: async (column, value) => {
        if (state.resumeFailure) return { error: { message: "offline" } };
        state.resumeDeletes.push([table, column, value]);
        return { error: null };
      } }),
    }),
    storage: { from: bucket => ({
      list: async folder => { state.listed.push([bucket, folder]); return { data: state.folder, error: null }; },
      remove: async paths => {
        if (state.fileFailure || (bucket === "profile-resumes" && state.libraryFailure)) return { error: { message: "offline" } };
        state.removed.push(paths);
        return { error: null };
      },
    }) },
    auth: { admin: { deleteUser: async id => { state.deleted.push(id); return { error: null }; } } },
  };
}`);
const source = await readFile(new URL("../app/api/account/delete/route.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const { POST } = await import(asUrl(output.replaceAll('"@supabase/supabase-js"', JSON.stringify(mock))));
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "public-test";
process.env.SUPABASE_SERVICE_ROLE_KEY = "server-test";
const request = (token, confirmation = "DELETE") => new Request("http://localhost/api/account/delete", {
  method: "POST",
  headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: JSON.stringify({ confirmation }),
});

test("delete account requires a valid session and explicit confirmation", async () => {
  assert.equal((await POST(request(null))).status, 401);
  assert.equal((await POST(request("expired"))).status, 401);
  assert.equal((await POST(request("student", "no"))).status, 400);
  assert.deepEqual(state.deleted, []);
});

test("delete account can delete only the server-verified caller", async () => {
  const response = await POST(request("student"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.deepEqual(state.deleted, ["verified-user"]);
  assert.deepEqual(state.tokens, ["expired", "student"]);
  assert.deepEqual(state.resumeDeletes, [["resumes", "user_id", "verified-user"], ["profile_resumes", "user_id", "verified-user"]]);
  assert.deepEqual(state.listed, [["resumes", "verified-user"], ["profile-resumes", "verified-user"]]);
  assert.deepEqual(state.removed, [["verified-user/a.pdf", "verified-user/leftover.pdf"], ["verified-user/a.pdf", "verified-user/leftover.pdf"]]);
});

test("delete account stops if stored resume text could not be removed", async () => {
  const before = state.deleted.length;
  state.resumeFailure = true;
  try {
    assert.equal((await POST(request("student"))).status, 500);
    assert.equal(state.deleted.length, before);
  } finally { state.resumeFailure = false; }
});

test("delete account stops if resume files could not be removed", async () => {
  const deleted = state.deleted.length;
  const rowDeletes = state.resumeDeletes.length;
  state.fileFailure = true;
  try {
    assert.equal((await POST(request("student"))).status, 500);
    assert.equal(state.deleted.length, deleted);
    assert.equal(state.resumeDeletes.length, rowDeletes);
  } finally { state.fileFailure = false; }
});

test("delete account refuses to run without the server-only key", async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try { assert.equal((await POST(request("student"))).status, 503); }
  finally { process.env.SUPABASE_SERVICE_ROLE_KEY = "server-test"; }
  assert.deepEqual(state.deleted, ["verified-user"]);
});

test("delete account stops if a library version could not be removed", async () => {
  const before = state.deleted.length;
  state.libraryFailure = true;
  try {
    assert.equal((await POST(request("student"))).status, 500);
    assert.equal(state.deleted.length, before);
  } finally { state.libraryFailure = false; }
});
