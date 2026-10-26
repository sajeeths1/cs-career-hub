"""Preview skills for a few real jobs. Read-only: writes nothing to the database.

Run (from backend/worker, with the virtual environment turned on):
    python try_skills.py
"""
from pipeline import get_client
from skills import extract_skills, load_known_skills, normalize

if __name__ == "__main__":
    supabase = get_client()
    known = load_known_skills(supabase)
    jobs = (
        supabase.table("jobs")
        .select("id, title, description")
        .eq("is_open", True)
        .limit(5)
        .execute()
        .data
    )
    for job in jobs:
        print(f"\n=== {job['id']}: {job['title']} ===")
        for skill in extract_skills(job["title"], job["description"] or ""):
            name = normalize(skill, known)
            print(f"  {name}{'' if name.lower() in known else '  (new)'}")
