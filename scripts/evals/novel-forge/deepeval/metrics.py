import math
import re
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from deepeval.metrics import BaseMetric, GEval
from deepeval.models import DeepEvalBaseLLM
from deepeval.test_case import LLMTestCase, SingleTurnParams

FENCE = re.compile(r"^\s{0,3}(`{3,}|~{3,})\s*(\S*)\s*(.*)$")
TABLE_DELIMITER = re.compile(r"^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$")
STAT_CELL = re.compile(r"^(-?\d+)(?:\s*/\s*\d+)?$")
NAME_TOKEN = re.compile(r"[a-z][a-z'-]*")
HONORIFICS = frozenset({"lady", "lord", "sir", "dame", "brother", "sister", "captain", "councillor", "inspector", "warden", "reeve", "master", "mistress", "doctor", "the"})
MAX_PANELS = 3
LENGTH_TOLERANCE_SLOPE = 2.0
ENDING_WORDS = 300

Case = dict[str, Any]


@dataclass
class Table:
    line: int
    header: list[str]
    rows: list[list[str]]
    issues: list[str] = field(default_factory=list)


@dataclass
class Panel:
    line: int
    title: str
    body: str
    closed: bool
    tables: list[Table]


def _cells(line: str) -> list[str]:
    stripped = line.strip()
    if stripped.startswith("|"):
        stripped = stripped[1:]
    if stripped.endswith("|") and not stripped.endswith("\\|"):
        stripped = stripped[:-1]
    return [cell.strip() for cell in re.split(r"(?<!\\)\|", stripped)]


def _is_table_start(lines: list[str], index: int) -> bool:
    following = lines[index + 1] if index + 1 < len(lines) else ""
    return "|" in lines[index] and "|" in following and bool(TABLE_DELIMITER.match(following))


def _read_table(lines: list[str], index: int, offset: int = 0) -> tuple[Table, int]:
    header = _cells(lines[index])
    delimiter = _cells(lines[index + 1])
    at = index + 1 + offset
    table = Table(line=at, header=header, rows=[])
    if len(header) < 2:
        table.issues.append(f"table at line {at} has fewer than two columns")
    if len(delimiter) != len(header):
        table.issues.append(f"table at line {at}: separator has {len(delimiter)} cells, header has {len(header)}")
    cursor = index + 2
    while cursor < len(lines) and lines[cursor].strip() and "|" in lines[cursor]:
        row = _cells(lines[cursor])
        if len(row) != len(header):
            table.issues.append(f"table at line {at}: row at line {cursor + 1 + offset} has {len(row)} cells, header has {len(header)}")
        if all(not cell for cell in row):
            table.issues.append(f"table at line {at}: row at line {cursor + 1 + offset} is empty")
        table.rows.append(row)
        cursor += 1
    if not table.rows:
        table.issues.append(f"table at line {at} has no rows")
    return table, cursor - 1


def tables_in(text: str, offset: int = 0) -> list[Table]:
    lines = text.splitlines()
    found: list[Table] = []
    index = 0
    while index < len(lines):
        if _is_table_start(lines, index):
            table, index = _read_table(lines, index, offset)
            found.append(table)
        index += 1
    return found


def parse_markdown(markdown: str) -> tuple[str, list[Panel], list[Table]]:
    lines = markdown.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    prose: list[str] = []
    panels: list[Panel] = []
    loose_tables: list[Table] = []
    index = 0
    while index < len(lines):
        line = lines[index]
        fence = FENCE.match(line)
        if fence and fence.group(2) == "system":
            marker = fence.group(1)
            start = index
            index += 1
            body: list[str] = []
            while index < len(lines) and not lines[index].strip().startswith(marker):
                body.append(lines[index])
                index += 1
            closed = index < len(lines)
            text = "\n".join(body)
            panels.append(Panel(line=start + 1, title=fence.group(3).strip() or "System", body=text, closed=closed, tables=tables_in(text, start + 1)))
            index += 1
            continue
        if _is_table_start(lines, index):
            table, end = _read_table(lines, index)
            loose_tables.append(table)
            index = end + 1
            continue
        prose.append(line)
        index += 1
    return "\n".join(prose), panels, loose_tables


def prose_word_count(markdown: str) -> int:
    prose, _, _ = parse_markdown(markdown)
    return len(prose.split())


def _brief_text(case: Case) -> str:
    brief = case["brief"]
    milestones = ", ".join(brief.get("claimedMilestones") or []) or "none"
    return f"Chapter {case['chapter']}: {brief['title']}\nPoint of view: {brief['povName']}\nMilestones this chapter reaches: {milestones}\nPlan:\n{brief['plan']}"


def _previous_text(case: Case) -> str:
    previous = case.get("previous")
    if not previous:
        return "This is the first chapter; nothing precedes it."
    return f"Previous chapter {previous['chapter']} ({previous['title']}).\nSummary: {previous.get('summary') or 'none recorded'}\nIts last words:\n{previous['ending']}"


def _canon_text(case: Case) -> str:
    canon = case["canon"]
    source = "the writer's own context, as sent" if canon["source"] == "writer_snapshot" else f"the canon seeded for this chapter ({canon.get('note', 'writer view unavailable')})"
    return f"Canon available to the writer — {source}:\n{canon['digest']}"


def _secrets_text(case: Case) -> list[str]:
    return [
        f"HIDDEN SECRET (the reader must not learn this yet): {secret['text']}\nGive-away terms: {', '.join(secret['terms'])}\n"
        f"Allowed clues (fine to include): {'; '.join(secret['allowedClues']) or 'none'}"
        for secret in case["hiddenSecrets"]
    ]


GENRE_STEPS: dict[str, list[str]] = {
    "mystery-progression": [
        "Foreshadowing and fair play: identify the concrete clues planted in this chapter. A careful reader could notice them on a second read, and they are consistent with the canon in the context.",
        "Controlled revelation: the chapter reveals only what the point-of-view character could learn, the narrator does not cheat by hiding what the character knows, and at least one new question is raised.",
        "Dread: unease is built through concrete wrongness — sound, smell, light, an object or a behaviour out of place — rather than adjectives such as eerie or ominous.",
        "Power has a cost: any use or gain of power shows its price on the page, consistent with the rules in the context (the memory taken, the madness risk).",
        "Progression is earned: advancement follows from choices and risk, never from luck or exposition.",
        "Score high only when clues, controlled revelation, dread and visible costs are all present; deduct heavily for info-dumps or for answers handed over without investigation.",
    ],
    "kingdom-building": [
        "Every technical or economic change proceeds step by step from the materials, tools, skills and labour the context establishes; there is no leap from idea to finished invention.",
        "The chapter shows the constraint, a test, arithmetic or a trade-off, and at least one failure or cost in coin, grain, labour or goodwill.",
        "Competence: the protagonist's expertise shows through decisions under pressure, not through other characters praising him.",
        "Consequences: each change creates winners and losers in the town, and someone reacts.",
        "Politics: characters with different interests pursue them actively; when the chapter changes point of view, each viewpoint sounds distinct and sees different things.",
        "No anachronisms: locals speak and think in period terms; modern knowledge appears only in the protagonist's thoughts.",
        "Score 10 when the uplift is plausible, costly and politically consequential; deduct heavily for hand-waved engineering or economics.",
    ],
    "game-system": [
        "Panels are clear: each status window, task or notice is a short, titled system panel, and the prose around it carries the scene.",
        "Numbers are consistent: panel values agree with the canon's starting values and with earlier panels in the chapter; a level-up grants exactly the points the rules state and the next status window shows them spent; XP adds up.",
        "Stats matter: at least one outcome visibly depends on a stat, a skill level or a task reward, and the reader can see which number decided it.",
        "The interface follows the rules in the context (how tasks, XP, levels and skills work) and gains no unexplained features.",
        "The protagonist engages with the system in character — like a mechanic reading gauges — never as a game tutorial.",
        "Machinery and repair work are concrete and mechanically plausible.",
        "Score 10 when panels are clean, numbers add up and matter to the plot; deduct heavily for any inconsistent number.",
    ],
}


@dataclass(frozen=True)
class GEvalSpec:
    key: str
    name: str
    threshold: float
    steps: Callable[[Case], list[str]]
    test_case: Callable[[Case], LLMTestCase]
    params: list[SingleTurnParams]
    applies: Callable[[Case], bool] = lambda case: True


GEVAL_SPECS: list[GEvalSpec] = [
    GEvalSpec(
        key="brief_adherence",
        name="Brief adherence",
        threshold=0.7,
        params=[SingleTurnParams.INPUT, SingleTurnParams.ACTUAL_OUTPUT],
        steps=lambda case: [
            "List every event, decision and reveal the chapter plan in the input requires, including how the chapter must end.",
            "For each, check whether the actual output dramatizes it on the page rather than summarizing or skipping it; note any that are missing, changed, or reordered in a way that changes their meaning.",
            "Check the point of view matches the plan, and that any scene the plan gives to another viewpoint is written from it.",
            "Check the chapter ends at the plan's ending beat, neither resolving past it nor stopping short of it.",
            "Penalize events the plan did not ask for that change the story's direction (a new major reveal, a death, a change in power); invented connective detail is fine.",
            "Score high only when every required beat is present and the ending matches; deduct proportionally for each missing or contradicted beat.",
        ],
        test_case=lambda case: LLMTestCase(input=_brief_text(case), actual_output=case["prose"]),
    ),
    GEvalSpec(
        key="canon_continuity",
        name="Canon continuity",
        threshold=0.7,
        params=[SingleTurnParams.INPUT, SingleTurnParams.CONTEXT, SingleTurnParams.ACTUAL_OUTPUT],
        steps=lambda case: [
            "Identify the established facts in the context that the chapter touches: names, roles, relationships, injuries, abilities and their costs, places, world rules, numbers and dates.",
            "Check every such touch in the actual output against the context, and list each contradiction: a name, rule, ability, timeline or relationship stated differently.",
            "Check the chapter picks up consistently from the previous chapter described in the input: where characters are, what they know, what has just happened.",
            "Check characters know only what canon and earlier chapters allow them to know.",
            "New invented detail that does not conflict with canon is acceptable and must not be penalized.",
            "Score 10 with no contradictions; deduct heavily for a contradicted world rule, power cost or character knowledge, and moderately for minor slips.",
        ],
        test_case=lambda case: LLMTestCase(input=f"{_brief_text(case)}\n\n{_previous_text(case)}", context=[_canon_text(case)], actual_output=case["prose"]),
    ),
    GEvalSpec(
        key="prose_craft",
        name="Prose craft",
        threshold=0.6,
        params=[SingleTurnParams.INPUT, SingleTurnParams.ACTUAL_OUTPUT],
        steps=lambda case: [
            "Show, don't tell: emotion and stakes come through action, dialogue, the body and concrete detail rather than being named or explained.",
            "Distinct voices: characters can be told apart by diction, rhythm and what they choose to say; dialogue does not all sound like the narrator.",
            "Sentence variety: length and structure vary with the pace of the scene, with no long runs of same-shaped sentences.",
            "Concrete sensory detail grounded in this world — sound, smell, texture, temperature, light — rather than generic description.",
            "Penalize AI tics: stock phrases (a testament to, the weight of, couldn't help but, a mix of, something shifted), reflexive lists of three, paragraphs ending on a summarizing moral, breaths released that were not known to be held, heavy em-dash use.",
            "Penalize purple prose, phrases or images repeated within the chapter, recaps of earlier events, and paragraphs that restate the plan instead of dramatizing it.",
            "Check the prose follows the author's writing instructions in the input (person, tense, style rules).",
            "Score as a demanding fiction editor: 10 is publishable web-serial prose, 5 is competent but flat, below 4 has frequent tics or telling.",
        ],
        test_case=lambda case: LLMTestCase(input=f"Author's writing instructions:\n{case['writingInstructions']}", actual_output=case["prose"]),
    ),
    GEvalSpec(
        key="serial_hook",
        name="Serial hook",
        threshold=0.6,
        params=[SingleTurnParams.INPUT, SingleTurnParams.ACTUAL_OUTPUT],
        steps=lambda case: [
            f"Read the last {ENDING_WORDS} words of the actual output closely.",
            "Does the chapter end on an open question, a new threat, a forced decision or a reversal that makes a reader want the next chapter at once?",
            "Is that pull earned by the chapter's events rather than a sudden cliffhanger with no setup?",
            "Does the ending avoid summary, a moral, or a character settling down with everything resolved?",
            "Within the chapter, do scenes end on turns that pull forward rather than winding down?",
            "Score 10 for an ending a serial reader could not stop at, 5 for a soft ending that releases the tension, below 3 for an ending that closes every thread.",
        ],
        test_case=lambda case: LLMTestCase(input=f"The planned ending, from the chapter plan:\n{case['brief']['plan']}", actual_output=case["prose"]),
    ),
    GEvalSpec(
        key="genre_craft",
        name="Genre craft",
        threshold=0.6,
        params=[SingleTurnParams.INPUT, SingleTurnParams.CONTEXT, SingleTurnParams.ACTUAL_OUTPUT],
        steps=lambda case: GENRE_STEPS[case["archetype"]],
        test_case=lambda case: LLMTestCase(
            input=f"Archetype: {case['archetype']}\nPremise: {case['premise']}\nAuthor's writing instructions:\n{case['writingInstructions']}\n\n{_brief_text(case)}",
            context=[_canon_text(case)],
            actual_output=case["prose"],
        ),
        applies=lambda case: case["archetype"] in GENRE_STEPS,
    ),
    GEvalSpec(
        key="secret_discipline",
        name="Secret discipline",
        threshold=0.8,
        params=[SingleTurnParams.INPUT, SingleTurnParams.CONTEXT, SingleTurnParams.ACTUAL_OUTPUT],
        steps=lambda case: [
            "For each hidden secret in the context, check whether the actual output states it, or makes it unmistakable to a careful reader, through narration, dialogue or a character's conclusion.",
            "Using a give-away term, or a close paraphrase of the secret, counts as a leak even in passing.",
            "The listed allowed clues, and other hints that leave the truth open to more than one explanation, are not leaks.",
            "Check that no character acts on knowledge of a secret they could not have.",
            "Score 10 when no secret leaks, 0 when any secret is stated outright, and 3 to 6 when a secret is strongly implied beyond the allowed clues.",
        ],
        test_case=lambda case: LLMTestCase(input=_brief_text(case), context=_secrets_text(case), actual_output=case["prose"]),
        applies=lambda case: bool(case["hiddenSecrets"]),
    ),
]


def build_geval(spec: GEvalSpec, case: Case, judge: DeepEvalBaseLLM) -> tuple[GEval, LLMTestCase]:
    metric = GEval(
        name=spec.name,
        evaluation_params=spec.params,
        evaluation_steps=spec.steps(case),
        model=judge,
        threshold=spec.threshold,
        async_mode=True,
    )
    return metric, spec.test_case(case)


class DeterministicMetric(BaseMetric):
    label = "Deterministic"

    def __init__(self, threshold: float):
        self.threshold = threshold
        self.evaluation_model = "deterministic"
        self.include_reason = True
        self.async_mode = True
        self.strict_mode = False
        self.evaluation_cost = None

    def measure(self, test_case: LLMTestCase, *args: Any, **kwargs: Any) -> float:
        self.score, self.reason = self.evaluate()
        self.success = self.score >= self.threshold
        return self.score

    async def a_measure(self, test_case: LLMTestCase, *args: Any, **kwargs: Any) -> float:
        return self.measure(test_case)

    def is_successful(self) -> bool:
        return bool(self.success)

    def evaluate(self) -> tuple[float, str]:
        raise NotImplementedError

    @property
    def __name__(self) -> str:
        return self.label


class ProseLengthMetric(DeterministicMetric):
    label = "Prose length"

    def __init__(self, case: Case, threshold: float = 0.8):
        super().__init__(threshold)
        self.case = case

    def evaluate(self) -> tuple[float, str]:
        target = self.case["wordCount"]["target"]
        low, high = int(target["min"]), int(target["max"])
        count = prose_word_count(self.case["prose"])
        if low <= count <= high:
            return 1.0, f"{count} prose words, within the {low}–{high} target (system panels and tables excluded)."
        deviation = (low - count) / low if count < low else (count - high) / high
        side = "short of" if count < low else "over"
        return max(0.0, 1.0 - LENGTH_TOLERANCE_SLOPE * deviation), f"{count} prose words, {deviation:.0%} {side} the {low}–{high} target (system panels and tables excluded)."


class PanelFormatMetric(DeterministicMetric):
    label = "System panel format"

    def __init__(self, case: Case, threshold: float = 1.0):
        super().__init__(threshold)
        self.case = case

    def evaluate(self) -> tuple[float, str]:
        _, panels, loose = parse_markdown(self.case["prose"])
        issues: list[str] = []
        if not panels:
            issues.append("no ```system panel in a chapter of a game-system story")
        if len(panels) > MAX_PANELS:
            issues.append(f"{len(panels)} panels, more than the {MAX_PANELS} the writing instructions allow")
        for panel in panels:
            if not panel.closed:
                issues.append(f"panel '{panel.title}' at line {panel.line} is never closed")
            if not panel.body.strip():
                issues.append(f"panel '{panel.title}' at line {panel.line} is empty")
            issues.extend(issue for table in panel.tables for issue in table.issues)
        issues.extend(issue for table in loose for issue in table.issues)
        tables = sum(len(panel.tables) for panel in panels) + len(loose)
        if issues:
            return max(0.0, 1.0 - 0.25 * len(issues)), "; ".join(issues)
        return 1.0, f"{len(panels)} well-formed panel(s) and {tables} well-formed table(s)."


def _stat_key(name: str) -> str:
    return re.sub(r"[*_`]", "", name).strip().lower()


def name_tokens(name: str) -> list[str]:
    return [token for token in NAME_TOKEN.findall(name.lower()) if token not in HONORIFICS]


def stat_value(cell: str) -> int | None:
    match = STAT_CELL.match(re.sub(r"[*_`]", "", cell).strip())
    return int(match.group(1)) if match else None


def belongs_to_other(title: str, character: str, cast: list[dict[str, Any]]) -> bool:
    own = set(name_tokens(character))
    others: set[str] = set()
    for member in cast:
        tokens = name_tokens(member["name"])
        if tokens and set(tokens) != own:
            others.update({tokens[0], tokens[-1]})
    return any(token in others and token not in own for token in NAME_TOKEN.findall(title.lower()))


def panel_values(case: Case) -> list[dict[str, int]]:
    system = case.get("system") or {}
    character = system.get("character") or ""
    tracked = {_stat_key(stat) for stat in system.get("trackedStats", [])}
    _, panels, _ = parse_markdown(case["prose"])
    snapshots: list[dict[str, int]] = []
    for panel in panels:
        if belongs_to_other(panel.title, character, case.get("cast", [])):
            continue
        values: dict[str, int] = {}
        for table in panel.tables:
            for row in table.rows:
                if len(row) < 2 or _stat_key(row[0]) not in tracked:
                    continue
                value = stat_value(row[1])
                if value is not None:
                    values[_stat_key(row[0])] = value
        if values:
            snapshots.append(values)
    return snapshots


def starting_values(case: Case) -> dict[str, int]:
    system = case.get("system") or {}
    return {_stat_key(stat["attribute"]): int(stat["value"]) for stat in [*system.get("startingStats", []), *system.get("startingSkills", [])]}


def jump_allowance(previous: int) -> int:
    return max(3, math.ceil(abs(previous) * 0.5))


class StatConsistencyMetric(DeterministicMetric):
    label = "Stat consistency"

    def __init__(self, case: Case, previous: Case | None, threshold: float = 1.0):
        super().__init__(threshold)
        self.case = case
        self.previous = previous

    def baseline(self) -> tuple[dict[str, int], str]:
        if self.previous is not None:
            earlier = panel_values(self.previous)
            merged: dict[str, int] = {}
            for snapshot in earlier:
                merged.update(snapshot)
            if merged:
                return merged, f"chapter {self.previous['chapter']}'s last panels"
        if self.case["chapter"] == 1:
            return starting_values(self.case), "the canon's starting values"
        return {}, "nothing (the previous chapter is missing or showed no stats)"

    def evaluate(self) -> tuple[float, str]:
        baseline, source = self.baseline()
        snapshots = panel_values(self.case)
        if not snapshots:
            return 1.0, "No tracked stat appears in this chapter's panels, so there is nothing to compare."
        flags: list[str] = []
        last = dict(baseline)
        for index, snapshot in enumerate(snapshots, start=1):
            for stat, value in snapshot.items():
                if stat not in last:
                    last[stat] = value
                    continue
                before = last[stat]
                if value < before:
                    flags.append(f"{stat} fell from {before} to {value} (panel {index})")
                elif value - before > jump_allowance(before):
                    flags.append(f"{stat} jumped from {before} to {value} (panel {index}), more than {jump_allowance(before)}")
                last[stat] = value
        compared = f"Compared {len(snapshots)} panel(s) against {source}."
        if flags:
            return 0.0, f"{compared} Flagged: {'; '.join(flags)}."
        return 1.0, f"{compared} Every tracked stat held or rose within bounds."


def normalise(text: str) -> str:
    text = unicodedata.normalize("NFKC", text).lower()
    text = re.sub("[\u2018\u2019\u201b\u02bc]", "'", text)
    text = re.sub("[\u201c\u201d\u201f]", '"', text)
    text = re.sub("[\u2013\u2014]", "-", text)
    return re.sub(r"\s+", " ", text).strip()


def pattern_hits(text: str, patterns: list[str]) -> list[str]:
    normalised = normalise(text)
    hits: list[str] = []
    for pattern in patterns:
        match = re.compile(pattern, re.IGNORECASE | re.ASCII).search(normalised)
        if match:
            hits.append(match.group(0))
    return hits


def term_hit(text: str, term: str) -> bool:
    alternatives = [re.escape(normalise(alternative)) for alternative in term.split("|") if normalise(alternative)]
    if not alternatives:
        return False
    return re.search(rf"(^|[^\w])({'|'.join(alternatives)})(s|es)?($|[^\w])", normalise(text)) is not None


class SecretLeakMetric(DeterministicMetric):
    label = "Secret leak (patterns)"

    def __init__(self, case: Case, threshold: float = 1.0):
        super().__init__(threshold)
        self.case = case

    def evaluate(self) -> tuple[float, str]:
        prose = self.case["prose"]
        leaks = [f'{secret["factKey"]}: "{hit}"' for secret in self.case["hiddenSecrets"] for hit in pattern_hits(prose, secret["revealPatterns"])]
        terms = [f"{secret['factKey']}: {term}" for secret in self.case["hiddenSecrets"] for term in secret["terms"] if term_hit(prose, term)]
        advisory = f" Give-away terms used (advisory): {'; '.join(terms)}." if terms else ""
        if leaks:
            return 0.0, f"A locked secret's reveal pattern matched: {'; '.join(leaks)}.{advisory}"
        return 1.0, f"No reveal pattern of the {len(self.case['hiddenSecrets'])} hidden secret(s) matched.{advisory}"


def is_game_system(case: Case) -> bool:
    return case["archetype"] == "game-system" and bool(case.get("system"))


def deterministic_metrics(case: Case, previous: Case | None) -> list[tuple[str, DeterministicMetric]]:
    metrics: list[tuple[str, DeterministicMetric]] = [("prose_length", ProseLengthMetric(case))]
    if case["hiddenSecrets"]:
        metrics.append(("secret_leak", SecretLeakMetric(case)))
    if is_game_system(case):
        metrics.append(("panel_format", PanelFormatMetric(case)))
        metrics.append(("stat_consistency", StatConsistencyMetric(case, previous)))
    return metrics


METRIC_LABELS: dict[str, str] = {
    **{spec.key: spec.name for spec in GEVAL_SPECS},
    "prose_length": ProseLengthMetric.label,
    "panel_format": PanelFormatMetric.label,
    "stat_consistency": StatConsistencyMetric.label,
    "secret_leak": SecretLeakMetric.label,
}
