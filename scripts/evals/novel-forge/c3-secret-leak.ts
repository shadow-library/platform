import {
  assertFixtureClean,
  type ChapterRecord,
  cleanup,
  EvalError,
  formatRate,
  intFlag,
  loadStory,
  milestoneChapter,
  patternHits,
  runSuite,
  seedStoryProject,
  type Story,
  type SuiteContext,
  type SuiteVerdict,
  table,
  writeStoryChapter,
} from './lib/index.ts';

interface LeakCheck {
  run: number;
  chapter: number;
  written: boolean;
  lockedSecrets: string[];
  patternHits: { factKey: string; match: string }[];
  forgeDisclosure: string[];
  judge: string | null;
  flagged: boolean;
  error?: string;
}

const USAGE = `Usage: bun scripts/evals/novel-forge/c3-secret-leak.ts [flags]

(c3) Secret leak in prose: writes chapters 1..N of the invented progression story (fixtures/story/tidewright.json) with its
milestone-gated secrets, approving and finalizing each, then checks every chapter for a locked secret disclosed early: the
fixture's reveal patterns, Forge's own finalize-review disclosure check, and the judge verdict. Advisory: reports the flag
rate with n; a confirmed leak (owner spot-check, template in summary.md) blocks until its cause is fixed. Default --runs 1.

  --chapters <n>        chapters to write (default 10)`;

function lockedAt(story: Story, chapter: number): Story['secrets'] {
  return story.secrets.filter(secret => milestoneChapter(story, secret) > chapter);
}

function checkChapter(story: Story, run: number, record: ChapterRecord): LeakCheck {
  const locked = lockedAt(story, record.chapter);
  const body = record.draft?.body ?? '';
  const hits = locked.flatMap(secret => patternHits(body, secret.revealPatterns).map(match => ({ factKey: secret.factKey, match })));
  const review = record.finalize?.review;
  const forgeDisclosure = [
    ...(review && !review.disclosure.clear ? review.disclosure.findings : []),
    ...(record.finalize?.flags.filter(flag => flag === 'unplanned_disclosure') ?? []),
  ];
  return {
    run,
    chapter: record.chapter,
    written: body.length > 0,
    lockedSecrets: locked.map(secret => secret.factKey),
    patternHits: hits,
    forgeDisclosure,
    judge: record.draft?.judge ?? null,
    flagged: hits.length > 0 || forgeDisclosure.length > 0,
    error: record.error,
  };
}

function summary(checks: readonly LeakCheck[]): string {
  const written = checks.filter(check => check.written);
  const flagged = written.filter(check => check.flagged);
  return [
    '# (c3) Secret leak in prose',
    '',
    `Advisory. Flagged chapters: **${formatRate(flagged.length, written.length)}**. A flag is a candidate, not a confirmed leak — confirm or clear each below. Report the rate with its n; n=10 cannot support "zero leaks".`,
    '',
    `Chapters that failed to write: ${checks.filter(check => !check.written).length}.`,
    '',
    table(
      ['run', 'chapter', 'locked secrets', 'pattern hits', 'Forge disclosure', 'judge', 'flagged', 'error'],
      checks.map(check => [
        check.run,
        check.chapter,
        check.lockedSecrets.join(', '),
        check.patternHits.map(hit => `${hit.factKey}: "${hit.match}"`).join('; ') || '—',
        check.forgeDisclosure.join('; ') || '—',
        check.judge ?? '—',
        check.flagged ? 'YES' : '',
        check.error ?? '',
      ]),
    ),
    '',
    '## Owner spot-check',
    '',
    'Read each flagged chapter (chapters/run-<r>-ch-<n>.md beside this file) and at least two unflagged ones. Mark each: `leak` (a locked truth is stated or unmistakable), `clue` (an allowed clue, fine), or `clear`.',
    '',
    table(
      ['run', 'chapter', 'flagged', 'verdict (leak / clue / clear)', 'which secret', 'note'],
      written.map(check => [check.run, check.chapter, check.flagged ? 'yes' : '', '', '', '']),
    ),
  ].join('\n');
}

async function run(context: SuiteContext): Promise<SuiteVerdict> {
  const story = loadStory();
  assertFixtureClean(story);
  const chapters = intFlag(context.flags, 'chapters', 10);
  if (chapters > story.chapters.length) throw new EvalError(`--chapters is at most ${story.chapters.length}`);
  const checks: LeakCheck[] = [];
  for (let run = 1; run <= context.runs; run += 1) {
    const author = context.author(`c3-run-${run}`);
    const { projectId } = await seedStoryProject(context, story, `c3 run ${run}`);
    try {
      for (const chapter of story.chapters.slice(0, chapters)) {
        const record = await writeStoryChapter(author, projectId, chapter);
        checks.push(checkChapter(story, run, record));
        if (record.draft) context.sink.writeArtifact(`chapters/run-${run}-ch-${chapter.n}.md`, `# ${record.draft.title ?? chapter.title}\n\n${record.draft.body}\n`);
        if (record.error) break;
      }
    } finally {
      await cleanup(context, projectId);
    }
  }
  const written = checks.filter(check => check.written);
  const flagged = written.filter(check => check.flagged).length;
  context.sink.writeResult(
    { suite: 'c3-secret-leak', target: context.api.target, dryRun: context.dryRun, runs: context.runs, tier: context.tier, n: written.length, flagged, checks },
    summary(checks),
  );
  return { passed: null, headline: `flagged ${formatRate(flagged, written.length)} — confirm by hand before calling any a leak` };
}

await runSuite({ name: 'c3-secret-leak', usage: USAGE, defaultRuns: 1, run });
