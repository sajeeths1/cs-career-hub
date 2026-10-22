import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

async function moduleSource(file) {
  const source = await readFile(new URL(file, import.meta.url), 'utf8');
  return ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
}
const asUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const resumeUrl = asUrl(await moduleSource('../lib/resume.ts'));
const parsed = { text: 'Alex Morgan\nPython and SQL', details: { full_name: 'Alex Morgan', major: '', school: '', email: '', phone: '', links: [], sections: {} }, metadata: { pages: 1, ocr_pages: 0 } };
const state = { worker: async () => parsed, calls: 0, catalogFailure: false, tokens: [] };
const stateKey = '__careerHubResumeRouteTest';
globalThis[stateKey] = state;
const mockSupabase = asUrl(`export function createClient(url, key, options) {
 const state = globalThis.${stateKey};
 return { auth: { getUser: async token => { state.tokens.push([token, options.global.headers.Authorization]); return {data:{user:token === 'expired' ? null : {id:token}}, error:null}; } },
 from: table => ({select: () => ({order: () => ({range: async () => state.catalogFailure ? {error:{message:'Catalog offline'}} : {data:table === 'skills' ? [{id:1,name:'Python'},{id:2,name:'SQL'}] : [],error:null} })})}) };
}`);
const mockWorker = asUrl(`export class ResumeWorkerError extends Error {constructor(message,status=422){super(message);this.status=status;}} export async function runResumeWorker(bytes,signal){ const state=globalThis.${stateKey};state.calls++;return state.worker(bytes,signal); }`);
const routeSource = (await moduleSource('../app/api/resume/route.ts'))
  .replaceAll('"@supabase/supabase-js"', JSON.stringify(mockSupabase))
  .replaceAll('"@/lib/resume"', JSON.stringify(resumeUrl))
  .replaceAll('"@/lib/server/resume-worker"', JSON.stringify(mockWorker));
const { POST } = await import(asUrl(routeSource));
const { ResumeWorkerError } = await import(mockWorker);
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.invalid';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-public-key';
const request = (token = 'student', body = 'resume', headers = {}) => new Request('http://localhost/api/resume', { method:'POST', body, headers: { ...(token ? {Authorization:`Bearer ${token}`} : {}), ...headers } });

test('resume endpoint rejects unsigned and invalid sessions before invoking OCR', async () => {
 const before = state.calls;
 assert.equal((await POST(request(null))).status, 401);
 assert.equal((await POST(request('expired'))).status, 401);
 assert.equal(state.calls, before);
});
test('resume endpoint bounds both advertised and streamed document sizes', async () => {
 const before = state.calls;
 assert.equal((await POST(request('student','x',{'Content-Length':String(5*1024*1024+1)}))).status, 413);
 assert.equal((await POST(request('student',new Uint8Array(5*1024*1024+1)))).status, 413);
 assert.equal(state.calls, before);
});
test('resume endpoint returns uncached extraction with live skill matches and user credentials', async () => {
 const response = await POST(request());
 assert.equal(response.status, 200);
 assert.equal(response.headers.get('Cache-Control'), 'no-store');
 const result = await response.json();
 assert.deepEqual(result.skills.map(skill=>skill.name), ['Python','SQL']);
 assert.deepEqual(state.tokens.at(-1), ['student','Bearer student']);
});
test('catalog outage preserves extraction and shows a warning', async () => {
 state.catalogFailure = true;
 try {
 const result = await (await POST(request())).json();
 assert.equal(result.details.full_name,'Alex Morgan');
 assert.deepEqual(result.skills,[]);
 assert.match(result.warnings[0],/could not be loaded/);
 } finally { state.catalogFailure = false; }
});
test('worker errors are actionable and release capacity for retry', async () => {
 state.worker = async () => { throw new ResumeWorkerError('Remove the PDF password before uploading.'); };
 try { const response = await POST(request()); assert.equal(response.status,422); assert.match((await response.json()).error,/password/); }
 finally { state.worker = async () => parsed; }
 assert.equal((await POST(request())).status,200);
});
test('concurrent requests from one student are rejected while a parse is running', async () => {
 let release;
 state.worker = () => new Promise(resolve => { release = resolve; });
 const pending = POST(request());
 while (!release) await new Promise(resolve => setTimeout(resolve, 1));
 try { assert.equal((await POST(request())).status,429); }
 finally { release(parsed); await pending; state.worker = async () => parsed; }
 assert.equal((await POST(request())).status,200);
});
