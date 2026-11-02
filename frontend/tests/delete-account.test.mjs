import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const state = { deleted: [], tokens: [] };
globalThis.__careerHubDeleteAccountTest = state;
const asUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const mock = asUrl(`export function createClient(url, key) {
  const state = globalThis.__careerHubDeleteAccountTest;
  if (key === "public-test") return { auth: { getUser: async token => {
    state.tokens.push(token);
    return { data: { user: token === "expired" ? null : { id: "verified-user" } }, error: null };
  } } };
  return { auth: { admin: { deleteUser: async id => { state.deleted.push(id); return { error: null }; } } } };
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
});

test("delete account refuses to run without the server-only key", async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try { assert.equal((await POST(request("student"))).status, 503); }
  finally { process.env.SUPABASE_SERVICE_ROLE_KEY = "server-test"; }
  assert.deepEqual(state.deleted, ["verified-user"]);
});
