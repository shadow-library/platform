import asyncio
import hashlib
import ipaddress
import json
import logging
import os
import random
import re
from collections.abc import Iterable, Iterator
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

from deepeval.models import DeepEvalBaseLLM
from openai import APIConnectionError, APIStatusError, APITimeoutError, AsyncOpenAI, OpenAIError
from pydantic import BaseModel, ValidationError

DEFAULT_BASE_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "anthropic/claude-opus-5.5"
LOOPBACK_API_KEY = "local"
CALL_TIMEOUT_S = 300.0
MAX_ATTEMPTS = 4
MAX_BACKOFF_S = 60.0
PREFLIGHT_ATTEMPTS = 2
PREFLIGHT_PROMPT = "Reply with the single word OK."
MIN_REDACTED_LENGTH = 6
RETRYABLE_STATUS = frozenset({408, 409, 425, 429, 500, 502, 503, 504, 529})
FENCE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL | re.IGNORECASE)

logger = logging.getLogger("novel-forge-deepeval.judge")


class JudgeSetupError(Exception):
    pass


class JudgeCallError(Exception):
    pass


class JudgeOutputError(Exception):
    pass


@dataclass(frozen=True)
class JudgeConfig:
    base_url: str
    model: str
    api_key: str = field(repr=False)


def is_loopback(url: str) -> bool:
    host = urlparse(url).hostname or ""
    if host == "localhost":
        return True
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def judge_config_from_env() -> JudgeConfig:
    base_url = (os.environ.get("NF_DEEPEVAL_JUDGE_BASE_URL") or DEFAULT_BASE_URL).strip().rstrip("/")
    if urlparse(base_url).scheme not in ("http", "https"):
        raise JudgeSetupError(f"NF_DEEPEVAL_JUDGE_BASE_URL must be an http(s) URL, got {base_url!r}")
    model = (os.environ.get("NF_DEEPEVAL_JUDGE_MODEL") or DEFAULT_MODEL).strip()
    if not model.startswith("anthropic/"):
        raise JudgeSetupError(f"The judge is Claude only: NF_DEEPEVAL_JUDGE_MODEL must be an anthropic/* model, got {model!r}")
    api_key = (os.environ.get("NF_DEEPEVAL_JUDGE_API_KEY") or "").strip()
    if not api_key and not is_loopback(base_url):
        raise JudgeSetupError(f"NF_DEEPEVAL_JUDGE_API_KEY is required for {base_url} (it may be omitted only for a loopback gateway, or use --judge fake)")
    return JudgeConfig(base_url=base_url, model=model, api_key=api_key or LOOPBACK_API_KEY)


def _balanced_objects(text: str) -> Iterator[str]:
    start = text.find("{")
    while start != -1:
        depth = 0
        in_string = False
        escaped = False
        end = -1
        for index in range(start, len(text)):
            char = text[index]
            if in_string:
                if escaped:
                    escaped = False
                elif char == "\\":
                    escaped = True
                elif char == '"':
                    in_string = False
            elif char == '"':
                in_string = True
            elif char == "{":
                depth += 1
            elif char == "}":
                depth -= 1
                if depth == 0:
                    end = index
                    break
        if end == -1:
            start = text.find("{", start + 1)
            continue
        yield text[start : end + 1]
        start = text.find("{", end + 1)


def _loads(body: str) -> Any:
    for attempt in (body, re.sub(r",\s*([\]}])", r"\1", body)):
        try:
            return json.loads(attempt)
        except json.JSONDecodeError:
            continue
    return None


def extract_json(text: str, required: Iterable[str] = ()) -> dict[str, Any]:
    keys = set(required)
    candidates = [match.group(1) for match in FENCE.finditer(text)] + [text]
    for candidate in candidates:
        found = [value for value in map(_loads, _balanced_objects(candidate)) if isinstance(value, dict) and keys <= value.keys()]
        if found:
            return found[-1]
    raise ValueError(f"the reply holds no parseable JSON object{' with ' + ', '.join(sorted(keys)) if keys else ''}")


def required_fields(schema: type[BaseModel]) -> list[str]:
    return [name for name, info in schema.model_fields.items() if info.is_required()]


def parse_reply(text: str, schema: type[BaseModel]) -> BaseModel:
    return schema.model_validate(extract_json(text, required_fields(schema)))


def schema_prompt(prompt: str, schema: type[BaseModel]) -> str:
    return (
        f"{prompt}\n\n---\nAnswer with exactly one JSON object that validates against this JSON Schema. "
        f"No code fence, no text before or after it.\n{json.dumps(schema.model_json_schema())}"
    )


def display_url(url: str) -> str:
    parsed = urlparse(url)
    port = f":{parsed.port}" if parsed.port else ""
    return f"{parsed.scheme}://{parsed.hostname or ''}{port}"


class Redactor:
    def __init__(self, secret: str):
        self._fragments = (
            sorted({part for part in (secret, secret[:12], secret[-8:]) if len(part) >= MIN_REDACTED_LENGTH}, key=len, reverse=True) if secret != LOOPBACK_API_KEY else []
        )

    def __call__(self, text: str) -> str:
        for fragment in self._fragments:
            text = text.replace(fragment, "***")
        return text

    def short(self, error: BaseException) -> str:
        return self(" ".join(str(error).split()))[:400]


class ClaudeJudge(DeepEvalBaseLLM):
    def __init__(self, config: JudgeConfig):
        self.config = config
        self.redact = Redactor(config.api_key)
        super().__init__(config.model)

    def load_model(self) -> AsyncOpenAI:
        return AsyncOpenAI(base_url=self.config.base_url, api_key=self.config.api_key, timeout=CALL_TIMEOUT_S, max_retries=0)

    def get_model_name(self) -> str:
        return self.config.model

    def generate(self, prompt: str, schema: type[BaseModel] | None = None) -> Any:
        return asyncio.run(self.a_generate(prompt, schema=schema))

    async def a_generate(self, prompt: str, schema: type[BaseModel] | None = None) -> Any:
        if schema is None:
            return await self._complete(prompt)
        framed = schema_prompt(prompt, schema)
        reply = await self._complete(framed)
        try:
            return parse_reply(reply, schema)
        except (ValueError, ValidationError) as error:
            logger.warning("judge reply did not validate, asking once more", extra={"model": self.config.model, "error": self.redact.short(error)})
            retry = f"{framed}\n\nYour previous reply could not be used ({self.redact.short(error)}). Reply again with only the JSON object."
            try:
                return parse_reply(await self._complete(retry), schema)
            except (ValueError, ValidationError) as second:
                raise JudgeOutputError(f"judge reply still invalid after one retry: {self.redact.short(second)}") from second

    async def preflight(self) -> None:
        await self._complete(PREFLIGHT_PROMPT, attempts=PREFLIGHT_ATTEMPTS)

    async def _complete(self, prompt: str, attempts: int = MAX_ATTEMPTS) -> str:
        last_error = "no attempt made"
        for attempt in range(1, attempts + 1):
            delay: float | None = None
            try:
                response = await self.model.chat.completions.create(model=self.config.model, messages=[{"role": "user", "content": prompt}])
                content = response.choices[0].message.content if response.choices else None
                if content and content.strip():
                    return content
                last_error = "empty reply"
            except APIStatusError as error:
                if error.status_code not in RETRYABLE_STATUS:
                    raise JudgeCallError(f"judge answered {error.status_code}: {self.redact.short(error)}") from None
                last_error = f"status {error.status_code}"
                retry_after = error.response.headers.get("retry-after") if error.response is not None else None
                delay = float(retry_after) if retry_after and retry_after.replace(".", "", 1).isdigit() else None
            except (APITimeoutError, APIConnectionError) as error:
                last_error = type(error).__name__
            except OpenAIError as error:
                raise JudgeCallError(f"judge call failed: {type(error).__name__}: {self.redact.short(error)}") from None
            if attempt < attempts:
                wait = min(MAX_BACKOFF_S, delay if delay is not None else 2**attempt + random.uniform(0, 1))
                logger.warning("judge call failed, retrying", extra={"attempt": attempt, "error": last_error, "wait_s": round(wait, 1)})
                await asyncio.sleep(wait)
        raise JudgeCallError(f"judge call failed after {attempts} attempts: {last_error}")


class FakeJudge(DeepEvalBaseLLM):
    def __init__(self) -> None:
        self.redact = Redactor("")
        super().__init__("fake-judge")

    async def preflight(self) -> None:
        return None

    def load_model(self) -> None:
        return None

    def get_model_name(self) -> str:
        return "fake-judge"

    def generate(self, prompt: str, schema: type[BaseModel] | None = None) -> Any:
        return self._answer(prompt, schema)

    async def a_generate(self, prompt: str, schema: type[BaseModel] | None = None) -> Any:
        return self._answer(prompt, schema)

    def _answer(self, prompt: str, schema: type[BaseModel] | None) -> Any:
        score = 8 + int(hashlib.sha256(prompt.encode("utf-8")).hexdigest()[:8], 16) % 3
        payload: dict[str, Any] = {"score": score, "reason": "Fake judge: a deterministic score from the prompt hash; no model was called.", "steps": ["Fake step."]}
        if schema is None:
            return json.dumps(payload)
        fields = schema.model_fields
        unknown = [name for name, info in fields.items() if info.is_required() and name not in payload]
        if unknown:
            raise JudgeOutputError(f"the fake judge cannot answer schema {schema.__name__} (needs {', '.join(unknown)})")
        return schema.model_validate({name: payload[name] for name in fields if name in payload})
