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
const state = { worker: async () => parsed, calls: 0, saveFailure: false, uploadFailure: false, replaced: [], tokens: [], saves: [], uploads: [], removed: [] };
const stateKey = '__careerHubResumeRouteTest';
globalThis[stateKey] = state;
const mockSupabase = asUrl(`export function createClient(url, key, options) {
 const state = globalThis.${stateKey};
 return { auth: { getUser: async token => { state.tokens.push([token, options.global.headers.Authorization]); return {data:{user:token === 'expired' ? null : {id:token}}, error:null}; } },
 storage: { from: bucket => ({
  upload: async (path, bytes, opts) => { if (state.uploadFailure) return {error:{message:'Storage offline'}}; state.uploads.push({bucket, path, size: bytes.length, ...opts, auth: options.global.headers.Authorization}); return {error:null}; },
  remove: async paths => { state.removed.push(paths); return {error:null}; },
 }) },
 rpc: async (name, params) => { if (state.saveFailure) return {error:{message:'Database offline'}}; state.saves.push([name, params, options.global.headers.Authorization]); return {data:state.replaced,error:null}; } };
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
const PDF = '%PDF-1.7 resume';
test('resume endpoint stores the file and queues the text with user credentials', async () => {
 const response = await POST(request('student',PDF,{'X-Resume-Filename':encodeURIComponent('Alex Résumé.pdf')}));
 assert.equal(response.status, 200);
 assert.equal(response.headers.get('Cache-Control'), 'no-store');
 const result = await response.json();
 assert.equal(result.scan,'queued');
 assert.deepEqual(result.warnings,[]);
 assert.deepEqual(state.tokens.at(-1), ['student','Bearer student']);
 const upload = state.uploads.at(-1);
 assert.match(upload.path,/^student\/[0-9a-f-]{36}\.pdf$/);
 assert.deepEqual({...upload,path:null},{bucket:'resumes',path:null,size:PDF.length,contentType:'application/pdf',upsert:false,auth:'Bearer student'});
 assert.deepEqual(state.saves.at(-1), ['save_uploaded_resume',{p_original_filename:'Alex Résumé.pdf',p_storage_path:upload.path,p_mime_type:'application/pdf',p_file_size_bytes:PDF.length,p_extracted_text:parsed.text},'Bearer student']);
});
test('file type comes from the bytes, not the name, and the path ignores the name', async () => {
 await POST(request('student','PK\u0003\u0004 docx',{'X-Resume-Filename':encodeURIComponent('../../evil.pdf')}));
 assert.match(state.uploads.at(-1).path,/^student\/[0-9a-f-]{36}\.docx$/);
 assert.match(state.uploads.at(-1).contentType,/wordprocessingml/);
});
test('images and unknown types keep text only', async () => {
 const before = state.uploads.length;
 const response = await POST(request('student',new Uint8Array([0xff,0xd8,0xff,0xe0]),{'X-Resume-Filename':'photo.pdf'}));
 assert.equal((await response.json()).scan,'queued');
 assert.equal(state.uploads.length,before);
 assert.equal(state.saves.at(-1)[1].p_storage_path,null);
 assert.equal(state.saves.at(-1)[1].p_mime_type,'image/jpeg');
 await POST(request());
 assert.equal(state.saves.at(-1)[1].p_mime_type,'application/octet-stream');
 assert.equal(state.uploads.length,before);
});
test('missing or malformed filenames fall back to a safe default', async () => {
 await POST(request());
 assert.equal(state.saves.at(-1)[1].p_original_filename,'resume');
 await POST(request('student','resume',{'X-Resume-Filename':'%E0%A4%A'}));
 assert.equal(state.saves.at(-1)[1].p_original_filename,'resume');
});
test('replaced files are removed from storage', async () => {
 state.replaced = ['student/old.pdf'];
 try { await POST(request('student',PDF)); } finally { state.replaced = []; }
 assert.deepEqual(state.removed.at(-1),['student/old.pdf']);
});
test('a failed file upload still queues the scan and warns', async () => {
 state.uploadFailure = true;
 try {
 const result = await (await POST(request('student',PDF))).json();
 assert.equal(result.scan,'queued');
 assert.match(result.warnings[0],/could not keep a copy/);
 assert.equal(state.saves.at(-1)[1].p_storage_path,null);
 } finally { state.uploadFailure = false; }
});
test('a failed save removes the file it just uploaded', async () => {
 state.saveFailure = true;
 try { await POST(request('student',PDF)); } finally { state.saveFailure = false; }
 assert.deepEqual(state.removed.at(-1),[state.uploads.at(-1).path]);
});
test('a failed save preserves extraction and shows a warning', async () => {
 state.saveFailure = true;
 try {
 const response = await POST(request());
 assert.equal(response.status,200);
 const result = await response.json();
 assert.equal(result.details.full_name,'Alex Morgan');
 assert.equal(result.scan,'failed');
 assert.match(result.warnings[0],/could not save/);
 } finally { state.saveFailure = false; }
});
test('nothing is saved when parsing fails', async () => {
 const saves = state.saves.length;
 const uploads = state.uploads.length;
 state.worker = async () => { throw new ResumeWorkerError('Remove the PDF password before uploading.'); };
 try { await POST(request('student',PDF)); } finally { state.worker = async () => parsed; }
 assert.equal(state.saves.length,saves);
 assert.equal(state.uploads.length,uploads);
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
