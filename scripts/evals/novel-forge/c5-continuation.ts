import {
  assertFixtureClean,
  type BaselineChapter,
  type ChapterRecord,
  cleanup,
  type ContinuityCheck,
  EvalError,
  intFlag,
  loadBaseline,
  loadContinuityChecks,
  loadStory,
  type NovelBundle,
  patternHits,
  runSuite,
  seedStoryBible,
  stringFlag,
  type SuiteContext,
  type SuiteVerdict,
  table,
  writeStoryChapter,
} from './lib/index.ts';

interface ContradictionHit {
  run: number;
  chapter: number;
  checkId: string;
  critical: boolean;
  kind: string;
  match: string;
}

interface ChapterOutcome {
  run: number;
  chapter: number;
  planned: ChapterRecord['planned'];
  written: boolean;
  judge: string | null;
  flags: string[];
  disclosureClear: boolean | null;
  error?: string;
}

const USAGE = `Usage: bun scripts/evals/novel-forge/c5-continuation.ts [flags]

(c5) Continuation: imports the invented 20-chapter baseline (fixtures/story/baseline.md) as a finished manuscript, records its
cast, milestones and still-locked secrets, then continues it chapter by chapter — plan, write, approve, review, finalize —
and checks the new chapters against fixtures/story/continuity-checks.json, the judge verdict and the finalize review.
Advisory: reports critical power/knowledge contradictions and writes an owner-rating template (craft >= 3/5 per dimension).
Default --runs 1.

  --chapters <n>        chapters to continue (default 10: chapters 21-30)
  --plan-via <how>      chat (default: ask the chat to plan, accept its cards, then pin the fixture's plan text) | brief (type the plan in)`;

const BASELINE_VOLUME_SIZE = 10;

function bundleFor(title: string, synopsis: string, baseline: readonly BaselineChapter[]): NovelBundle {
  const volumes: NovelBundle['volumes'] = [];
  for (let start = 0; start < baseline.length; start += BASELINE_VOLUME_SIZE) {
    volumes.push({
      ordinal: volumes.length + 1,
      title: `Book ${volumes.length + 1}`,
      chapters: baseline.slice(start, start + BASELINE_VOLUME_SIZE).map(chapter => ({ title: chapter.title, content: chapter.content })),
    });
  }
  return { format: 'novel-import', schemaVersion: 1, mode: 'final', novel: { title, synopsis }, volumes };
}

function contradictions(run: number, record: ChapterRecord, checks: readonly ContinuityCheck[]): ContradictionHit[] {
  const body = record.draft?.body ?? '';
  return checks
    .filter(check => record.chapter >= check.fromChapter && record.chapter <= check.toChapter)
    .flatMap(check => patternHits(body, check.patterns).map(match => ({ run, chapter: record.chapter, checkId: check.id, critical: check.critical, kind: check.kind, match })));
}

function ratingTemplate(chapters: readonly number[], dimensions: readonly string[]): string {
  return [
    '# (c5) Owner rating',
    '',
    'Read chapters/ beside this file (the baseline ends at chapter 20). Score each dimension 1–5 for the continuation as a whole, then note the chapters that pulled the score down. Threshold: >= 3 on every dimension.',
    '',
    table(
      ['dimension', 'score (1-5)', 'weakest chapters', 'note'],
      dimensions.map(dimension => [dimension, '', '', '']),
    ),
    '',
    '## Contradictions the checks flagged — confirm or clear each',
    '',
    'See summary.md. Also list any contradiction the checks missed:',
    '',
    table(
      ['chapter', 'contradiction', 'critical?'],
      chapters.slice(0, 3).map(() => ['', '', '']),
    ),
  ].join('\n');
}

function summary(outcomes: readonly ChapterOutcome[], hits: readonly ContradictionHit[]): string {
  const critical = hits.filter(hit => hit.critical);
  return [
    '# (c5) Continuation',
    '',
    `Advisory. Critical contradiction candidates: **${critical.length}**; all candidates: ${hits.length}; chapters written: ${outcomes.filter(o => o.written).length}/${outcomes.length}. Target: zero confirmed critical power/knowledge contradictions and owner craft >= 3/5 (owner-rating.md).`,
    '',
    "Pattern checks are candidates for a human to confirm, not verdicts; the judge and the finalize review are Forge's own view of the same chapters.",
    '',
    '## Chapters',
    '',
    table(
      ['run', 'chapter', 'planned via', 'judge', 'review flags', 'disclosure clear', 'error'],
      outcomes.map(o => [
        o.run,
        o.chapter,
        o.planned,
        o.judge ?? '—',
        o.flags.join(', ') || '—',
        o.disclosureClear === null ? '—' : o.disclosureClear ? 'yes' : 'NO',
        o.error ?? '',
      ]),
    ),
    '',
    '## Contradiction candidates',
    '',
    hits.length === 0
      ? 'None.'
      : table(
          ['run', 'chapter', 'check', 'critical', 'kind', 'matched text'],
          hits.map(h => [h.run, h.chapter, h.checkId, h.critical ? 'YES' : '', h.kind, h.match]),
        ),
  ].join('\n');
}

async function run(context: SuiteContext): Promise<SuiteVerdict> {
  const story = loadStory();
  const baseline = loadBaseline();
  assertFixtureClean(story, baseline);
  const { checks, ratingDimensions } = loadContinuityChecks();
  const count = intFlag(context.flags, 'chapters', 10);
  const planVia = stringFlag(context.flags, 'plan-via') ?? 'chat';
  if (planVia !== 'chat' && planVia !== 'brief') throw new EvalError('--plan-via is chat or brief');
  const continuation = story.chapters.slice(baseline.length, baseline.length + count);
  if (continuation.length < count) throw new EvalError(`The story fixture plans only ${story.chapters.length - baseline.length} chapters past the baseline`);

  const outcomes: ChapterOutcome[] = [];
  const hits: ContradictionHit[] = [];
  for (let run = 1; run <= context.runs; run += 1) {
    const author = context.author(`c5-run-${run}`);
    const imported = await context.api.importNovel(bundleFor(`[eval c5 run ${run}] ${story.title}`, story.synopsis, baseline));
    try {
      const job = await author.settle(imported.jobId);
      if (job.status !== 'done') throw new EvalError(`importing the baseline ended ${job.status}: ${job.lastError ?? 'no error recorded'}`);
      if (context.tier) await context.api.updateProject(imported.projectId, { costTier: context.tier });
      await context.api.putNotes(imported.projectId, story.notes);
      await seedStoryBible(context, imported.projectId, story, { revealedThrough: baseline.length });
      const session = await context.api.createSession(imported.projectId, 'auto');
      for (const chapter of continuation) {
        const record = await writeStoryChapter(author, imported.projectId, chapter, { sessionId: session.id, planViaChat: planVia === 'chat' });
        if (record.draft) context.sink.writeArtifact(`chapters/run-${run}-ch-${chapter.n}.md`, `# ${record.draft.title ?? chapter.title}\n\n${record.draft.body}\n`);
        hits.push(...contradictions(run, record, checks));
        outcomes.push({
          run,
          chapter: chapter.n,
          planned: record.planned,
          written: Boolean(record.draft?.body),
          judge: record.draft?.judge ?? null,
          flags: record.finalize?.flags ?? [],
          disclosureClear: record.finalize ? record.finalize.review.disclosure.clear : null,
          error: record.error,
        });
        if (record.error) break;
      }
    } finally {
      await cleanup(context, imported.projectId);
    }
  }
  context.sink.writeArtifact(
    'owner-rating.md',
    ratingTemplate(
      continuation.map(chapter => chapter.n),
      ratingDimensions,
    ),
  );
  const critical = hits.filter(hit => hit.critical).length;
  context.sink.writeResult(
    { suite: 'c5-continuation', target: context.api.target, dryRun: context.dryRun, runs: context.runs, tier: context.tier, planVia, outcomes, hits },
    summary(outcomes, hits),
  );
  return {
    passed: null,
    headline: `${critical} critical contradiction candidate(s), ${hits.length} in all, ${outcomes.filter(o => o.written).length}/${outcomes.length} chapters written — owner rating pending`,
  };
}

await runSuite({ name: 'c5-continuation', usage: USAGE, defaultRuns: 1, run });
