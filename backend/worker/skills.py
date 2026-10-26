"""Skills step: read job descriptions -> extract skills with a local LLM -> Supabase.

Run (from backend/worker, with the virtual environment turned on, AFTER pipeline.py):
    python skills.py --limit 5     # try a few jobs first
    python skills.py               # every open job that hasn't been done yet

What it does, for every open job this model hasn't done yet (or whose title or
description changed since):
  1. Extract   - ask the model (through Ollama) which skills the posting names
  2. Normalize - map aliases to one name ("JS" -> "JavaScript"), using ALIASES
                 and the team's skill_aliases table
  3. Save      - add new skills, then save the job's skills with the team's
                 save_job_skill_extraction function (migration 005)

This replaces results from the keyword extractor on development's skills.py, and
that one leaves our results alone unless the posting changes.

Needs: Ollama running with MODEL pulled (`ollama pull qwen2.5:7b`), the same .env
as pipeline.py, and migrations 003-005 from the development branch run.
Takes ~20 seconds per job on a laptop.
"""
import argparse
import hashlib
import json

import ollama
from pydantic import BaseModel

from pipeline import get_client

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

MODEL = "qwen2.5:7b"
# Saved with each job's skills. Bump the number after changing SYSTEM or ALIASES
# so the next run redoes every job.
EXTRACTOR_VERSION = f"llm-{MODEL}-v1"
PAGE_SIZE = 1000   # Supabase returns at most 1000 rows per request

SYSTEM = """You extract the technical skills a job posting asks for.

A skill is a specific, named technology or a well-known technical concept:
- language: Python, Java, SQL, Go, TypeScript, Bash
- framework: React, Django, Spring, PyTorch, pandas (libraries count too)
- database: PostgreSQL, MySQL, MongoDB, Snowflake, Redis
- cloud: AWS, GCP, Azure
- tool: Docker, Kubernetes, Git, Jenkins, Tableau, Looker, Jira
- concept: Machine Learning, CI/CD, Distributed Systems, Networking

Do NOT include job duties, industries, experience areas, or soft skills
(e.g. not "Investment Banking", "Data exploration", "Communication").

- Only include skills the posting actually names. Return an empty list if there are none.
- Use short canonical names (1-3 words): "JavaScript" not "JS", "PostgreSQL" not "Postgres", "SQL" not "SQL databases".
- List each skill once.
Return JSON matching the given schema."""

# Different spellings of the same skill -> the name we store. Keys are lowercase.
# Add to this whenever the model invents a new spelling. The team's skill_aliases
# table is checked too, after this.
ALIASES: dict[str, str] = {
    "js": "JavaScript",
    "javascript": "JavaScript",
    "ts": "TypeScript",
    "typescript": "TypeScript",
    "golang": "Go",
    "go": "Go",
    "sql": "SQL",
    "sql databases": "SQL",
    "c++": "C++",
    "cpp": "C++",
    "c#": "C#",
    "react": "React",
    "react.js": "React",
    "reactjs": "React",
    "node": "Node.js",
    "node.js": "Node.js",
    "nodejs": "Node.js",
    "pandas": "pandas",
    "numpy": "NumPy",
    "postgres": "PostgreSQL",
    "postgresql": "PostgreSQL",
    "elasticsearch": "Elasticsearch",
    "aws": "AWS",
    "amazon web services": "AWS",
    "gcp": "GCP",
    "google cloud": "GCP",
    "google cloud platform": "GCP",
    "azure": "Azure",
    "microsoft azure": "Azure",
    "k8s": "Kubernetes",
    "kubernetes": "Kubernetes",
    "ml": "Machine Learning",
    "machine learning": "Machine Learning",
    "ai": "AI",
    "artificial intelligence": "AI",
    "llm": "LLMs",
    "llms": "LLMs",
    "ci/cd": "CI/CD",
}


class JobSkills(BaseModel):
    skills: list[str]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def extract_skills(title: str, description: str) -> list[str]:
    resp = ollama.chat(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": f"Title: {title}\n\n{description}"},
        ],
        format=JobSkills.model_json_schema(),   # forces output to match the schema
        options={"temperature": 0, "num_ctx": 8192},
    )
    return JobSkills.model_validate_json(resp.message.content).skills


def normalize(name: str, known: dict[str, dict]) -> str:
    """Pick the one name we store for this skill.

    `known` is every skill name and alias already in the database, lowercase ->
    skill row, so a skill keeps the name it was first saved with.
    """
    name = name.strip()
    name = ALIASES.get(name.lower(), name)
    if name.lower() in known:
        return known[name.lower()]["name"]
    if name.islower():
        name = name.title()   # "financial modeling" -> "Financial Modeling"
    return name


def input_hash(job: dict) -> str:
    """Fingerprint of the posting, computed the same way as development's skills.py."""
    text = json.dumps([job["title"], job.get("description")], ensure_ascii=False)
    return hashlib.sha256(text.encode()).hexdigest()


def needs_extraction(job: dict) -> bool:
    marker = job.get("job_skill_extractions") or {}
    if isinstance(marker, list):   # PostgREST can return the marker either way
        marker = marker[0] if marker else {}
    return (marker.get("extractor_version") != EXTRACTOR_VERSION
            or marker.get("input_hash") != input_hash(job))


# ---------------------------------------------------------------------------
# Database steps
# ---------------------------------------------------------------------------

def fetch_all(make_query) -> list[dict]:
    """Run a query page by page. `make_query` builds a fresh query each time."""
    rows: list[dict] = []
    while True:
        page = make_query().range(len(rows), len(rows) + PAGE_SIZE - 1).execute().data
        rows += page
        if len(page) < PAGE_SIZE:
            return rows


def load_known_skills(supabase) -> dict[str, dict]:
    skills = {row["id"]: row for row in fetch_all(
        lambda: supabase.table("skills").select("id, name").order("id"))}
    known = {row["name"].strip().lower(): row for row in skills.values()}
    for row in fetch_all(lambda: supabase.table("skill_aliases").select("alias, skill_id").order("alias")):
        if row["skill_id"] in skills:
            known.setdefault(row["alias"], skills[row["skill_id"]])
    return known


def save_skills(supabase, job: dict, skills: list[str], known: dict[str, dict]) -> int:
    # Merge skills that normalize to the same name ("JS" and "JavaScript").
    names = {}
    for skill in skills:
        name = normalize(skill, known)
        names.setdefault(name.lower(), name)

    new_skills = [{"name": name} for key, name in names.items() if key not in known]
    if new_skills:
        for row in supabase.table("skills").insert(new_skills).execute().data:
            known[row["name"].lower()] = row

    skill_ids = sorted({known[key]["id"] for key in names})
    # Replaces the job's old skills and marks it done in one step. Fails if the
    # posting changed or closed since we read it; the next run retries it.
    supabase.rpc("save_job_skill_extraction", {
        "p_job_id": job["id"],
        "p_skill_ids": skill_ids,
        "p_input_hash": input_hash(job),
        "p_extractor_version": EXTRACTOR_VERSION,
        "p_expected_title": job["title"],
        "p_expected_description": job.get("description"),
    }).execute()
    return len(skill_ids)


def main():
    parser = argparse.ArgumentParser(description="Extract skills from job descriptions.")
    parser.add_argument("--limit", type=int, help="only do this many jobs (for testing)")
    args = parser.parse_args()

    try:
        ollama.show(MODEL)
    except Exception as error:
        print(f"Can't reach Ollama or model {MODEL} isn't pulled ({error}).\n"
              f"Start it with `brew services start ollama` and run `ollama pull {MODEL}`.")
        return

    supabase = get_client()
    jobs = [job for job in fetch_all(
        lambda: supabase.table("jobs")
        .select("id, title, description, job_skill_extractions(input_hash, extractor_version)")
        .eq("is_open", True)
        .order("id")
    ) if needs_extraction(job)]
    if args.limit:
        jobs = jobs[:args.limit]
    known = load_known_skills(supabase)

    print(f"{len(jobs)} jobs to do, {len(known)} skills already known.")
    done = failed = 0
    for number, job in enumerate(jobs, start=1):
        try:
            skills = extract_skills(job["title"], job["description"] or "")
            count = save_skills(supabase, job, skills, known)
        except Exception as error:   # a bad answer or a network blip shouldn't stop the run
            print(f"  ! [{number}/{len(jobs)}] {job['title']}: skipped ({error})")
            failed += 1
            continue
        done += 1
        print(f"  [{number}/{len(jobs)}] {job['title']}: {count} skills")

    print(f"\nDone. {done} jobs done, {failed} skipped (they'll be retried next run), "
          f"{len(known)} skills known.")


if __name__ == "__main__":
    main()
