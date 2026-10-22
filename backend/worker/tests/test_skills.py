import copy
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from skills import build_catalog, catalog_version, extract_skill_ids, input_hash, needs_extraction, run_extraction


class Query:
    def __init__(self, client, table):
        self.client, self.name, self.start, self.end, self.filter = client, table, 0, 9999, None
    def select(self, _): return self
    def order(self, _): return self
    def range(self, start, end):
        self.start, self.end = start, end
        return self
    def eq(self, key, value):
        self.filter = (key, value)
        return self
    def execute(self):
        rows = self.client.rows[self.name]
        if self.filter:
            key, value = self.filter
            rows = [row for row in rows if row.get(key) == value]
        return SimpleNamespace(data=copy.deepcopy(rows[self.start:self.end + 1]))


class FakeClient:
    def __init__(self, jobs, fail_ids=()):
        self.rows = {"skills": [{"id": 1, "name": "Python"}, {"id": 2, "name": "React"}],
                     "skill_aliases": [{"skill_id": 2, "alias": "react.js"}], "jobs": jobs}
        self.fail_ids, self.writes = fail_ids, []
    def table(self, name): return Query(self, name)
    def rpc(self, name, params):
        assert name == "save_job_skill_extraction"
        def execute():
            if params["p_job_id"] in self.fail_ids:
                raise RuntimeError("Simulated transaction failure")
            self.writes.append(params)
            job = next(job for job in self.rows["jobs"] if job["id"] == params["p_job_id"])
            job["job_skill_extractions"] = {"input_hash": params["p_input_hash"], "extractor_version": params["p_extractor_version"]}
            return SimpleNamespace(data=None)
        return SimpleNamespace(execute=execute)


def job(id, text):
    return {"id": id, "title": "Engineer", "description": text, "is_open": True}


class SkillExtractionTests(unittest.TestCase):
    def test_aliases_boundaries_and_punctuation(self):
        catalog = {1: ["java"], 2: ["javascript", "js"], 3: ["c++"], 4: ["react", "react.js"], 5: ["sql"]}
        self.assertEqual(extract_skill_ids(job(1, "JavaScript REACT.JS C++ PostgreSQL"), catalog), [2, 3, 4])
        self.assertEqual(extract_skill_ids(job(1, "reactive javausers nosql"), catalog), [])
        self.assertEqual(extract_skill_ids(job(1, "SQL/Java"), catalog), [1, 5])
    def test_catalog_alias_normalization_and_version(self):
        a = build_catalog([{"id": 1, "name": "JavaScript"}], [{"skill_id": 1, "alias": " JS "}])
        self.assertEqual(a, {1: ["javascript", "js"]})
        self.assertEqual(catalog_version(a), catalog_version(copy.deepcopy(a)))
        self.assertNotEqual(catalog_version(a), catalog_version({1: ["javascript"]}))
    def test_hash_tracks_text_and_supports_empty_descriptions(self):
        self.assertEqual(extract_skill_ids(job(1, None), {1: ["python"]}), [])
        self.assertNotEqual(input_hash(job(1, None)), input_hash(job(1, "Python")))
        row = job(1, "Python")
        row["job_skill_extractions"] = [{"input_hash": input_hash(row), "extractor_version": "keywords-v1"}]
        self.assertFalse(needs_extraction(row, "keywords-v1"))
        self.assertTrue(needs_extraction(row, "keywords-v2"))
    def test_does_not_downgrade_a_future_llm_result(self):
        row = job(1, "Python")
        row["job_skill_extractions"] = {"input_hash": input_hash(row), "extractor_version": "llm-v1"}
        self.assertFalse(needs_extraction(row, "keywords-v1"))
        row["description"] = "React"
        self.assertTrue(needs_extraction(row, "keywords-v1"))
    def test_once_per_posting_including_zero_matches_and_changed_postings(self):
        client = FakeClient([job(1, "Python"), job(2, None)])
        self.assertEqual(run_extraction(client)["saved"], 2)
        self.assertEqual(client.writes[1]["p_skill_ids"], [])
        self.assertEqual(run_extraction(client)["attempted"], 0)
        client.rows["jobs"][0]["description"] = "React"
        self.assertEqual(run_extraction(client)["saved"], 1)
        self.assertEqual(client.writes[-1]["p_skill_ids"], [2])
    def test_pagination_limit_and_resume(self):
        client = FakeClient([job(n, "Python") for n in range(1, 6)])
        with patch("skills.PAGE_SIZE", 2):
            self.assertEqual(run_extraction(client, 3)["saved"], 3)
            self.assertEqual(run_extraction(client, 3)["saved"], 2)
        self.assertEqual(len(client.writes), 5)
    def test_failure_does_not_mark_complete_or_stop_other_jobs(self):
        client = FakeClient([job(1, "Python"), job(2, "React"), job(3, "Python")], fail_ids=[1])
        with self.assertLogs("skills", level="ERROR"):
            result = run_extraction(client, 2)
        self.assertEqual(result, {"saved": 1, "failed": 1, "attempted": 2})
        self.assertTrue(needs_extraction(client.rows["jobs"][0], "any-version"))
        self.assertEqual([row["p_job_id"] for row in client.writes], [2])
    def test_closed_jobs_are_ignored_and_limits_are_validated(self):
        client = FakeClient([{**job(1, "Python"), "is_open": False}])
        self.assertEqual(run_extraction(client)["attempted"], 0)
        for limit in [0, -1, 501]:
            with self.assertRaises(ValueError): run_extraction(client, limit)


if __name__ == "__main__":
    unittest.main()
