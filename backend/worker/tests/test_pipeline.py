import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline import CLOSE_AFTER_DAYS, find_closing_soon_jobs


class Query:
    def __init__(self, rows):
        self.rows, self.filters = rows, []

    def select(self, _cols):
        return self

    def eq(self, key, value):
        self.filters.append(("eq", key, value))
        return self

    def gte(self, key, value):
        self.filters.append(("gte", key, value))
        return self

    def lt(self, key, value):
        self.filters.append(("lt", key, value))
        return self

    def execute(self):
        def matches(row):
            for kind, key, value in self.filters:
                if kind == "eq" and row.get(key) != value:
                    return False
                if kind == "gte" and row.get(key) < value:
                    return False
                if kind == "lt" and row.get(key) >= value:
                    return False
            return True
        return SimpleNamespace(data=[row for row in self.rows if matches(row)])


class FakeClient:
    def __init__(self, jobs):
        self.jobs = jobs

    def table(self, name):
        assert name == "jobs"
        return Query(self.jobs)


NOW = datetime(2026, 1, 10, tzinfo=timezone.utc)


def job(id, days_ago, is_open=True, company_id=1):
    return {"id": id, "title": f"Job {id}", "url": "x", "location": None, "posted_at": None,
            "company_id": company_id, "is_open": is_open,
            "last_seen_at": (NOW - timedelta(days=days_ago)).isoformat()}


class FindClosingSoonJobsTests(unittest.TestCase):
    def test_includes_jobs_in_the_back_half_of_the_close_countdown(self):
        # CLOSE_AFTER_DAYS defaults to 2: the warning window is [2 days ago, 1 day ago).
        jobs = [job(1, days_ago=CLOSE_AFTER_DAYS - 0.5)]
        client = FakeClient(jobs)
        self.assertEqual([row["id"] for row in find_closing_soon_jobs(client, 1, NOW)], [1])

    def test_excludes_jobs_seen_too_recently(self):
        jobs = [job(1, days_ago=CLOSE_AFTER_DAYS - 1.5)]  # under 1 day stale: not yet in the window
        client = FakeClient(jobs)
        self.assertEqual(find_closing_soon_jobs(client, 1, NOW), [])

    def test_excludes_jobs_already_past_the_close_cutoff(self):
        jobs = [job(1, days_ago=CLOSE_AFTER_DAYS + 0.5)]  # close_old_jobs would already close this
        client = FakeClient(jobs)
        self.assertEqual(find_closing_soon_jobs(client, 1, NOW), [])

    def test_excludes_already_closed_and_other_companies(self):
        jobs = [
            job(1, days_ago=CLOSE_AFTER_DAYS - 0.5, is_open=False),
            job(2, days_ago=CLOSE_AFTER_DAYS - 0.5, company_id=2),
        ]
        client = FakeClient(jobs)
        self.assertEqual(find_closing_soon_jobs(client, 1, NOW), [])


if __name__ == "__main__":
    unittest.main()
