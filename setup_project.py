#!/usr/bin/env python3
"""Install the project's frontend, job-worker and resume-parser dependencies."""
import argparse
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent


def run(command, cwd=ROOT):
    print(f"\nRunning: {subprocess.list2cmdline([str(part) for part in command])}", flush=True)
    subprocess.run([str(part) for part in command], cwd=cwd, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check prerequisites and installed dependencies without installing anything")
    args = parser.parse_args()
    if sys.version_info < (3, 11):
        raise RuntimeError("Install Python 3.11 or newer, then run this script with that Python.")
    node, npm = shutil.which("node"), shutil.which("npm")
    if not node or not npm:
        raise RuntimeError("Install Node.js 22 or newer (including npm), then rerun setup.")
    version = subprocess.check_output([node, "--version"], text=True).strip()
    if int(re.match(r"v?(\d+)", version).group(1)) < 22:
        raise RuntimeError("Node.js 22 or newer is required by the installed Supabase packages.")

    if not shutil.which("tesseract"):
        if args.check:
            raise RuntimeError("Tesseract is missing. Run setup without --check to install it on supported systems.")
        brew = shutil.which("brew")
        apt = shutil.which("apt-get")
        if sys.platform == "darwin" and brew:
            run([brew, "install", "tesseract"])
        elif sys.platform.startswith("linux") and apt:
            prefix = [] if os.geteuid() == 0 else [shutil.which("sudo") or "sudo"]
            run([*prefix, apt, "update"])
            run([*prefix, apt, "install", "-y", "tesseract-ocr", "tesseract-ocr-eng"])
        else:
            raise RuntimeError("Install Tesseract with English language data and add it to PATH, then rerun setup. On macOS, install Homebrew first to let setup install Tesseract automatically.")
    run([shutil.which("tesseract") or "tesseract", "--version"])
    languages = subprocess.check_output(["tesseract", "--list-langs"], text=True)
    if "eng" not in languages.splitlines():
        raise RuntimeError("Install Tesseract's English language data (eng), then rerun setup.")

    for folder, imports in (
        (ROOT / "backend/worker", "import supabase, requests, dotenv"),
        (ROOT / "backend/resume", "import pymupdf, PIL, pytesseract, defusedxml"),
    ):
        environment = folder / ".venv"
        python = environment / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        if not python.exists():
            if args.check:
                raise RuntimeError(f"Missing {environment.relative_to(ROOT)}. Run setup without --check.")
            run([sys.executable, "-m", "venv", environment])
        if not args.check:
            run([python, "-m", "pip", "install", "-r", folder / "requirements.txt"])
        run([python, "-m", "pip", "check"])
        run([python, "-c", imports])

    frontend = ROOT / "frontend"
    if args.check:
        run([npm, "ls", "--depth=0"], cwd=frontend)
    else:
        run([npm, "ci"], cwd=frontend)
    print("\nProject dependencies are ready. No environment files or database data were changed.")
    print("Configure your Supabase .env files if needed, then start the website:")
    print("  cd frontend")
    print("  npm run dev")


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, subprocess.CalledProcessError) as error:
        print(f"\nSetup failed: {error}", file=sys.stderr)
        sys.exit(1)
