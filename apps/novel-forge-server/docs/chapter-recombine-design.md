# Chapter Recombine Design

Translated web novels often split one source chapter into 2–5 translator "chapters" (`Chapter 700 (1/2)`, `Chapter 700 Part 2`, `c700.3`, or a bare repeated title). The recombine
pass merges these back into original chapters — deterministic title-driven grouping, one AI call for the boundaries titles cannot decide, transactional merge + contiguous
renumbering — and runs automatically after every completed scrape and as a rebrand-job phase. Drives tasks RC1–RC2 in CLAUDE.md.

## 1. Behavior

- `POST /projects/:projectId/recombine` body `{dryRun?, useAi?}` → `{applied, before, after, merged: [{number, title, parts}], ambiguous: [{afterNumber, reason}]}` (synchronous,
  wired through `PipelineController` like `consolidate`).
- Automatic: `RecombineService.autoRecombine` (always `useAi: true`) runs when an ingest/resume job reports the scrape complete, and in the rebrand job between acquisition and
  glossary seeding (progress `{phase: 'recombining'}`). Guard violations log-and-skip — automatic hygiene never fails a job.

## 2. Detection ladder (`src/modules/source/title-parts.ts`, pure)

`parseTitleParts(title)` → `{base, sourceChapter, part, partTotal}` via ordered regexes: `(d/d)`/`[d/d]`, `Part d`/`Pt. d`, trailing `(d)`, `Chapter d[.d]` prefix (the `.d` is the
part), bare `d -` prefix, trailing `- d`. `buildGroupingPlan(chapters)` scans serially (parts are always adjacent in reading order):

- explicit `sourceChapter` in both titles → same group iff equal (strongest signal);
- same normalized base + explicit part sequence (`part === prev + 1`, an unmarked first part counts as part 1) → same group;
- same base continuing an unmet `partTotal` → same group;
- **bare repeated base with no part token → NOT merged, flagged `bare_repeat`** (a novel may legitimately reuse a title);
- other ambiguity flags: `part_gap` (1 then 3), `total_unmet`, `untitled_short` (missing title next to a < 1,500-word chapter); group flags: `oversized` (> 5), `total_mismatch`.

`applyBoundaryMerges(plan, mergeAfter)` folds AI verdicts in: the model only ever joins groups the ladder left separate, never splits deterministic ones.

## 3. AI boundary resolution (RC2)

One analytical call per ≤ 50 flagged boundaries: each gets prev/next numbers, titles, word counts, and ~300-char tail/head prose excerpts. Prompt `recombine` (analytical, role
`skeleton`), output `{decisions: [{afterChapter, verdict: "merge"|"split"}]}`. Runs through `WorkflowRunService.runChain` + `ModelRouterService.structured`. Unknown boundaries in
the output are ignored; missing decisions default to split.

## 4. Apply

Guards: project exists + kind `source` (`PRJ_001`/`PRJ_003`); `scrapeComplete` (`SRC_002`); **no derived data** (`SRC_003`) — chapter numbers are referenced by
`chapters.summary`, `entity_appearances`, `beats`, `chapter_chunks`, `briefs`, `chapter_conversions`, and `drafts`, so renumbering is only legal before any exist.
(`rebrand_glossary.createdChapter` is display-only metadata and recombine precedes glossary seeding — not guarded.) Dry runs skip the apply guards.

In one transaction: merged content = member bodies joined with a blank line; title = stripped display base; `wordCount` recomputed; `chapters.mergedFrom` (jsonb, RC1 column) =
`[{number, title, words, url}]` audit trail; absorbed rows deleted; survivors renumbered contiguously in two phases (park on negative numbers, flip sign once) to dodge
`unique(projectId, number)`; finally `projects.scrapeNextNumber = after + 1`.

Idempotent: a second run sees clean base titles, so the plan degenerates to a no-op; post-extraction runs are guard-blocked.

## 5. Limitations

- Ongoing novels: once complete, `scrapeNextUrl` is null so a resume cannot continue anyway; if the source grows later, re-ingest appends and a pre-extraction re-run handles the
  new tail.
- Already-extracted projects: auto-run no-ops with a log line; recombining them requires deliberately wiping derived data first (out of scope).
- Null titles are never merged deterministically; they reach the AI only when flagged short.
