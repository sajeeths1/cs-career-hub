"""Skills step: read job descriptions -> extract skills with a local LLM -> Supabase.

Run (from backend/worker, with the virtual environment turned on, AFTER pipeline.py):
    python skills.py --limit 5     # try a few jobs first
    python skills.py               # every open job that hasn't been done yet

What it does, for every open job whose skills haven't been extracted yet:
  1. Extract   - ask the model (through Ollama) which skills the posting names
  2. Normalize - map aliases to one name ("JS" -> "JavaScript") and one category
  3. Save      - add new skills, link them to the job, mark the job as done

Needs: Ollama running with MODEL pulled (`ollama pull qwen2.5:7b`), the same .env
as pipeline.py, and migration 003 run. Takes ~20 seconds per job on a laptop.
"""
import argparse
from datetime import datetime, timezone
from typing import Literal

import ollama
from pydantic import BaseModel

from pipeline import get_client

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

MODEL = "qwen2.5:7b"

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
- Mark required=false only for skills the posting calls preferred, bonus, nice-to-have,
  or "a plus". Everything else is required=true.
Return JSON matching the given schema."""

# Different spellings of the same skill -> (name we store, category).
# Keys are lowercase. Add to this whenever the model invents a new spelling.
ALIASES = {
    "js": ("JavaScript", "language"),
    "javascript": ("JavaScript", "language"),
    "ts": ("TypeScript", "language"),
    "typescript": ("TypeScript", "language"),
    "golang": ("Go", "language"),
    "go": ("Go", "language"),
    "sql": ("SQL", "language"),
    "sql databases": ("SQL", "language"),
    "c++": ("C++", "language"),
    "cpp": ("C++", "language"),
    "c#": ("C#", "language"),
    "react": ("React", "framework"),
    "react.js": ("React", "framework"),
    "reactjs": ("React", "framework"),
    "node": ("Node.js", "framework"),
    "node.js": ("Node.js", "framework"),
    "nodejs": ("Node.js", "framework"),
    "pandas": ("pandas", "framework"),
    "numpy": ("NumPy", "framework"),
    "postgres": ("PostgreSQL", "database"),
    "postgresql": ("PostgreSQL", "database"),
    "elasticsearch": ("Elasticsearch", "database"),
    "aws": ("AWS", "cloud"),
    "amazon web services": ("AWS", "cloud"),
    "gcp": ("GCP", "cloud"),
    "google cloud": ("GCP", "cloud"),
    "google cloud platform": ("GCP", "cloud"),
    "azure": ("Azure", "cloud"),
    "microsoft azure": ("Azure", "cloud"),
    "k8s": ("Kubernetes", "tool"),
    "kubernetes": ("Kubernetes", "tool"),
    "ml": ("Machine Learning", "concept"),
    "machine learning": ("Machine Learning", "concept"),
    "ai": ("AI", "concept"),
    "artificial intelligence": ("AI", "concept"),
    "llm": ("LLMs", "concept"),
    "llms": ("LLMs", "concept"),
    "ci/cd": ("CI/CD", "concept"),
}


class Skill(BaseModel):
    name: str
    category: Literal["language", "framework", "tool", "cloud", "database", "concept"]
    required: bool


class JobSkills(BaseModel):
    skills: list[Skill]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def extract_skills(title: str, description: str) -> list[Skill]:
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


def normalize(skill: Skill, known: dict[str, dict]) -> tuple[str, str]:
    """Pick the one name and category we store for this skill.

    `known` is every skill already in the database, keyed by lowercase name, so a
    skill keeps the name and category it was first saved with ("SQL" stays a
    language even if the model later calls it a database).
    """
    name, category = skill.name.strip(), skill.category
    if name.lower() in ALIASES:
        name, category = ALIASES[name.lower()]
    if name.lower() in known:
        row = known[name.lower()]
        return row["name"], row["category"]
    if name.islower():
        name = name.title()   # "financial modeling" -> "Financial Modeling"
    return name, category


# ---------------------------------------------------------------------------
# Database steps
# ---------------------------------------------------------------------------

def load_known_skills(supabase) -> dict[str, dict]:
    rows = supabase.table("skills").select("id, name, category").execute().data
    return {row["name"].lower(): row for row in rows}


def save_skills(supabase, job_id: int, skills: list[Skill], known: dict[str, dict]) -> int:
    # Merge skills that normalize to the same name ("JS" and "JavaScript").
    # Required wins if either one was required.
    merged: dict[str, dict] = {}
    for skill in skills:
        name, category = normalize(skill, known)
        entry = merged.setdefault(name.lower(), {"name": name, "category": category, "required": False})
        entry["required"] = entry["required"] or skill.required

    new_skills = [
        {"name": e["name"], "category": e["category"]}
        for key, e in merged.items() if key not in known
    ]
    if new_skills:
        for row in supabase.table("skills").insert(new_skills).execute().data:
            known[row["name"].lower()] = row

    links = [
        {"job_id": job_id, "skill_id": known[key]["id"], "required": e["required"]}
        for key, e in merged.items()
    ]
    # Replace, so re-running a job never leaves old links behind.
    supabase.table("job_skills").delete().eq("job_id", job_id).execute()
    if links:
        supabase.table("job_skills").insert(links).execute()

    supabase.table("jobs").update(
        {"skills_extracted_at": datetime.now(timezone.utc).isoformat()}
    ).eq("id", job_id).execute()
    return len(links)


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
    query = (
        supabase.table("jobs")
        .select("id, title, description")
        .eq("is_open", True)
        .is_("skills_extracted_at", "null")
        .order("id")
    )
    if args.limit:
        query = query.limit(args.limit)
    jobs = query.execute().data
    known = load_known_skills(supabase)

    print(f"{len(jobs)} jobs to do, {len(known)} skills already known.")
    done = failed = 0
    for number, job in enumerate(jobs, start=1):
        try:
            skills = extract_skills(job["title"], job["description"] or "")
            count = save_skills(supabase, job["id"], skills, known)
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
