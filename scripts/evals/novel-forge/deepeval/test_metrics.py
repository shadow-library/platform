import os

os.environ["DEEPEVAL_TELEMETRY_OPT_OUT"] = "YES"
os.environ["CONFIDENT_TRACING_ENABLED"] = "NO"
os.environ.setdefault("DEEPEVAL_DISABLE_DOTENV", "1")

import json
import unittest
from pathlib import Path
from typing import Any

from metrics import SecretLeakMetric, StatConsistencyMetric, panel_values, pattern_hits, stat_value, term_hit

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "genres"
CAST = [
    {"entityKey": "juno", "name": "Juno Vasquez"},
    {"entityKey": "kit", "name": "Kit Orrin"},
    {"entityKey": "cassia", "name": "Cassia Moor"},
    {"entityKey": "vale", "name": "Councillor Ambrose Vale"},
]
SYSTEM = {
    "character": "Juno Vasquez",
    "startingStats": [{"attribute": "Strength", "value": 9}],
    "startingSkills": [{"attribute": "Diagnose", "value": 1}],
    "trackedStats": ["Strength", "Diagnose"],
}


def panel(title: str, rows: list[tuple[str, str]]) -> str:
    return "\n".join([f"```system {title}", "| Attribute | Value |", "| --- | --- |", *[f"| {name} | {value} |" for name, value in rows], "```"])


def game_case(chapter: int, *panels: str) -> dict[str, Any]:
    return {"id": f"c{chapter}", "chapter": chapter, "archetype": "game-system", "system": SYSTEM, "cast": CAST, "prose": "\n\nProse.\n\n".join(panels), "hiddenSecrets": []}


def fixtures() -> list[dict[str, Any]]:
    return [json.loads(path.read_text(encoding="utf-8")) for path in sorted(FIXTURES.glob("*.json"))]


class StatValueTest(unittest.TestCase):
    def test_should_read_a_plain_integer_or_a_ratio(self) -> None:
        self.assertEqual(stat_value("12"), 12)
        self.assertEqual(stat_value("**14**"), 14)
        self.assertEqual(stat_value("40 / 100"), 40)

    def test_should_not_read_a_delta_or_a_transition(self) -> None:
        self.assertIsNone(stat_value("+3"))
        self.assertIsNone(stat_value("1 → 2"))
        self.assertIsNone(stat_value("12 (+1)"))


class PanelAttributionTest(unittest.TestCase):
    def test_should_ignore_panels_titled_for_another_cast_member(self) -> None:
        case = game_case(2, panel("Tally — Kit", [("Strength", "4")]), panel("Status: Cassia", [("Strength", "3")]), panel("Tally — Juno Vasquez", [("Strength", "10")]))
        self.assertEqual(panel_values(case), [{"strength": 10}])

    def test_should_read_untitled_and_protagonist_panels(self) -> None:
        case = game_case(2, panel("Task complete", [("Strength", "10")]), panel("Status — Juno", [("Diagnose", "2")]))
        self.assertEqual(panel_values(case), [{"strength": 10}, {"diagnose": 2}])

    def test_should_not_flag_a_companion_panel_with_lower_stats(self) -> None:
        previous = game_case(1, panel("Tally — Juno Vasquez", [("Strength", "10")]))
        current = game_case(2, panel("Tally — Kit", [("Strength", "5")]), panel("Tally — Juno Vasquez", [("Strength", "11")]))
        self.assertEqual(StatConsistencyMetric(current, previous).evaluate()[0], 1.0)

    def test_should_flag_a_fall_and_an_unexplained_jump(self) -> None:
        previous = game_case(1, panel("Tally — Juno Vasquez", [("Strength", "10"), ("Diagnose", "2")]))
        current = game_case(2, panel("Tally — Juno Vasquez", [("Strength", "8"), ("Diagnose", "9")]))
        score, reason = StatConsistencyMetric(current, previous).evaluate()
        self.assertEqual(score, 0.0)
        self.assertIn("strength fell", reason)
        self.assertIn("diagnose jumped", reason)


class SecretPatternTest(unittest.TestCase):
    def test_should_match_every_secret_statement_with_its_own_patterns(self) -> None:
        for fixture in fixtures():
            for secret in fixture["secrets"]:
                with self.subTest(fixture=fixture["id"], secret=secret["factKey"]):
                    self.assertTrue(pattern_hits(secret["text"], secret["revealPatterns"]))

    def test_should_not_match_any_brief_while_the_secret_is_locked(self) -> None:
        for fixture in fixtures():
            unlock = {milestone["milestoneKey"]: milestone["chapter"] for milestone in fixture["milestones"]}
            for chapter in fixture["chapters"]:
                for secret in fixture["secrets"]:
                    if unlock[secret["unlockMilestone"]] > chapter["n"]:
                        with self.subTest(fixture=fixture["id"], chapter=chapter["n"], secret=secret["factKey"]):
                            self.assertEqual(pattern_hits(chapter["plan"], secret["revealPatterns"]), [])

    def test_should_normalise_curly_apostrophes_like_the_generator(self) -> None:
        self.assertTrue(pattern_hits("It was brewed from Dora’s stolen memories.", ["dora'?s stolen memor"]))

    def test_should_score_zero_on_a_pattern_hit_and_report_terms_as_advisory(self) -> None:
        secret = next(secret for fixture in fixtures() for secret in fixture["secrets"] if secret["factKey"] == "tally_is_maintenance")
        leaked = {"prose": "The panel read: usefulness score below threshold.", "hiddenSecrets": [secret]}
        clean = {"prose": "Juno wiped the gauge and read it twice.", "hiddenSecrets": [secret]}
        score, reason = SecretLeakMetric(leaked).evaluate()
        self.assertEqual(score, 0.0)
        self.assertIn("usefulness score", reason)
        self.assertEqual(SecretLeakMetric(clean).evaluate()[0], 1.0)

    def test_should_match_terms_as_whole_words_with_plurals(self) -> None:
        self.assertTrue(term_hit("Two usefulness scores were shown.", "usefulness score"))
        self.assertFalse(term_hit("Its usefulness scoreboard.", "usefulness score"))


if __name__ == "__main__":
    unittest.main()
