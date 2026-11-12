import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pipeline import clean_up, collect_ashby, collect_lever, collect_greenhouse


NOW = datetime(2026, 1, 10, tzinfo=timezone.utc)


class CollectorTests(unittest.TestCase):
    @patch("pipeline.requests.get")
    def test_lever_jobs_are_normalized(self, get):
        get.return_value = SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: [{
                "text": "Software Engineer",
                "categories": {"location": "San Francisco, CA"},
                "hostedUrl": "https://jobs.example/lever/123",
                "createdAt": 1768003200000,
                "descriptionPlain": "Build software",
            }],
        )

        jobs = collect_lever("example")

        get.assert_called_once_with("https://api.lever.co/v0/postings/example?mode=json", timeout=30)
        self.assertEqual(jobs[0]["title"], "Software Engineer")
        self.assertEqual(jobs[0]["location"]["name"], "San Francisco, CA")
        self.assertEqual(jobs[0]["absolute_url"], "https://jobs.example/lever/123")
        self.assertEqual(jobs[0]["content"], "Build software")

    @patch("pipeline.requests.get")
    def test_ashby_jobs_are_normalized(self, get):
        get.return_value = SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: {"jobs": [{
                "title": "Software Engineer",
                "location": "San Francisco, CA",
                "isRemote": False,
                "jobUrl": "https://jobs.example/ashby/123",
                "publishedAt": "2026-01-01T00:00:00Z",
                "descriptionPlain": "Build software",
            }]},
        )

        jobs = collect_ashby("example")

        get.assert_called_once_with("https://api.ashbyhq.com/posting-api/job-board/example", timeout=30)
        self.assertEqual(jobs[0]["title"], "Software Engineer")
        self.assertEqual(jobs[0]["location"]["name"], "San Francisco, CA")
        self.assertEqual(jobs[0]["absolute_url"], "https://jobs.example/ashby/123")
        self.assertEqual(jobs[0]["first_published"], "2026-01-01T00:00:00Z")

    @patch("pipeline.requests.get")
    def test_greenhouse_collector_remains_supported(self, get):
        expected = [{"title": "Software Engineer"}]
        get.return_value = SimpleNamespace(
            raise_for_status=lambda: None,
            json=lambda: {"jobs": expected},
        )
        self.assertEqual(collect_greenhouse("example"), expected)

    def test_same_company_title_and_location_dedupe_across_sources(self):
        posting = {
            "title": "Software Engineer",
            "location": {"name": "San Francisco, CA"},
            "absolute_url": "https://jobs.example/123",
        }

        greenhouse = clean_up([posting], 7, NOW, source="greenhouse")[0]
        lever = clean_up([posting], 7, NOW, source="lever")[0]

        self.assertEqual(greenhouse["dedupe_hash"], lever["dedupe_hash"])
        self.assertEqual(lever["source"], "lever")


if __name__ == "__main__":
    unittest.main()
