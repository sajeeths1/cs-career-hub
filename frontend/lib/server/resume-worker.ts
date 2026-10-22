import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { ParsedResume } from "../resume";

export class ResumeWorkerError extends Error {
  constructor(message: string, public status = 422) { super(message); }
}

/** Fixed executable/script arguments; document bytes travel through stdin only. */
export function runResumeWorker(bytes: Uint8Array, signal?: AbortSignal): Promise<Omit<ParsedResume, "skills" | "warnings">> {
  const root = path.basename(process.cwd()) === "frontend" ? path.dirname(process.cwd()) : process.cwd();
  const script = path.join(root, "backend/resume/parse_resume.py");
  const venv = path.join(root, "backend/resume/.venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
  const python = process.env.RESUME_PYTHON_BIN || (existsSync(venv) ? venv : "python3");
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new ResumeWorkerError("Resume parsing cancelled.", 499)); return; }
    const child = spawn(python, [script], {
      detached: process.platform !== "win32",
      stdio: ["pipe", "pipe", "pipe"],
      // The parser needs no Supabase credentials or third-party API keys.
      env: { NODE_ENV: process.env.NODE_ENV, PATH: process.env.PATH, TMPDIR: process.env.TMPDIR, LANG: "en_US.UTF-8", PYTHONIOENCODING: "utf-8", OMP_THREAD_LIMIT: "1" },
    });
    let output = "";
    let settled = false;
    const stop = () => {
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch { /* The process may already have exited. */ }
    };
    const finish = (error?: Error, result?: Omit<ParsedResume, "skills" | "warnings">) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (error) { stop(); reject(error); } else resolve(result!);
    };
    const abort = () => finish(new ResumeWorkerError("Resume parsing cancelled.", 499));
    const timer = setTimeout(() => finish(new ResumeWorkerError("Resume parsing timed out. Try a shorter or clearer resume.", 504)), 90_000);
    signal?.addEventListener("abort", abort, { once: true });
    child.on("error", () => finish(new ResumeWorkerError("Resume parser is unavailable. Install the backend/resume dependencies.", 503)));
    child.stdin.on("error", () => { /* A failed worker is handled by close/error below. */ });
    child.stderr.resume(); // Never return subprocess logs that might contain personal data.
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
      if (output.length > 1_000_000) finish(new ResumeWorkerError("Resume parser output exceeded its limit."));
    });
    child.on("close", (code) => {
      if (settled) return;
      if (code !== 0) { finish(new ResumeWorkerError("Resume parser is unavailable. Install the backend/resume dependencies.", 503)); return; }
      try {
        const result = JSON.parse(output);
        if (typeof result.error === "string") { finish(new ResumeWorkerError(result.error)); return; }
        if (typeof result.text !== "string" || !result.details || !result.metadata) throw new Error();
        finish(undefined, result);
      } catch { finish(new ResumeWorkerError("Resume parser returned an invalid result.", 503)); }
    });
    child.stdin.end(bytes);
  });
}
