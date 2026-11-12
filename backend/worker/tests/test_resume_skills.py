import copy
import json
import sys
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from resume_skills import MAX_SKILLS, POLL_SECONDS, RETRY_SECONDS, filter_skill_names, needs_scan, run_scan, watch

OLD = "2026-01-01T00:00:00+00:00"
NEW = "2026-02-01T00:00:00.5+00:00"


class Query:
    def __init__(self, client, table):
        self.client, self.name, self.start, self.end, self.id = client, table, 0, 9999, None
        self.columns = ""
    def select(self, columns):
        self.columns = columns
        return self
    def order(self, _): return self
    def eq(self, key, value):
        assert key == "id"
        self.id = value
        return self
    def range(self, start, end):
        self.start, self.end = start, end
        return self
    def execute(self):
        rows = [r for r in self.client.rows if self.id in (None, r["id"])][self.start:self.end + 1]
        # Like PostgREST, return only the requested columns.
        return SimpleNamespace(data=[{c: copy.deepcopy(r[c]) for c in self.columns.split(",")} for r in rows])


class FakeClient:
    def __init__(self, rows, fail_ids=()):
        self.rows, self.fail_ids, self.writes = rows, fail_ids, []
    def table(self, name):
        assert name == "resumes"
        return Query(self, name)
    def rpc(self, name, params):
        assert name == "save_resume_skills"
        def execute():
            if params["p_resume_id"] in self.fail_ids:
                raise RuntimeError("Simulated transaction failure")
            self.writes.append(params)
            next(r for r in self.rows if r["id"] == params["p_resume_id"])["processed_at"] = NEW
            return SimpleNamespace(data=None)
        return SimpleNamespace(execute=execute)


def resume(id, text="Python and React", processed_at=None, extracted_at=OLD):
    return {"id": id, "extracted_text": text, "text_extracted_at": extracted_at, "processed_at": processed_at}


def model_returns(*names):
    return SimpleNamespace(message=SimpleNamespace(content=json.dumps({"skills": list(names)})))


class NeedsScanTests(unittest.TestCase):
    def test_new_rows_are_scanned_once(self):
        self.assertTrue(needs_scan(resume(1)))
        self.assertFalse(needs_scan(resume(1, processed_at=NEW)))
    def test_changed_text_is_scanned_again(self):
        self.assertTrue(needs_scan(resume(1, processed_at=OLD, extracted_at=NEW)))
    def test_row_without_extracted_text_timestamp_is_skipped(self):
        self.assertFalse(needs_scan(resume(1, extracted_at=None)))
    def test_processed_row_without_a_text_timestamp_is_not_rescanned(self):
        self.assertFalse(needs_scan(resume(1, processed_at=OLD, extracted_at=None)))


class FilterTests(unittest.TestCase):
    def test_name_must_appear_in_the_resume(self):
        self.assertEqual(filter_skill_names(["Python", "Rust"], "I write python"), ["Python"])
    def test_matching_respects_word_boundaries_and_punctuation(self):
        text = "C++ and Node.js, reactive systems"
        self.assertEqual(filter_skill_names(["C++", "Node.js", "React", "C"], text), ["C++", "Node.js"])
    def test_multi_word_names_match_across_line_breaks(self):
        self.assertEqual(filter_skill_names(["Machine  Learning"], "Machine\nLearning"), ["Machine Learning"])
    def test_length_and_word_limits(self):
        long_name = "x" * 41
        words = "one two three four five"
        self.assertEqual(filter_skill_names(["R", long_name, words], f"R {long_name} {words}"), [])
    def test_contact_details_are_rejected(self):
        names = ["ada@example.com", "https://ada.dev", "www.ada.dev", "ada.com", "555-123-4567"]
        self.assertEqual(filter_skill_names(names, " ".join(names)), [])
    def test_technical_names_with_dots_slashes_and_digits_are_kept(self):
        names = ["ASP.NET", "CI/CD", "Python 3", "HTML5"]
        self.assertEqual(filter_skill_names(names, " ".join(names)), names)
    def test_case_insensitive_duplicates_keep_the_first_spelling(self):
        self.assertEqual(filter_skill_names(["Python", "PYTHON"], "python"), ["Python"])
    def test_result_is_capped(self):
        names = [f"Skill{n}" for n in range(MAX_SKILLS + 5)]
        self.assertEqual(len(filter_skill_names(names, " ".join(names))), MAX_SKILLS)


class WatchTests(unittest.TestCase):
    def test_picks_up_new_resumes_and_keeps_polling(self):
        client = FakeClient([resume("a")])
        delays = []
        def sleep(seconds):
            delays.append(seconds)
            if len(delays) == 1:
                client.rows.append(resume("b"))
            if len(delays) == 3:
                raise KeyboardInterrupt
        with patch("resume_skills.ollama.chat", return_value=model_returns("Python")):
            with self.assertRaises(KeyboardInterrupt):
                watch(client, sleep=sleep)
        self.assertEqual([w["p_resume_id"] for w in client.writes], ["a", "b"])
        self.assertEqual(delays, [POLL_SECONDS] * 3)
    def test_failures_back_off_and_do_not_stop_the_watcher(self):
        client = FakeClient([resume("a")])
        delays = []
        def sleep(seconds):
            delays.append(seconds)
            if len(delays) == 3:
                raise KeyboardInterrupt
        chat = [ConnectionError(), model_returns("Python")]
        with patch("resume_skills.ollama.chat", side_effect=chat):
            with patch("resume_skills.paginated", side_effect=[RuntimeError("Database offline"), client.rows, client.rows]):
                with self.assertLogs("resume_skills", level="ERROR"), self.assertRaises(KeyboardInterrupt):
                    watch(client, sleep=sleep)
        self.assertEqual(delays, [RETRY_SECONDS, RETRY_SECONDS, POLL_SECONDS])
        self.assertEqual(len(client.writes), 1)


class RunScanTests(unittest.TestCase):
    def test_blank_or_missing_text_is_skipped(self):
        client = FakeClient([resume("a", text="  \n "), resume("b", text=None)])
        with patch("resume_skills.ollama.chat") as chat:
            self.assertEqual(run_scan(client)["attempted"], 0)
        chat.assert_not_called()
    def test_saves_filtered_names_and_scans_each_resume_once(self):
        client = FakeClient([resume("a")])
        with patch("resume_skills.ollama.chat", return_value=model_returns("Python", "Invented")) as chat:
            self.assertEqual(run_scan(client), {"saved": 1, "failed": 0, "attempted": 1})
            self.assertEqual(run_scan(client)["attempted"], 0)
        self.assertEqual(chat.call_count, 1)
        self.assertEqual(client.writes, [{"p_resume_id": "a", "p_skill_names": ["Python"], "p_expected_text_extracted_at": OLD}])
    def test_valid_empty_result_counts_as_processed(self):
        client = FakeClient([resume("a")])
        with patch("resume_skills.ollama.chat", return_value=model_returns()):
            self.assertEqual(run_scan(client)["saved"], 1)
        self.assertEqual(client.writes[0]["p_skill_names"], [])
    def test_ollama_failure_is_retried_and_does_not_stop_other_rows(self):
        client = FakeClient([resume("a"), resume("b")])
        with patch("resume_skills.ollama.chat", side_effect=[ConnectionError(), model_returns("Python"), model_returns("React")]):
            with self.assertLogs("resume_skills", level="ERROR"):
                self.assertEqual(run_scan(client), {"saved": 1, "failed": 1, "attempted": 2})
            self.assertTrue(needs_scan(client.rows[0]))
            self.assertEqual(run_scan(client), {"saved": 1, "failed": 0, "attempted": 1})
    def test_save_failure_is_retried(self):
        client = FakeClient([resume("a")], fail_ids=["a"])
        with patch("resume_skills.ollama.chat", return_value=model_returns("Python")):
            with self.assertLogs("resume_skills", level="ERROR"):
                self.assertEqual(run_scan(client)["failed"], 1)
        self.assertTrue(needs_scan(client.rows[0]))
    def test_invalid_model_output_never_logs_resume_content(self):
        secret = "SECRET-RESUME-CONTENT"
        client = FakeClient([resume("a", text=secret)])
        bad = SimpleNamespace(message=SimpleNamespace(content=f'{{"skills": "{secret}"}}'))
        with patch("resume_skills.ollama.chat", return_value=bad):
            with self.assertLogs("resume_skills", level="ERROR") as logs:
                self.assertEqual(run_scan(client)["failed"], 1)
        self.assertNotIn(secret, "".join(logs.output))
        self.assertEqual(client.writes, [])
    def test_dry_run_writes_nothing(self):
        client = FakeClient([resume("a")])
        with patch("resume_skills.ollama.chat", return_value=model_returns("Python")), patch("builtins.print") as output:
            self.assertEqual(run_scan(client, dry_run=True), {"saved": 0, "failed": 0, "attempted": 1})
        self.assertEqual(client.writes, [])
        self.assertIsNone(client.rows[0]["processed_at"])
        output.assert_called_once_with("a: ['Python']")
    def test_limit_is_applied_and_validated(self):
        client = FakeClient([resume("a"), resume("b")])
        with patch("resume_skills.ollama.chat", return_value=model_returns("Python")):
            self.assertEqual(run_scan(client, 1)["attempted"], 1)
        for limit in [0, -1, 501]:
            with self.assertRaises(ValueError): run_scan(client, limit)
    def test_long_resumes_are_truncated_before_the_model_call(self):
        client = FakeClient([resume("a", text="Python " * 10_000)])
        with patch("resume_skills.ollama.chat", return_value=model_returns("Python")) as chat:
            run_scan(client)
        self.assertLessEqual(len(chat.call_args.kwargs["messages"][1]["content"]), 20_000)


if __name__ == "__main__":
    unittest.main()
