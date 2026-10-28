import os

os.environ["DEEPEVAL_TELEMETRY_OPT_OUT"] = "YES"
os.environ["CONFIDENT_TRACING_ENABLED"] = "NO"
os.environ.setdefault("DEEPEVAL_DISABLE_DOTENV", "1")

import argparse
import asyncio
import json
import logging
import statistics
import sys
from dataclasses import asdict, dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from deepeval.metrics import BaseMetric
from deepeval.models import DeepEvalBaseLLM
from deepeval.test_case import LLMTestCase

from judge import ClaudeJudge, FakeJudge, JudgeCallError, JudgeSetupError, Redactor, display_url, judge_config_from_env
from metrics import GEVAL_SPECS, METRIC_LABELS, Case, build_geval, deterministic_metrics

EXIT_PASS = 0
EXIT_GATE_FAILED = 1
EXIT_SETUP_ERROR = 2
DEFAULT_CONCURRENCY = 2
REQUIRED_FIELDS = ("id", "fixture", "archetype", "run", "chapter", "brief", "canon", "hiddenSecrets", "prose", "wordCount", "premise", "writingInstructions")
Judge = ClaudeJudge | FakeJudge
LOG_RECORD_FIELDS = frozenset(vars(logging.LogRecord("", 0, "", 0, "", None, None)).keys()) | {"message", "asctime"}

logger = logging.getLogger("novel-forge-deepeval")


class SetupError(Exception):
    pass


class StructuredFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        extra = {key: value for key, value in vars(record).items() if key not in LOG_RECORD_FIELDS}
        return f"{record.levelname.lower()}: {record.getMessage()}" + (f" {json.dumps(extra, default=str)}" if extra else "")


@dataclass
class MetricResult:
    case_id: str
    fixture: str
    run: int
    chapter: int
    metric: str
    name: str
    kind: str
    status: str
    score: float | None
    threshold: float
    reason: str | None
    error: str | None = None


@dataclass
class Job:
    case: Case
    key: str
    kind: str
    metric: BaseMetric
    test_case: LLMTestCase


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Judge Novel Forge genre-craft cases (cases.jsonl from g-genre-craft.ts) with DeepEval.")
    parser.add_argument("--cases", required=True, type=Path, help="path to cases.jsonl")
    parser.add_argument(
        "--judge", choices=("claude", "fake"), default="claude", help="claude (an OpenAI-compatible endpoint serving anthropic/* models) or fake (offline, deterministic)"
    )
    parser.add_argument("--out", type=Path, default=None, help="directory for result.json and summary.md (default: beside the cases)")
    parser.add_argument("--concurrency", type=int, default=DEFAULT_CONCURRENCY, help=f"judge calls in flight at once (default {DEFAULT_CONCURRENCY})")
    args = parser.parse_args(argv)
    if args.concurrency < 1:
        parser.error("--concurrency must be at least 1")
    return args


def load_cases(path: Path) -> list[Case]:
    if not path.is_file():
        raise SetupError(f"cases file not found: {path}")
    cases: list[Case] = []
    for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        if not line.strip():
            continue
        try:
            case = json.loads(line)
        except json.JSONDecodeError as error:
            raise SetupError(f"{path.name} line {number} is not valid JSON: {error.msg}") from error
        missing = [name for name in REQUIRED_FIELDS if name not in case]
        if missing:
            raise SetupError(f"{path.name} line {number} lacks {', '.join(missing)} — regenerate it with g-genre-craft.ts")
        cases.append(case)
    if not cases:
        raise SetupError(f"{path} holds no cases — the generator wrote nothing to judge")
    return cases


def empty_fixtures(cases_path: Path, cases: list[Case]) -> list[str]:
    manifest = cases_path.parent / "generation.json"
    if not manifest.is_file():
        return []
    generation = json.loads(manifest.read_text(encoding="utf-8"))
    present = {case["fixture"] for case in cases}
    return [fixture["id"] for fixture in generation.get("fixtures", []) if fixture["id"] not in present]


def build_judge(kind: str) -> Judge:
    if kind == "fake":
        return FakeJudge()
    config = judge_config_from_env()
    logger.info("judging with Claude", extra={"endpoint": display_url(config.base_url), "model": config.model})
    return ClaudeJudge(config)


def previous_case(case: Case, by_chapter: dict[tuple[str, int, int], Case]) -> Case | None:
    return by_chapter.get((case["fixture"], case["run"], case["chapter"] - 1))


def plan_jobs(cases: list[Case], judge: DeepEvalBaseLLM) -> tuple[list[Job], list[MetricResult]]:
    by_chapter = {(case["fixture"], case["run"], case["chapter"]): case for case in cases}
    jobs: list[Job] = []
    skipped: list[MetricResult] = []
    for case in cases:
        for spec in GEVAL_SPECS:
            if not spec.applies(case):
                skipped.append(result_for(case, spec.key, "geval", "n/a", None, spec.threshold, "not applicable to this case"))
                continue
            metric, test_case = build_geval(spec, case, judge)
            jobs.append(Job(case=case, key=spec.key, kind="geval", metric=metric, test_case=test_case))
        for key, metric in deterministic_metrics(case, previous_case(case, by_chapter)):
            jobs.append(Job(case=case, key=key, kind="deterministic", metric=metric, test_case=LLMTestCase(input=case["id"], actual_output=case["prose"])))
    return jobs, skipped


def result_for(case: Case, key: str, kind: str, status: str, score: float | None, threshold: float, reason: str | None, error: str | None = None) -> MetricResult:
    return MetricResult(
        case_id=case["id"],
        fixture=case["fixture"],
        run=case["run"],
        chapter=case["chapter"],
        metric=key,
        name=METRIC_LABELS[key],
        kind=kind,
        status=status,
        score=None if score is None else round(float(score), 4),
        threshold=threshold,
        reason=reason,
        error=error,
    )


async def run_job(job: Job, gate: asyncio.Semaphore, redact: Redactor) -> MetricResult:
    threshold = float(job.metric.threshold)
    async with gate:
        try:
            score = await job.metric.a_measure(job.test_case, _show_indicator=False)
        except Exception as error:
            message = redact(f"{type(error).__name__}: {error}")
            logger.error("metric errored", extra={"case": job.case["id"], "metric": job.key, "error": message[:400]})
            return result_for(job.case, job.key, job.kind, "error", None, threshold, None, message[:1000])
    passed = score is not None and float(score) >= threshold
    return result_for(job.case, job.key, job.kind, "pass" if passed else "fail", score, threshold, job.metric.reason)


async def judge_all(judge: Judge, jobs: list[Job], concurrency: int) -> list[MetricResult]:
    try:
        await judge.preflight()
    except JudgeCallError as error:
        raise SetupError(f"the judge preflight call failed, so nothing was judged: {error}") from None
    gate = asyncio.Semaphore(concurrency)
    return list(await asyncio.gather(*(run_job(job, gate, judge.redact) for job in jobs)))


def aggregate(results: list[MetricResult]) -> list[dict[str, Any]]:
    groups: dict[tuple[str, str], list[MetricResult]] = {}
    for result in results:
        groups.setdefault((result.fixture, result.metric), []).append(result)
    rows: list[dict[str, Any]] = []
    for (fixture, metric), entries in sorted(groups.items()):
        scores = [entry.score for entry in entries if entry.score is not None]
        rows.append(
            {
                "fixture": fixture,
                "metric": metric,
                "name": METRIC_LABELS[metric],
                "threshold": entries[0].threshold,
                "n": len(scores),
                "mean": round(statistics.fmean(scores), 4) if scores else None,
                "min": round(min(scores), 4) if scores else None,
                "failed": sum(entry.status == "fail" for entry in entries),
                "errors": sum(entry.status == "error" for entry in entries),
                "notApplicable": sum(entry.status == "n/a" for entry in entries),
            }
        )
    return rows


def cell(value: Any) -> str:
    text = "—" if value is None else f"{value:.2f}" if isinstance(value, float) else str(value)
    return " ".join(text.replace("|", "\\|").split())


def md_table(headers: list[str], rows: list[list[Any]]) -> str:
    lines = ["| " + " | ".join(headers) + " |", "| " + " | ".join("---" for _ in headers) + " |"]
    lines.extend("| " + " | ".join(cell(value) for value in row) + " |" for row in rows)
    return "\n".join(lines)


def summary_markdown(verdict: str, judge_name: str, cases: list[Case], results: list[MetricResult], rows: list[dict[str, Any]], setup_errors: list[str]) -> str:
    failures = [result for result in results if result.status in ("fail", "error")]
    others = [result for result in results if result.status not in ("fail", "error")]
    order = {"error": 0, "fail": 1, "pass": 2, "n/a": 3}
    lines = [
        "# (g) Genre craft — DeepEval",
        "",
        f"**{verdict}** — judge `{judge_name}`, {len(cases)} case(s), {len(failures)} failing or errored metric result(s). A metric gates when any case scores below its threshold.",
        "",
    ]
    if setup_errors:
        lines += ["## Setup errors", "", *[f"- {error}" for error in setup_errors], ""]
    lines += [
        "## Failures and errors",
        "",
        md_table(
            ["case", "metric", "status", "score", "threshold", "reason or error"],
            [[r.case_id, r.name, r.status.upper(), r.score, r.threshold, r.error or r.reason] for r in failures],
        )
        if failures
        else "None.",
        "",
        "## Per fixture and metric",
        "",
        md_table(
            ["fixture", "metric", "threshold", "n", "mean", "min", "failed", "errors", "n/a"],
            [[r["fixture"], r["name"], r["threshold"], r["n"], r["mean"], r["min"], r["failed"], r["errors"], r["notApplicable"]] for r in rows],
        ),
        "",
        "## Every result",
        "",
        md_table(
            ["case", "metric", "status", "score", "reason"],
            [[r.case_id, r.name, r.status, r.score, r.error or r.reason] for r in sorted(others, key=lambda r: (r.case_id, order[r.status], r.metric))],
        ),
    ]
    return "\n".join(lines) + "\n"


def write_outputs(out_dir: Path, payload: dict[str, Any], markdown: str) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    (out_dir / "result.json").write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (out_dir / "summary.md").write_text(markdown, encoding="utf-8")


def main(argv: list[str]) -> int:
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(StructuredFormatter())
    logging.basicConfig(level=logging.INFO, handlers=[handler], force=True)
    for noisy in ("httpx", "openai", "deepeval"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
    args = parse_args(argv)
    try:
        return evaluate(args)
    except (SetupError, JudgeSetupError) as error:
        logger.error(str(error))
    except Exception as error:
        logger.exception("the DeepEval run failed", extra={"error": f"{type(error).__name__}: {error}"[:400]})
    return EXIT_SETUP_ERROR


def evaluate(args: argparse.Namespace) -> int:
    cases = load_cases(args.cases)
    judge = build_judge(args.judge)

    setup_errors = [f"fixture {fixture} produced no cases — see generation.md" for fixture in empty_fixtures(args.cases, cases)]
    jobs, skipped = plan_jobs(cases, judge)
    logger.info("judging", extra={"cases": len(cases), "metric_runs": len(jobs), "judge": judge.get_model_name(), "concurrency": args.concurrency})
    results = asyncio.run(judge_all(judge, jobs, args.concurrency)) + skipped
    results.sort(key=lambda result: (result.fixture, result.run, result.chapter, result.metric))

    errored = [result for result in results if result.status == "error"]
    failed = [result for result in results if result.status == "fail"]
    exit_code = EXIT_SETUP_ERROR if errored or setup_errors else EXIT_GATE_FAILED if failed else EXIT_PASS
    verdict = {EXIT_PASS: "PASS", EXIT_GATE_FAILED: "FAIL", EXIT_SETUP_ERROR: "ERROR"}[exit_code]
    rows = aggregate(results)
    out_dir = args.out or args.cases.parent
    payload = {
        "suite": "g-genre-craft",
        "step": "deepeval",
        "verdict": verdict,
        "judge": judge.get_model_name(),
        "judgedAt": datetime.now(UTC).isoformat(),
        "cases": str(args.cases),
        "n": len(cases),
        "setupErrors": setup_errors,
        "summary": rows,
        "results": [asdict(result) for result in results],
    }
    write_outputs(out_dir, payload, summary_markdown(verdict, judge.get_model_name(), cases, results, rows, setup_errors))
    level = logging.INFO if exit_code == EXIT_PASS else logging.ERROR
    logger.log(level, f"g-genre-craft deepeval: {verdict}", extra={"failed": len(failed), "errored": len(errored), "setup_errors": len(setup_errors), "out": str(out_dir)})
    return exit_code


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
