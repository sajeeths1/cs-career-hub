import copy
import sys
import unittest
from datetime import datetime, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from notifier import (
    matches_target_roles,
    normalize_role_text,
    notify_new_jobs,
    notify_target_role_matches,
    parse_target_roles,
    run_digest,
)


class Query:
    def __init__(self, client, table):
        self.client, self.name = client, table
        self.filters, self.action, self.payload = [], "select", None
        self.on_conflict, self.ignore_duplicates = None, False

    def select(self, _cols):
        return self

    def eq(self, key, value):
        self.filters.append(("eq", key, value))
        return self

    def in_(self, key, values):
        self.filters.append(("in", key, set(values)))
        return self

    def is_(self, key, value):
        self.filters.append(("is", key, value))
        return self

    def upsert(self, rows, on_conflict=None, ignore_duplicates=False):
        self.action, self.payload = "upsert", rows
        self.on_conflict = on_conflict.split(",") if on_conflict else None
        self.ignore_duplicates = ignore_duplicates
        return self

    def update(self, values):
        self.action, self.payload = "update", values
        return self

    def _match(self, row):
        for kind, key, value in self.filters:
            if kind == "eq" and row.get(key) != value:
                return False
            if kind == "in" and row.get(key) not in value:
                return False
            if kind == "is":
                is_null = row.get(key) is None
                if (value == "null") != is_null:
                    return False
        return True

    def execute(self):
        table = self.client.rows.setdefault(self.name, [])
        if self.action == "update":
            changed = []
            for row in table:
                if self._match(row):
                    row.update(self.payload)
                    changed.append(copy.deepcopy(row))
            return SimpleNamespace(data=changed)
        if self.action == "upsert":
            result = []
            for incoming in self.payload:
                existing = next((row for row in table if self.on_conflict and all(
                    row.get(k) == incoming.get(k) for k in self.on_conflict)), None)
                if existing:
                    if not self.ignore_duplicates:
                        existing.update(incoming)
                        result.append(copy.deepcopy(existing))
                else:
                    new_row = {**incoming, "id": self.client.next_id(self.name)}
                    table.append(new_row)
                    result.append(copy.deepcopy(new_row))
            return SimpleNamespace(data=result)
        return SimpleNamespace(data=copy.deepcopy([row for row in table if self._match(row)]))


class FakeClient:
    def __init__(self, rows, emails=None):
        self.rows = rows
        self._next_id = {
            name: max([r["id"] for r in table_rows if isinstance(r.get("id"), int)], default=0) + 1
            for name, table_rows in rows.items()
        }
        self.emails = emails or {}
        self.auth = SimpleNamespace(admin=SimpleNamespace(get_user_by_id=self._get_user_by_id))

    def table(self, name):
        return Query(self, name)

    def next_id(self, name):
        value = self._next_id.get(name, 1)
        self._next_id[name] = value + 1
        return value

    def _get_user_by_id(self, user_id):
        if user_id not in self.emails:
            raise RuntimeError("no such user")
        return SimpleNamespace(user=SimpleNamespace(email=self.emails[user_id]))


NOW = datetime(2026, 1, 1, tzinfo=timezone.utc)
NEW_JOBS = [{"id": 101, "title": "Software Engineer Intern", "url": "https://example.com/101", "company_id": 1}]


def client_with(priority_ids=(), followed_ids=(), settings_overrides=None, emails=None):
    settings = []
    if settings_overrides is not None:
        for user_id, overrides in settings_overrides.items():
            settings.append({"user_id": user_id, "email_enabled": True, "instant_priority_alerts": True,
                              "digest_frequency": "weekly", "followed_digest_frequency": "weekly",
                              "target_role_digest_frequency": "off", **overrides})
    rows = {
        "priority_companies": [{"user_id": uid, "company_id": 1} for uid in priority_ids],
        "followed_companies": [{"user_id": uid, "company_id": 1} for uid in followed_ids],
        "notification_settings": settings,
        "notifications": [],
    }
    return FakeClient(rows, emails or {uid: f"{uid}@example.com" for uid in {*priority_ids, *followed_ids}})


class RoleMatchingTests(unittest.TestCase):
    def test_normalizes_synonyms_and_separators(self):
        self.assertEqual(normalize_role_text("Front-End Engineer"), "frontend engineer")
        self.assertEqual(normalize_role_text("SWE Intern"), "software engineer intern")
        self.assertEqual(normalize_role_text("C++ Developer"), "cplusplus engineer")

    def test_parse_deduplicates_normalized_variants(self):
        roles = parse_target_roles("Frontend Developer, front-end developer, Data")
        self.assertEqual(roles, ["Frontend Developer", "Data"])

    def test_matches_require_all_words_regardless_of_order(self):
        self.assertTrue(matches_target_roles("Backend Software Engineer Intern", ["intern backend"]))
        self.assertFalse(matches_target_roles("Backend Engineer", ["frontend"]))

    def test_avoids_substring_false_positives(self):
        self.assertFalse(matches_target_roles("JavaScript Engineer", ["java"]))


class NotifyNewJobsTests(unittest.TestCase):
    def test_no_followers_creates_nothing(self):
        client = client_with()
        result = notify_new_jobs(client, 1, "Acme", NEW_JOBS, NOW)
        self.assertEqual(result, {"notified": 0, "emailed": 0})

    def test_no_new_jobs_short_circuits(self):
        client = client_with(priority_ids=["u1"])
        self.assertEqual(notify_new_jobs(client, 1, "Acme", [], NOW), {"notified": 0, "emailed": 0})

    def test_priority_follower_gets_notification_and_instant_email(self):
        client = client_with(priority_ids=["u1"])  # default settings apply
        with patch("notifier.send_email", return_value=True) as sent:
            result = notify_new_jobs(client, 1, "Acme", NEW_JOBS, NOW)
        self.assertEqual(result, {"notified": 1, "emailed": 1})
        sent.assert_called_once()
        row = client.rows["notifications"][0]
        self.assertEqual(row["source"], "priority_company")
        self.assertEqual(row["emailed_at"], NOW.isoformat())

    def test_followed_only_gets_notification_without_instant_email(self):
        client = client_with(followed_ids=["u1"])
        with patch("notifier.send_email") as sent:
            result = notify_new_jobs(client, 1, "Acme", NEW_JOBS, NOW)
        sent.assert_not_called()
        self.assertEqual(result, {"notified": 1, "emailed": 0})
        row = client.rows["notifications"][0]
        self.assertEqual(row["source"], "followed_company")
        self.assertIsNone(row.get("emailed_at"))

    def test_priority_and_followed_user_gets_one_row_labeled_priority(self):
        client = client_with(priority_ids=["u1"], followed_ids=["u1"])
        with patch("notifier.send_email", return_value=True):
            notify_new_jobs(client, 1, "Acme", NEW_JOBS, NOW)
        self.assertEqual(len(client.rows["notifications"]), 1)
        self.assertEqual(client.rows["notifications"][0]["source"], "priority_company")

    def test_instant_alerts_disabled_creates_notification_without_email(self):
        client = client_with(priority_ids=["u1"], settings_overrides={"u1": {"instant_priority_alerts": False}})
        with patch("notifier.send_email") as sent:
            result = notify_new_jobs(client, 1, "Acme", NEW_JOBS, NOW)
        sent.assert_not_called()
        self.assertEqual(result, {"notified": 1, "emailed": 0})

    def test_email_disabled_never_emails(self):
        client = client_with(priority_ids=["u1"], settings_overrides={"u1": {"email_enabled": False}})
        with patch("notifier.send_email") as sent:
            notify_new_jobs(client, 1, "Acme", NEW_JOBS, NOW)
        sent.assert_not_called()

    def test_rerun_with_same_job_does_not_duplicate_or_reemail(self):
        client = client_with(priority_ids=["u1"])
        with patch("notifier.send_email", return_value=True) as sent:
            notify_new_jobs(client, 1, "Acme", NEW_JOBS, NOW)
            result = notify_new_jobs(client, 1, "Acme", NEW_JOBS, NOW)
        self.assertEqual(result, {"notified": 0, "emailed": 0})
        self.assertEqual(sent.call_count, 1)
        self.assertEqual(len(client.rows["notifications"]), 1)


class NotifyTargetRoleMatchesTests(unittest.TestCase):
    def test_no_jobs_short_circuits(self):
        client = FakeClient({"profiles": [{"id": "u1", "target_roles": "Backend"}], "notifications": []})
        self.assertEqual(notify_target_role_matches(client, [], NOW), {"notified": 0})

    def test_matches_saved_target_roles_across_companies(self):
        client = FakeClient({
            "profiles": [{"id": "u1", "target_roles": "Backend Engineer"}, {"id": "u2", "target_roles": ""}],
            "notifications": [],
        })
        jobs = [{"id": 1, "title": "Backend Software Engineer", "company_id": 5},
                {"id": 2, "title": "Product Designer", "company_id": 6}]
        result = notify_target_role_matches(client, jobs, NOW)
        self.assertEqual(result, {"notified": 1})
        row = client.rows["notifications"][0]
        self.assertEqual(row, {"user_id": "u1", "job_id": 1, "company_id": 5, "source": "target_role", "id": row["id"]})

    def test_never_sends_an_instant_email(self):
        client = FakeClient({"profiles": [{"id": "u1", "target_roles": "Backend"}], "notifications": []},
                             emails={"u1": "u1@example.com"})
        with patch("notifier.send_email") as sent:
            notify_target_role_matches(client, [{"id": 1, "title": "Backend Engineer", "company_id": 5}], NOW)
        sent.assert_not_called()

    def test_does_not_override_an_existing_priority_notification(self):
        client = client_with(priority_ids=["u1"])
        client.rows["profiles"] = [{"id": "u1", "target_roles": "Software Engineer Intern"}]
        with patch("notifier.send_email", return_value=True):
            notify_new_jobs(client, 1, "Acme", NEW_JOBS, NOW)
        notify_target_role_matches(client, NEW_JOBS, NOW)
        self.assertEqual(len(client.rows["notifications"]), 1)
        self.assertEqual(client.rows["notifications"][0]["source"], "priority_company")


class RunDigestTests(unittest.TestCase):
    def test_rejects_unknown_frequency(self):
        with self.assertRaises(ValueError):
            run_digest(FakeClient({}), "monthly", NOW)

    def test_batches_pending_notifications_by_category_into_one_email(self):
        client = FakeClient({
            "notification_settings": [{"user_id": "u1", "email_enabled": True, "digest_frequency": "weekly",
                                        "followed_digest_frequency": "weekly", "target_role_digest_frequency": "off"}],
            "notifications": [
                {"id": 1, "user_id": "u1", "source": "priority_company", "emailed_at": None,
                 "jobs": {"title": "SWE Intern", "url": "x"}, "companies": {"name": "Acme"}},
                {"id": 2, "user_id": "u1", "source": "followed_company", "emailed_at": None,
                 "jobs": {"title": "Data Intern", "url": "x"}, "companies": {"name": "Beta"}},
                {"id": 3, "user_id": "u1", "source": "target_role", "emailed_at": None,
                 "jobs": {"title": "ML Intern", "url": "x"}, "companies": {"name": "Gamma"}},
            ],
        }, emails={"u1": "student@example.com"})
        with patch("notifier.send_email", return_value=True) as sent:
            result = run_digest(client, "weekly", NOW)
        # target_role is "off" for this user, so only the two weekly-due rows are included.
        self.assertEqual(result, {"emailed_users": 1, "emailed_notifications": 2})
        html = sent.call_args[0][2]
        self.assertIn("SWE Intern", html)
        self.assertIn("Data Intern", html)
        self.assertNotIn("ML Intern", html)
        self.assertEqual(client.rows["notifications"][2]["emailed_at"], None)

    def test_already_emailed_notifications_are_not_resent(self):
        client = FakeClient({
            "notification_settings": [{"user_id": "u1", "email_enabled": True, "digest_frequency": "daily",
                                        "followed_digest_frequency": "off", "target_role_digest_frequency": "off"}],
            "notifications": [{"id": 1, "user_id": "u1", "source": "priority_company", "emailed_at": NOW.isoformat(),
                                "jobs": {"title": "SWE Intern", "url": "x"}, "companies": {"name": "Acme"}}],
        }, emails={"u1": "student@example.com"})
        with patch("notifier.send_email") as sent:
            result = run_digest(client, "daily", NOW)
        sent.assert_not_called()
        self.assertEqual(result, {"emailed_users": 0, "emailed_notifications": 0})

    def test_email_disabled_user_is_skipped_entirely(self):
        client = FakeClient({
            "notification_settings": [{"user_id": "u1", "email_enabled": False, "digest_frequency": "daily",
                                        "followed_digest_frequency": "daily", "target_role_digest_frequency": "daily"}],
            "notifications": [{"id": 1, "user_id": "u1", "source": "priority_company", "emailed_at": None,
                                "jobs": {"title": "SWE Intern", "url": "x"}, "companies": {"name": "Acme"}}],
        }, emails={"u1": "student@example.com"})
        with patch("notifier.send_email") as sent:
            result = run_digest(client, "daily", NOW)
        sent.assert_not_called()
        self.assertEqual(result, {"emailed_users": 0, "emailed_notifications": 0})


if __name__ == "__main__":
    unittest.main()
