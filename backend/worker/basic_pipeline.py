"""OLD Basic pipeline test: ONE company, Greenhouse -> Supabase `jobs` table.

Run:  python basic_pipeline.py
Run it a second time: it should say 0 new jobs, which proves repeats are skipped.

Needs: the .env file (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) and both SQL files run.
"""
import hashlib
import os
from datetime import datetime, timedelta, timezone

import requests
from dotenv import load_dotenv
from supabase import create_client

# ---- Settings: change these to test a different Greenhouse company ----
COMPANY_NAME = "Stripe"
GREENHOUSE_SLUG = "stripe"
CS_KEYWORDS = ["software", "engineer", "developer", "data", "machine learning", "intern"]
CLOSE_AFTER_DAYS = 2  # jobs not seen for this long get marked closed

load_dotenv()
supabase = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


def get_or_create_company() -> int:
    """Find the company's ID in the companies table (adds the company if it's missing)."""
    result = (
        supabase.table("companies")
        .upsert(
            {"name": COMPANY_NAME, "ats_type": "greenhouse", "ats_slug": GREENHOUSE_SLUG},
            on_conflict="name",
        )
        .execute()
    )
    return result.data[0]["id"]


def collect() -> list[dict]:
    """Step 1 - Collect: download the company's job list from Greenhouse."""
    url = f"https://boards-api.greenhouse.io/v1/boards/{GREENHOUSE_SLUG}/jobs"
    response = requests.get(url, timeout=20)
    response.raise_for_status()  # stops with a clear error if the slug is wrong
    return response.json().get("jobs", [])


def make_fingerprint(company_id: int, title: str, location: str) -> str:
    """Same company + title + location always gives the same fingerprint."""
    text = f"{company_id}|{title.strip().lower()}|{location.strip().lower()}"
    return hashlib.sha256(text.encode()).hexdigest()


def clean_up(raw_jobs: list[dict], company_id: int, now: datetime) -> list[dict]:
    """Step 2 - Clean up: reshape each job to match our table and drop non-CS jobs."""
    rows = {}
    for job in raw_jobs:
        title = job.get("title", "")
        if not any(word in title.lower() for word in CS_KEYWORDS):
            continue
        location = (job.get("location") or {}).get("name") or "Unknown"
        fingerprint = make_fingerprint(company_id, title, location)
        # Keyed by fingerprint, so identical postings in one download are only kept once
        rows[fingerprint] = {
            "company_id": company_id,
            "title": title,  # if your table calls this job_title, change it here
            "location": location,
            "url": job["absolute_url"],
            "posted_at": (job.get("updated_at") or now.isoformat())[:10],  # just the date
            "source": "greenhouse",
            "dedupe_hash": fingerprint,
            "is_open": True,
            "last_seen_at": now.isoformat(),
        }
    return list(rows.values())


def save(rows: list[dict], company_id: int) -> int:
    """Steps 3-4 - Check for repeats and save. Returns how many jobs were new."""
    existing = (
        supabase.table("jobs").select("dedupe_hash").eq("company_id", company_id).execute()
    )
    already_saved = {row["dedupe_hash"] for row in existing.data}
    new_count = sum(1 for row in rows if row["dedupe_hash"] not in already_saved)

    if rows:
        # "upsert" = add new jobs, and just update last_seen_at on ones we already have
        supabase.table("jobs").upsert(rows, on_conflict="dedupe_hash").execute()
    return new_count


def close_old_jobs(company_id: int, now: datetime) -> int:
    """Step 5 - Close old jobs: mark jobs we haven't seen recently as closed."""
    cutoff = (now - timedelta(days=CLOSE_AFTER_DAYS)).isoformat()
    result = (
        supabase.table("jobs")
        .update({"is_open": False})
        .eq("company_id", company_id)
        .eq("is_open", True)
        .lt("last_seen_at", cutoff)
        .execute()
    )
    return len(result.data)


def main():
    now = datetime.now(timezone.utc)
    company_id = get_or_create_company()
    raw_jobs = collect()
    rows = clean_up(raw_jobs, company_id, now)
    new_count = save(rows, company_id)
    closed_count = close_old_jobs(company_id, now)

    print(f"{COMPANY_NAME} (company id {company_id})")
    print(f"  Downloaded:   {len(raw_jobs)} jobs")
    print(f"  CS-related:   {len(rows)} jobs")
    print(f"  New:          {new_count} jobs saved")
    print(f"  Already had:  {len(rows) - new_count} jobs (just updated last_seen_at)")
    print(f"  Closed:       {closed_count} old jobs")


if __name__ == "__main__":
    main()
