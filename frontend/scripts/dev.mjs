// `npm run dev`: start the website and the resume skill worker together.
// The worker is optional for the site, so if it stops the site keeps running.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const frontend = path.resolve(import.meta.dirname, "..");
const workerDir = path.resolve(frontend, "../backend/worker");
const python = path.join(workerDir, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");
const scansOff = "[dev] Resume skill scans are off";

const site = spawn(process.execPath, [path.join(frontend, "node_modules/next/dist/bin/next"), "dev", ...process.argv.slice(2)], { cwd: frontend, stdio: "inherit" });

let worker = null;
if (existsSync(python)) {
  worker = spawn(python, ["resume_skills.py", "--watch"], { cwd: workerDir, stdio: "inherit" });
  worker.on("error", () => console.error(`${scansOff}: could not start the worker.`));
  worker.on("exit", (code) => {
    worker = null;
    if (code) console.error(`${scansOff}: the worker stopped. Check backend/worker/.env, then restart npm run dev.`);
  });
} else {
  console.error(`${scansOff}: backend/worker/.venv is missing. Run python3 setup_project.py from the project root.`);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => { worker?.kill(signal); site.kill(signal); });
}
site.on("exit", (code) => {
  worker?.kill();
  process.exit(code ?? 0);
});
