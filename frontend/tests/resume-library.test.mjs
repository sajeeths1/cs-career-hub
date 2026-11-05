import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";

const source = await readFile(new URL("../lib/resume-library.ts", import.meta.url), "utf8");
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2020 } }).outputText;
const moduleUrl = text => `data:text/javascript;base64,${Buffer.from(text).toString("base64")}`;
const constants = moduleUrl("export const MAX_RESUME_BYTES = 5 * 1024 * 1024;");
const { resumeFileType, uploadResumeVersion } = await import(moduleUrl(output.replaceAll('"@/lib/resume"', JSON.stringify(constants))));

function client({ insertError = null, uploadError = null } = {}) {
  const calls = { uploads: [], inserts: [], removals: [] };
  return { calls,
    storage: { from(bucket) {
      assert.equal(bucket, "profile-resumes");
      return {
        upload: async (path, bytes, options) => { calls.uploads.push({ path, bytes, options }); return { error: uploadError }; },
        remove: async paths => { calls.removals.push(paths); return { error: null }; },
      };
    } },
    from(table) {
      assert.equal(table, "profile_resumes");
      return { insert(row) {
        calls.inserts.push(row);
        return { select: () => ({ single: async () => ({ data: { id: "version-id", ...row }, error: insertError }) }) };
      } };
    },
  };
}

test("resume storage type comes from bytes, preserving a mislabeled PDF", async () => {
  const db = client();
  const stored = await uploadResumeVersion(db, "user-id", new File(["%PDF-1.7 test"], "Frontend.docx", { type: "text/plain" }));
  assert.equal(stored.name, "Frontend");
  assert.equal(stored.original_filename, "Frontend.docx");
  assert.equal(stored.mime_type, "application/pdf");
  assert.match(stored.storage_path, /^user-id\/[\w-]+\.pdf$/);
  assert.equal(db.calls.uploads[0].options.upsert, false);
});

test("each upload retains a separate version even with the same filename", async () => {
  const db = client();
  const file = new File(["%PDF-1.7 test"], "Resume.pdf");
  await uploadResumeVersion(db, "user-id", file);
  await uploadResumeVersion(db, "user-id", file);
  assert.notEqual(db.calls.inserts[0].storage_path, db.calls.inserts[1].storage_path);
  assert.deepEqual(db.calls.removals, []);
});

test("failed metadata save cleans up only the newly uploaded file", async () => {
  const db = client({ insertError: new Error("Database unavailable") });
  await assert.rejects(uploadResumeVersion(db, "user-id", new File(["%PDF-1.7 test"], "Resume.pdf")), /Database unavailable/);
  assert.deepEqual(db.calls.removals, [[db.calls.uploads[0].path]]);
});

test("failed upload does not create a resume entry", async () => {
  const db = client({ uploadError: new Error("Storage unavailable") });
  await assert.rejects(uploadResumeVersion(db, "user-id", new File(["%PDF-1.7 test"], "Resume.pdf")), /Storage unavailable/);
  assert.deepEqual(db.calls.inserts, []);
});

test("empty, oversized and unsupported files are rejected before storage", async () => {
  const db = client();
  for (const file of [new File([], "empty.pdf"), new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.pdf"), new File(["plain text"], "fake.pdf")]) {
    await assert.rejects(uploadResumeVersion(db, "user-id", file));
  }
  assert.deepEqual(db.calls.uploads, []);
  assert.equal(resumeFileType(new Uint8Array([255, 216, 255])).extension, "jpg");
});
