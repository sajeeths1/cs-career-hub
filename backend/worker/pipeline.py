"""MVP pipeline: collect CS jobs from MANY companies on Greenhouse -> Supabase.

Run (from backend/worker, with the virtual environment turned on):
    python pipeline.py

What it does, for every Greenhouse company in the `companies` table:
  1. Collect   - download the company's job list (with descriptions)
  2. Clean up  - keep U.S., early-career-friendly CS roles; reshape to our columns
  3. Save      - add new jobs, refresh ones we already have (no duplicates)
  4. Close     - mark jobs we haven't seen for CLOSE_AFTER_DAYS as closed

Needs: .env with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, and migrations 000-002 run.
"""
import hashlib
import html
import os
import re
from datetime import datetime, timedelta, timezone

import requests
from dotenv import load_dotenv
from supabase import create_client

# ---------------------------------------------------------------------------
# Settings
# ---------------------------------------------------------------------------

# Companies to add to the `companies` table if they aren't there yet.
# Format: "Display name": "greenhouse slug" (from job-boards.greenhouse.io/<slug>).
# A company that has moved off Greenhouse is skipped with a warning, so it's
# safe to leave a few that don't work. Add more any time.
STARTER_COMPANIES = {
    "Stripe": "stripe",
    "Airbnb": "airbnb",
    "Discord": "discord",
    "Figma": "figma",
    "Databricks": "databricks",
    "Robinhood": "robinhood",
    "Coinbase": "coinbase",
    "Cloudflare": "cloudflare",
    "Datadog": "datadog",
    "Reddit": "reddit",
    "Dropbox": "dropbox",
    "Pinterest": "pinterest",
    "Lyft": "lyft",
    "Instacart": "instacart",
    "Twilio": "twilio",
}

CLOSE_AFTER_DAYS = 2  # jobs not seen for this long get marked closed
BATCH_SIZE = 200      # how many rows to send to Supabase at once

# A title must contain one of these (whole words) to count as a CS job
CS_WORDS = [
    "software", "engineer", "engineering", "developer", "data", "machine learning",
    "ml", "ai", "security", "infrastructure", "backend", "back end", "frontend",
    "front end", "full stack", "fullstack", "platform", "mobile", "ios", "android",
    "devops", "sre", "site reliability", "intern", "internship", "new grad",
]

# ...and must NOT contain any of these (too senior, or not really a CS role)
EXCLUDE_WORDS = [
    "senior", "sr", "staff", "principal", "lead", "manager", "director", "head",
    "vp", "vice president", "architect", "distinguished", "iii", "iv",
    "sales", "solutions", "account", "recruiter", "recruiting", "counsel",
    "marketing", "designer", "technician",
]

US_STATE_CODES = {
    "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL",
    "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT",
    "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI",
    "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY", "DC",
}
US_HINTS = [
    "united states", "usa", "u.s.", "new york", "nyc", "san francisco", "seattle",
    "chicago", "austin", "boston", "los angeles", "denver", "atlanta", "raleigh",
    "durham", "washington", "miami", "dallas", "portland", "philadelphia",
    "pittsburgh", "salt lake", "san jose", "mountain view", "palo alto", "sunnyvale",
    "bay area", "remote - us", "remote, us", "remote (us",
]
NON_US_HINTS = [
    "canada", "toronto", "vancouver", "london", "united kingdom", "uk", "dublin",
    "ireland", "india", "bengaluru", "bangalore", "hyderabad", "singapore", "tokyo",
    "japan", "germany", "berlin", "munich", "paris", "france", "australia",
    "sydney", "melbourne", "mexico", "brazil", "são paulo", "sao paulo",
    "amsterdam", "netherlands", "spain", "madrid", "barcelona", "poland",
    "warsaw", "emea", "apac", "latam", "europe",
]

load_dotenv()


def get_client():
    return create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])


# ---------------------------------------------------------------------------
# Helpers (no database or internet needed, so they're easy to test)
# ---------------------------------------------------------------------------

def has_word(text: str, words: list[str]) -> bool:
    """True if any of the words/phrases appears as a whole word in text."""
    text = text.lower()
    return any(re.search(rf"\b{re.escape(word)}\b", text) for word in words)


def is_cs_role(title: str) -> bool:
    return has_word(title, CS_WORDS) and not has_word(title, EXCLUDE_WORDS)


def is_us_location(location: str) -> bool:
    lower = location.lower()
    if has_word(lower, US_HINTS):
        return True
    state_codes = re.findall(r"(?:,|\s-)\s*([A-Z]{2})\b", location)
    if any(code in US_STATE_CODES for code in state_codes):
        return True
    if has_word(lower, NON_US_HINTS):
        return False
    # Plain "Remote" (no country mentioned): keep it
    return "remote" in lower


def guess_work_mode(title: str, location: str) -> str:
    text = f"{title} {location}".lower()
    if "hybrid" in text:
        return "hybrid"
    if "remote" in text:
        return "remote"
    if location and location != "Unknown":
        return "in_person"
    return "unknown"


def html_to_text(content: str) -> str:
    """Greenhouse sends descriptions as escaped HTML. Turn them into plain text."""
    if not content:
        return ""
    text = html.unescape(content)  # "&lt;p&gt;" -> "<p>"
    text = re.sub(r"(?i)<br\s*/?>|</p>|</div>|</h\d>", "\n", text)
    text = re.sub(r"(?i)<li[^>]*>", "\n• ", text)
    text = re.sub(r"<[^>]+>", "", text)  # remove remaining tags
    text = html.unescape(text)           # "&amp;" -> "&"
    text = re.sub(r"[ \t\xa0]+", " ", text)
    text = re.sub(r"\n\s*\n+", "\n\n", text)
    return text.strip()[:20000]


def make_fingerprint(company_id: int, title: str, location: str) -> str:
    """Same company + title + location always gives the same fingerprint."""
    text = f"{company_id}|{title.strip().lower()}|{location.strip().lower()}"
    return hashlib.sha256(text.encode()).hexdigest()


def clean_up(raw_jobs: list[dict], company_id: int, now: datetime) -> list[dict]:
    """Reshape Greenhouse jobs to match our `jobs` table and drop ones we don't want."""
    rows = {}
    for job in raw_jobs:
        title = (job.get("title") or "").strip()
        location = ((job.get("location") or {}).get("name") or "Unknown").strip()
        if not title or not is_cs_role(title) or not is_us_location(location):
            continue
        fingerprint = make_fingerprint(company_id, title, location)
        if fingerprint in rows:  # same job listed twice in one download: keep the first
            continue
        posted = job.get("first_published") or job.get("updated_at") or now.isoformat()
        rows[fingerprint] = {
            "company_id": company_id,
            "title": title,
            "location": location,
            "url": job["absolute_url"],
            "posted_at": posted[:10],
            "description": html_to_text(job.get("content", "")),
            "work_mode": guess_work_mode(title, location),
            "source": "greenhouse",
            "dedupe_hash": fingerprint,
            "is_open": True,
            "last_seen_at": now.isoformat(),
        }
    return list(rows.values())


# ---------------------------------------------------------------------------
# Database + internet steps
# ---------------------------------------------------------------------------

def seed_companies(supabase) -> None:
    rows = [
        {"name": name, "ats_type": "greenhouse", "ats_slug": slug}
        for name, slug in STARTER_COMPANIES.items()
    ]
    supabase.table("companies").upsert(rows, on_conflict="name").execute()


def collect(slug: str) -> list[dict]:
    url = f"https://boards-api.greenhouse.io/v1/boards/{slug}/jobs?content=true"
    response = requests.get(url, timeout=30)
    response.raise_for_status()
    return response.json().get("jobs", [])


def save(supabase, rows: list[dict], company_id: int) -> int:
    existing = (
        supabase.table("jobs").select("dedupe_hash").eq("company_id", company_id).execute()
    )
    already_saved = {row["dedupe_hash"] for row in existing.data}
    new_count = sum(1 for row in rows if row["dedupe_hash"] not in already_saved)
    for start in range(0, len(rows), BATCH_SIZE):
        batch = rows[start:start + BATCH_SIZE]
        supabase.table("jobs").upsert(batch, on_conflict="dedupe_hash").execute()
    return new_count


def close_old_jobs(supabase, company_id: int, now: datetime) -> int:
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
    supabase = get_client()
    now = datetime.now(timezone.utc)
    seed_companies(supabase)

    companies = (
        supabase.table("companies")
        .select("id, name, ats_slug")
        .eq("ats_type", "greenhouse")
        .order("name")
        .execute()
        .data
    )

    totals = {"kept": 0, "new": 0, "closed": 0, "failed": 0}
    for company in companies:
        name, slug = company["name"], company["ats_slug"]
        try:
            raw_jobs = collect(slug)
        except requests.RequestException as error:
            print(f"  ! {name}: skipped, couldn't download ({error})")
            totals["failed"] += 1
            continue

        rows = clean_up(raw_jobs, company["id"], now)
        new_count = save(supabase, rows, company["id"])
        closed_count = close_old_jobs(supabase, company["id"], now)
        totals["kept"] += len(rows)
        totals["new"] += new_count
        totals["closed"] += closed_count
        print(f"  {name}: {len(raw_jobs)} downloaded, {len(rows)} kept, "
              f"{new_count} new, {closed_count} closed")

    print(f"\nDone. {totals['kept']} jobs kept, {totals['new']} new, "
          f"{totals['closed']} closed, {totals['failed']} companies skipped.")


if __name__ == "__main__":
    main()
