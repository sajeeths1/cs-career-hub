"""Create in-app notifications and send email alerts for job postings.

Two independent axes describe every notification:
  source (WHY the user sees it, migration 007): priority_company, followed_company, or target_role.
  kind   (WHAT happened, migration 008):        new_posting or closing_soon.

notify_new_jobs / notify_target_role_matches both take a `kind` argument and
write it onto every row they create; `source` still drives who is eligible
for an instant email versus a digest, same as before.

`notify_new_jobs` runs from pipeline.py once per company, right after it
saves that company's new jobs (kind="new_posting") and again once it finds
jobs that are about to be auto-closed (kind="closing_soon").
`notify_target_role_matches` runs once per pipeline run, across every
company's new or closing-soon jobs. `python notifier.py --frequency
daily|weekly` sends digest emails, batching each user's pending (not yet
emailed) notifications due at that frequency into one email.

Needs RESEND_API_KEY (and optionally RESEND_FROM_EMAIL) in .env to actually
send email; without it, notifications are still created but emails are
skipped with a logged warning. SITE_URL should point at the deployed
CS Career Hub site so email links open a job's page there (falling back to
the job's own external posting URL if unset, so links are never broken).
"""
import argparse
import logging
import os
import re
import unicodedata
from datetime import datetime, timezone

import requests

LOGGER = logging.getLogger(__name__)
DEFAULT_FROM_EMAIL = "CS Career Hub <onboarding@resend.dev>"

SOURCE_LABELS = {
    "priority_company": "Priority companies",
    "followed_company": "Companies you follow",
    "target_role": "Roles matching your target roles",
}
CATEGORY_FREQUENCY_FIELD = {
    "priority_company": "digest_frequency",
    "followed_company": "followed_digest_frequency",
    "target_role": "target_role_digest_frequency",
}


# ---------------------------------------------------------------------------
# Target-role title matching, ported from frontend/lib/job-personalization.ts
# so new postings can be matched without a round trip to the website.
# ---------------------------------------------------------------------------

_ROLE_FILLER_WORDS = {"role", "roles", "position", "positions"}
_ROLE_REPLACEMENTS = [
    (r"\bc\+\+", "cplusplus"),
    (r"\bc#", "csharp"),
    (r"\bfront[\s-]*end\b", "frontend"),
    (r"\bback[\s-]*end\b", "backend"),
    (r"\bfull[\s-]*stack\b", "fullstack"),
    (r"\b(machine[\s-]*learning|ml)\b", "machinelearning"),
    (r"\b(artificial[\s-]*intelligence|ai)\b", "artificialintelligence"),
    (r"\b(swe|sde)\b", "software engineer"),
    (r"\b(engineers|engineering|developers?|development)\b", "engineer"),
    (r"\b(scientists|science)\b", "scientist"),
    (r"\banalysts\b", "analyst"),
    (r"\b(interns|internships?)\b", "intern"),
]


def normalize_role_text(value: str) -> str:
    text = unicodedata.normalize("NFKD", value)
    text = "".join(ch for ch in text if not unicodedata.combining(ch)).lower()
    for pattern, replacement in _ROLE_REPLACEMENTS:
        text = re.sub(pattern, replacement, text)
    return re.sub(r"[^a-z0-9]+", " ", text).strip()


def role_tokens(value: str) -> list[str]:
    seen = []
    for word in normalize_role_text(value).split(" "):
        if word and word not in _ROLE_FILLER_WORDS and word not in seen:
            seen.append(word)
    return seen


def parse_target_roles(value: str | None) -> list[str]:
    seen_keys = set()
    roles = []
    for raw in re.split(r"[,;\n]+", value or ""):
        role = raw.strip()
        key = " ".join(sorted(role_tokens(role)))
        if not key or key in seen_keys:
            continue
        seen_keys.add(key)
        roles.append(role)
    return roles


def matches_target_roles(title: str, roles: list[str]) -> bool:
    words = set(normalize_role_text(title).split(" "))
    return any(required and all(word in words for word in required)
               for required in (role_tokens(role) for role in roles))


# ---------------------------------------------------------------------------
# Email content. Pure string-building, no I/O, so these are easy to test.
# ---------------------------------------------------------------------------

def job_url(job: dict) -> str:
    """A Career Hub deep link to this job's page; falls back to the job's own
    posting URL if SITE_URL isn't configured, so links are never broken."""
    site_url = os.environ.get("SITE_URL")
    return f"{site_url.rstrip('/')}/?job={job['id']}" if site_url else job["url"]


def _manage_preferences_link() -> str:
    site_url = os.environ.get("SITE_URL")
    href = f"{site_url.rstrip('/')}/?tab=settings" if site_url else None
    return f'<a href="{href}">Manage your notification preferences</a>' if href else "Manage your notification preferences in CS Career Hub Settings"


def _footer(company_name: str | None = None) -> str:
    manage = _manage_preferences_link()
    message = f"You are receiving this message because you have notifications enabled for {company_name}. No longer interested? {manage}."
    return f'<p style="font-size:14px;color:#666;margin-top:32px;">{message}</p>'


def _digest_footer() -> str:
    manage = _manage_preferences_link()
    message = f"You are receiving this message because you have subscribed to receiving notifications from CS Career Hub. No longer interested? {manage}."
    return f'<p style="font-size:14px;color:#666;margin-top:32px;">{message}</p>'


_BUTTON_STYLE = (
    "display:inline-block;background-color:#25364b;color:#ffffff;"
    "padding:9px 18px;border-radius:6px;text-decoration:none;"
    "font-size:14px;font-weight:600;margin-top:10px;"
)
_LOGO_STYLE = "height:{size}px;width:{size}px;border-radius:6px;vertical-align:middle;margin-right:{gap}px;object-fit:contain;"


def _cta_button(job: dict) -> str:
    return f'<a href="{job_url(job)}" style="{_BUTTON_STYLE}">View &amp; Apply →</a>'


def _logo_img(company_name: str, logo_url: str | None, size: int = 40) -> str:
    if not logo_url:
        return ""
    style = _LOGO_STYLE.format(size=size, gap=10 if size >= 32 else 8)
    return f'<img src="{logo_url}" alt="{company_name} logo" style="{style}">'


def _company_header(company_name: str, logo_url: str | None) -> str:
    return (f'<div style="margin-bottom:12px;">{_logo_img(company_name, logo_url)}'
            f'<span style="font-size:24px;font-weight:700;vertical-align:middle;">{company_name}</span></div>')


def _single_job_block(job: dict, label: str | None = None) -> str:
    """Used inside an instant alert email: the company is already named in
    the header above, so only the job itself (and its posted date) shows here."""
    location = job.get("location") or "Location not listed"
    posted = job.get("posted_at") or "recently"
    label_html = f'<div style="font-size:15px;color:#b45309;font-weight:700;">{label}</div>' if label else ""
    return (
        '<div style="margin:24px 0;">'
        f"{label_html}"
        f'<div style="font-size:20px;font-weight:700;">{job["title"]}</div>'
        f'<div style="font-size:17px;color:#555;">{location}</div>'
        f'<div style="font-size:15px;color:#888;">Posted {posted}</div>'
        f"{_cta_button(job)}"
        "</div>"
    )


def _digest_row(job: dict, company_name: str, logo_url: str | None, label: str | None = None) -> str:
    """Used inside a digest email: jobs span many companies, so each row names
    its own company (with logo) and skips the posted date for a tighter list."""
    location = job.get("location") or "Location not listed"
    label_html = f'<div style="font-size:15px;color:#b45309;font-weight:700;">{label}</div>' if label else ""
    return (
        '<div style="margin:40px 0;padding-bottom:40px;border-bottom:1px solid #e5e5e5;">'
        f"{label_html}"
        f'<div style="font-size:19px;font-weight:600;color:#333;">{_logo_img(company_name, logo_url, size=36)}'
        f'<span style="vertical-align:middle;">{company_name}</span></div>'
        f'<div style="font-size:20px;font-weight:700;">{job["title"]}</div>'
        f'<div style="font-size:17px;color:#555;">{location}</div>'
        f"{_cta_button(job)}"
        "</div>"
    )


def _wrap(inner: str) -> str:
    """A full HTML document, not a bare <div> fragment: some clients (Gmail
    included) collapse part of a message behind a "..." when an email isn't a
    well-formed document, mistaking the tail for quoted/boilerplate content."""
    return (
        "<!DOCTYPE html><html><head><meta charset=\"utf-8\">"
        '<meta name="viewport" content="width=device-width, initial-scale=1.0"></head>'
        '<body style="margin:0;padding:0;">'
        f'<div style="text-align:center;font-family:Arial,Helvetica,sans-serif;font-size:17px;color:#111;padding:24px;">{inner}</div>'
        "</body></html>"
    )


def new_job_email(company_name: str, jobs: list[dict], logo_url: str | None = None) -> tuple[str, str]:
    single = len(jobs) == 1
    subject = (f"\U0001F680 New Job For You: {jobs[0]['title']} at {company_name}" if single
               else f"\U0001F680 {len(jobs)} New Jobs For You at {company_name}")
    intro = ("just posted a job opportunity that matches your interests!" if single
             else f"just posted {len(jobs)} job opportunities that match your interests!")
    items = "".join(_single_job_block(job) for job in jobs)
    body = _wrap(f"{_company_header(company_name, logo_url)}"
                 f'<p style="font-size:17px;">{company_name} {intro}</p>'
                 f"{items}{_footer(company_name)}")
    return subject, body


def closing_soon_email(company_name: str, jobs: list[dict], logo_url: str | None = None) -> tuple[str, str]:
    single = len(jobs) == 1
    subject = (f"\U0001F6A8 Application Closing Soon For: {jobs[0]['title']} at {company_name}" if single
               else f"\U0001F6A8 {len(jobs)} Applications Closing Soon at {company_name}")
    intro = (f"{company_name} will soon be closing applications for this position." if single
             else f"{company_name} will soon be closing applications for these positions.")
    items = "".join(_single_job_block(job, label="Closing soon") for job in jobs)
    body = _wrap(f"{_company_header(company_name, logo_url)}"
                 f'<p style="font-size:17px;">{intro}</p>'
                 f"{items}{_footer(company_name)}")
    return subject, body


def digest_email(frequency: str, rows: list[dict]) -> tuple[str, str]:
    usable = [row for row in rows if row.get("jobs") and row.get("companies")]
    subject = f"\U0001F4A1 {frequency.capitalize()} Digest: New Jobs Just For You!"
    count = len(usable)
    noun, verb = ("Job", "Matches") if count == 1 else ("Jobs", "Match")
    header = f"{count} {noun} That {verb} Your Preferences"
    items = "".join(
        _digest_row(row["jobs"], row["companies"]["name"], row["companies"].get("logo_url"),
                    label="Closing soon" if row.get("kind") == "closing_soon" else None)
        for row in usable
    )
    body = _wrap(f'<h2 style="font-size:24px;">{header}</h2>{items}{_digest_footer()}')
    return subject, body


# ---------------------------------------------------------------------------
# Pure helpers (no database needed, so they're easy to test)
# ---------------------------------------------------------------------------

def default_settings(user_id: str) -> dict:
    """A user who has never opened Settings gets the column defaults from migrations 003/007."""
    return {
        "user_id": user_id, "email_enabled": True, "instant_priority_alerts": True,
        "digest_frequency": "weekly", "followed_digest_frequency": "weekly",
        "target_role_digest_frequency": "off",
    }


# ---------------------------------------------------------------------------
# Database + email steps
# ---------------------------------------------------------------------------

def send_email(to_email: str, subject: str, html: str) -> bool:
    api_key = os.environ.get("RESEND_API_KEY")
    if not api_key:
        LOGGER.warning("RESEND_API_KEY is not set; skipping email to %s", to_email)
        return False
    response = requests.post(
        "https://api.resend.com/emails",
        headers={"Authorization": f"Bearer {api_key}"},
        json={
            "from": os.environ.get("RESEND_FROM_EMAIL", DEFAULT_FROM_EMAIL),
            "to": [to_email],
            "subject": subject,
            "html": html,
        },
        timeout=15,
    )
    if response.status_code >= 400:
        LOGGER.error("Resend API error %s sending to %s: %s", response.status_code, to_email, response.text)
        return False
    return True


def settings_by_user(client, user_ids: list[str]) -> dict:
    if not user_ids:
        return {}
    rows = (
        client.table("notification_settings")
        .select("user_id, email_enabled, instant_priority_alerts, digest_frequency, followed_digest_frequency, target_role_digest_frequency")
        .in_("user_id", user_ids).execute().data
    )
    settings = {row["user_id"]: row for row in rows}
    for user_id in user_ids:
        settings.setdefault(user_id, default_settings(user_id))
    return settings


def user_email(client, user_id: str) -> str | None:
    try:
        return client.auth.admin.get_user_by_id(user_id).user.email
    except Exception:
        LOGGER.exception("Could not look up email for user %s", user_id)
        return None


def _insert_notifications(client, rows: list[dict]) -> list[dict]:
    if not rows:
        return []
    return client.table("notifications").upsert(rows, on_conflict="user_id,job_id,kind", ignore_duplicates=True).execute().data or []


def notify_new_jobs(client, company_id: int, company_name: str, jobs: list[dict], now: datetime,
                     kind: str = "new_posting", company_logo_url: str | None = None) -> dict:
    """jobs: rows as saved to the `jobs` table (must include id, title, url, location, posted_at).

    Priority followers (capped at 10, migration 003) are eligible for an instant
    email. Followed-only followers (unlimited, migration 007) only ever get a
    notification row; email is left to the digest. A user in both lists is
    inserted once, as priority_company: priority rows are written first so a
    later conflicting followed_company insert is a no-op.
    """
    if not jobs:
        return {"notified": 0, "emailed": 0}
    priority_user_ids = [row["user_id"] for row in client.table("priority_companies").select("user_id").eq("company_id", company_id).execute().data]
    followed_user_ids = [row["user_id"] for row in client.table("followed_companies").select("user_id").eq("company_id", company_id).execute().data]
    if not priority_user_ids and not followed_user_ids:
        return {"notified": 0, "emailed": 0}

    priority_set = set(priority_user_ids)
    inserted = _insert_notifications(client, [
        {"user_id": uid, "job_id": job["id"], "company_id": company_id, "source": "priority_company", "kind": kind}
        for uid in priority_user_ids for job in jobs
    ])
    inserted += _insert_notifications(client, [
        {"user_id": uid, "job_id": job["id"], "company_id": company_id, "source": "followed_company", "kind": kind}
        for uid in followed_user_ids if uid not in priority_set for job in jobs
    ])

    settings = settings_by_user(client, priority_user_ids)
    email_builder = closing_soon_email if kind == "closing_soon" else new_job_email
    emailed_ids = []
    for user_id in priority_user_ids:
        prefs = settings[user_id]
        own_rows = [row for row in inserted if row["user_id"] == user_id and row["source"] == "priority_company"]
        if not (prefs["email_enabled"] and prefs["instant_priority_alerts"]) or not own_rows:
            continue
        email = user_email(client, user_id)
        if not email:
            continue
        own_job_ids = {row["job_id"] for row in own_rows}
        jobs_for_user = [job for job in jobs if job["id"] in own_job_ids]
        subject, html = email_builder(company_name, jobs_for_user, company_logo_url)
        if send_email(email, subject, html):
            emailed_ids += [row["id"] for row in own_rows]

    if emailed_ids:
        client.table("notifications").update({"emailed_at": now.isoformat()}).in_("id", emailed_ids).execute()
    return {"notified": len(inserted), "emailed": len(emailed_ids)}


def notify_target_role_matches(client, jobs: list[dict], now: datetime, kind: str = "new_posting") -> dict:
    """jobs: rows across every company collected this run (must include id, title, company_id).

    Digest-only by design (default off): never sends an instant email, regardless
    of settings, so turning this on can't surprise anyone with a flood of email.
    """
    if not jobs:
        return {"notified": 0}
    profiles = client.table("profiles").select("id, target_roles").execute().data
    candidates = [(row["id"], parse_target_roles(row.get("target_roles"))) for row in profiles]
    candidates = [(user_id, roles) for user_id, roles in candidates if roles]
    if not candidates:
        return {"notified": 0}

    rows = [
        {"user_id": user_id, "job_id": job["id"], "company_id": job["company_id"], "source": "target_role", "kind": kind}
        for user_id, roles in candidates for job in jobs if matches_target_roles(job["title"], roles)
    ]
    inserted = _insert_notifications(client, rows)
    return {"notified": len(inserted)}


def run_digest(client, frequency: str, now: datetime) -> dict:
    """Driven by who actually has pending notifications, not by who has a saved
    notification_settings row: a user who never opened Settings still has the
    column defaults in effect (digest_frequency defaults to weekly) and must
    not be silently skipped just because no row exists for them yet."""
    if frequency not in ("daily", "weekly"):
        raise ValueError("frequency must be 'daily' or 'weekly'")
    pending = (
        client.table("notifications")
        .select("id, user_id, source, kind, jobs(id, title, url, location, posted_at), companies(name, logo_url)")
        .is_("emailed_at", "null").execute().data
    )
    user_ids = sorted({row["user_id"] for row in pending})
    settings = settings_by_user(client, user_ids)

    emailed_users = emailed_notifications = 0
    for user_id in user_ids:
        prefs = settings[user_id]
        if not prefs["email_enabled"]:
            continue
        due_sources = [source for source, field in CATEGORY_FREQUENCY_FIELD.items() if prefs.get(field) == frequency]
        if not due_sources:
            continue
        due_rows = [row for row in pending if row["user_id"] == user_id and row["source"] in due_sources]
        if not due_rows:
            continue
        email = user_email(client, user_id)
        if not email:
            continue
        subject, html = digest_email(frequency, due_rows)
        if send_email(email, subject, html):
            ids = [item["id"] for item in due_rows]
            client.table("notifications").update({"emailed_at": now.isoformat()}).in_("id", ids).execute()
            emailed_users += 1
            emailed_notifications += len(ids)
    return {"emailed_users": emailed_users, "emailed_notifications": emailed_notifications}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--frequency", choices=["daily", "weekly"], required=True)
    args = parser.parse_args()
    from dotenv import load_dotenv
    from supabase import create_client

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    load_dotenv()
    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    result = run_digest(client, args.frequency, datetime.now(timezone.utc))
    LOGGER.info("Digest (%s): %s", args.frequency, result)


if __name__ == "__main__":
    main()
