import os

os.environ["DEEPEVAL_TELEMETRY_OPT_OUT"] = "YES"
os.environ["CONFIDENT_TRACING_ENABLED"] = "NO"
os.environ.setdefault("DEEPEVAL_DISABLE_DOTENV", "1")

import asyncio
import unittest
from unittest import mock

from deepeval.metrics.g_eval.schema import ReasonScore

from judge import ClaudeJudge, JudgeConfig, JudgeOutputError, JudgeSetupError, Redactor, display_url, extract_json, judge_config_from_env, parse_reply

SECRET = "sk-or-v1-0123456789abcdef0123456789abcdef"


class ScriptedJudge(ClaudeJudge):
    def __init__(self, replies: list[str]):
        super().__init__(JudgeConfig(base_url="http://127.0.0.1:7431/v1", model="anthropic/claude-opus-5.5", api_key="local"))
        self.replies = list(replies)
        self.prompts: list[str] = []

    async def _complete(self, prompt: str, attempts: int = 1) -> str:
        self.prompts.append(prompt)
        return self.replies.pop(0)


class ExtractJsonTest(unittest.TestCase):
    def test_should_skip_a_brace_preamble_and_return_the_object_with_required_keys(self) -> None:
        self.assertEqual(extract_json('Sure {x} here: {"score": 8, "reason": "ok"}', ["score", "reason"]), {"score": 8, "reason": "ok"})

    def test_should_prefer_the_last_matching_object(self) -> None:
        text = 'Draft {"score": 2, "reason": "draft"} then final {"score": 7, "reason": "final"}'
        self.assertEqual(extract_json(text, ["score", "reason"])["reason"], "final")

    def test_should_read_a_fenced_reply_with_braces_in_strings_and_a_trailing_comma(self) -> None:
        self.assertEqual(extract_json('Here:\n```json\n{"reason": "a {brace} \\"q\\"", "score": 7,}\n```', ["score"]), {"reason": 'a {brace} "q"', "score": 7})

    def test_should_refuse_a_reply_without_the_required_keys(self) -> None:
        with self.assertRaises(ValueError):
            extract_json('{"verdict": "fine"}', ["score", "reason"])

    def test_should_validate_against_the_schema(self) -> None:
        self.assertEqual(parse_reply('ok {"score": 6, "reason": "fine"}', ReasonScore).score, 6)


class ClaudeJudgeTest(unittest.TestCase):
    def test_should_retry_once_with_the_validation_error(self) -> None:
        judge = ScriptedJudge(["not json", '{"reason": "fine", "score": 6}'])
        self.assertEqual(asyncio.run(judge.a_generate("Judge this.", schema=ReasonScore)).score, 6)
        self.assertIn("could not be used", judge.prompts[1])
        self.assertIn('"score"', judge.prompts[0])

    def test_should_raise_after_a_second_invalid_reply(self) -> None:
        with self.assertRaises(JudgeOutputError):
            asyncio.run(ScriptedJudge(["nope", '{"score": "high"}']).a_generate("x", schema=ReasonScore))


class RedactionTest(unittest.TestCase):
    def test_should_mask_the_key_and_its_echoed_fragments(self) -> None:
        redact = Redactor(SECRET)
        message = redact(f"401 invalid key {SECRET} (starts {SECRET[:12]}…, ends …{SECRET[-8:]})")
        self.assertNotIn(SECRET, message)
        self.assertNotIn(SECRET[:12], message)
        self.assertNotIn(SECRET[-8:], message)

    def test_should_leave_text_alone_for_the_loopback_placeholder(self) -> None:
        self.assertEqual(Redactor("local")("http://localhost:7431"), "http://localhost:7431")

    def test_should_show_only_scheme_host_and_port(self) -> None:
        self.assertEqual(display_url("https://user:pw@openrouter.ai/api/v1?token=x"), "https://openrouter.ai")
        self.assertEqual(display_url("http://127.0.0.1:7431/v1"), "http://127.0.0.1:7431")


class ConfigTest(unittest.TestCase):
    def test_should_not_require_a_key_for_a_loopback_gateway(self) -> None:
        with mock.patch.dict(os.environ, {"NF_DEEPEVAL_JUDGE_BASE_URL": "http://127.0.0.1:7431/v1"}, clear=True):
            self.assertEqual(judge_config_from_env().api_key, "local")

    def test_should_require_a_key_for_a_remote_endpoint(self) -> None:
        with mock.patch.dict(os.environ, {}, clear=True), self.assertRaises(JudgeSetupError):
            judge_config_from_env()

    def test_should_refuse_a_model_that_is_not_claude(self) -> None:
        with (
            mock.patch.dict(os.environ, {"NF_DEEPEVAL_JUDGE_BASE_URL": "http://localhost:7431/v1", "NF_DEEPEVAL_JUDGE_MODEL": "openai/gpt-x"}, clear=True),
            self.assertRaises(JudgeSetupError),
        ):
            judge_config_from_env()

    def test_should_keep_the_key_out_of_the_config_repr(self) -> None:
        self.assertNotIn(SECRET, repr(JudgeConfig(base_url="https://openrouter.ai/api/v1", model="anthropic/claude-opus-5.5", api_key=SECRET)))


if __name__ == "__main__":
    unittest.main()
