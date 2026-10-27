"""Extract and persist skill mentions once per posting, without paid API calls.

Run `python skills.py --limit 50` after migration 005. This keyword baseline is
separate from the planned LLM extractor; both can use the same atomic save RPC.
"""
import argparse
import hashlib
import json
import logging
import os
import re

LOGGER = logging.getLogger(__name__)
EXTRACTOR_VERSION = "keywords-v1"
PAGE_SIZE = 500


def paginated(client, table, columns, order):
    offset = 0
    while True:
        rows = client.table(table).select(columns).order(order).range(offset, offset + PAGE_SIZE - 1).execute().data
        yield from rows
        if len(rows) < PAGE_SIZE:
            return
        offset += PAGE_SIZE


def build_catalog(skills, aliases):
    catalog = {row["id"]: {row["name"].strip().casefold()} for row in skills}
    for row in aliases:
        if row["skill_id"] in catalog:
            catalog[row["skill_id"]].add(row["alias"].strip().casefold())
    return {key: sorted(values) for key, values in sorted(catalog.items())}


def catalog_version(catalog):
    fingerprint = hashlib.sha256(json.dumps(catalog, sort_keys=True).encode()).hexdigest()[:16]
    return f"{EXTRACTOR_VERSION}-{fingerprint}"


def input_hash(job):
    text = json.dumps([job["title"], job.get("description")], ensure_ascii=False)
    return hashlib.sha256(text.encode()).hexdigest()


def extract_skill_ids(job, catalog):
    text = f"{job['title']} {job.get('description') or ''}"
    return [skill_id for skill_id, aliases in catalog.items() if any(
        re.search(rf"(?<![\w+#]){re.escape(alias)}(?![\w+#])", text, re.IGNORECASE)
        for alias in aliases
    )]


def needs_extraction(job, version):
    marker = job.get("job_skill_extractions") or {}
    # Accommodate both PostgREST relation representations.
    if isinstance(marker, list):
        marker = marker[0] if marker else {}
    # A future LLM extractor can use the same save contract. Do not replace its
    # unchanged result with this less precise keyword baseline.
    saved_version = marker.get("extractor_version", "")
    if marker.get("input_hash") == input_hash(job) and saved_version and not saved_version.startswith("keywords-"):
        return False
    return marker.get("input_hash") != input_hash(job) or marker.get("extractor_version") != version


def run_extraction(client, limit=50):
    if not 1 <= limit <= 500:
        raise ValueError("Extraction limit must be between 1 and 500")
    skills = list(paginated(client, "skills", "id,name", "id"))
    aliases = list(paginated(client, "skill_aliases", "skill_id,alias", "alias"))
    catalog = build_catalog(skills, aliases)
    if not catalog:
        raise ValueError("No skill catalog is available; apply migration 005 first")
    version = catalog_version(catalog)
    attempted = saved = failed = offset = 0
    while attempted < limit:
        rows = (client.table("jobs")
                .select("id,title,description,job_skill_extractions(input_hash,extractor_version)")
                .eq("is_open", True).order("id").range(offset, offset + PAGE_SIZE - 1)
                .execute().data)
        for job in rows:
            if not needs_extraction(job, version):
                continue
            attempted += 1
            try:
                client.rpc("save_job_skill_extraction", {
                    "p_job_id": job["id"], "p_skill_ids": extract_skill_ids(job, catalog),
                    "p_input_hash": input_hash(job), "p_extractor_version": version,
                    "p_expected_title": job["title"], "p_expected_description": job.get("description"),
                }).execute()
                saved += 1
            except Exception:
                # The atomic RPC leaves no completion marker on failure.
                # Continue to other jobs; a later run retries the failed job.
                failed += 1
                LOGGER.exception("Skill extraction failed for job %s", job["id"])
            if attempted >= limit:
                break
        if len(rows) < PAGE_SIZE:
            break
        offset += PAGE_SIZE
    LOGGER.info("Skill mentions: %s saved, %s failed, %s attempted (limit %s)", saved, failed, attempted, limit)
    return {"saved": saved, "failed": failed, "attempted": attempted}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--limit", type=int, default=50, choices=range(1, 501), metavar="1..500")
    args = parser.parse_args()
    from dotenv import load_dotenv
    from supabase import create_client

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    load_dotenv()
    client = create_client(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SERVICE_ROLE_KEY"])
    result = run_extraction(client, args.limit)
    return 1 if result["failed"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
