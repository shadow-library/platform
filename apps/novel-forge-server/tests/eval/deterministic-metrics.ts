// Track 2 (harness-final-recommendation.md §14) deterministic prose metrics — standalone runnable CLI.
// Reusable tooling: intended to run later against a real generated project/arc, not as a one-off. All
// metric math lives in `@server/modules/eval/deterministic-metrics` (pure, unit-tested); this script only
// does argument parsing, DB fetch, and report printing.
//
// Usage:
//   bun run eval:metrics -- --project <id> [--from <n> --to <n> | --all] [--source final|draft]
//     [--prior-window <n>] [--json]
//
//   --project        project id (required)
//   --from / --to    inclusive chapter range; omit both (or pass --all) for every chapter with prose
//   --source         'final' reads `chapters.content` (default); 'draft' reads `drafts.body`
//   --prior-window   how many chapters immediately before each target chapter count toward its
//                     cross-chapter n-gram comparison (default 10, per §14's "prior ~10 chapters")
//   --json           print the full machine-readable report instead of the plain-text summary
//
// Connects to `DATABASE_POSTGRES_URL` directly (same convention as `src/migrate.ts`) — this is an infra
// script that runs outside the app, not application code, so it is exempt from the "read config via
// Config" rule.
import { asc, eq, gte, inArray, lte } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/bun-sql';

import * as schema from '@server/database/schemas';
import { type ChapterMetricsInput, computeDeterministicMetricsReport } from '@server/modules/eval/deterministic-metrics';

interface Args {
  projectId: bigint;
  from: number | null;
  to: number | null;
  all: boolean;
  source: 'final' | 'draft';
  priorWindow: number;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const flags = new Map<string, string>();
  let all = false;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--all') {
      all = true;
      continue;
    }
    if (arg === '--json') {
      flags.set('json', 'true');
      continue;
    }
    if (arg?.startsWith('--')) {
      const key = arg.slice(2);
      const value = argv[i + 1];
      if (value === undefined) throw new Error(`missing value for --${key}`);
      flags.set(key, value);
      i++;
    }
  }

  const projectIdRaw = flags.get('project');
  if (!projectIdRaw) throw new Error('--project <id> is required');
  const source = (flags.get('source') ?? 'final') as 'final' | 'draft';
  if (source !== 'final' && source !== 'draft') throw new Error(`--source must be 'final' or 'draft', got '${source}'`);

  return {
    projectId: BigInt(projectIdRaw),
    from: flags.has('from') ? Number(flags.get('from')) : null,
    to: flags.has('to') ? Number(flags.get('to')) : null,
    all,
    source,
    priorWindow: flags.has('prior-window') ? Number(flags.get('prior-window')) : 10,
    json: flags.has('json'),
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env['DATABASE_POSTGRES_URL'] ?? 'postgresql://postgres:postgres@localhost/novel_forge';
  const db = drizzle(url, { schema });

  const fetchStart = args.from !== null ? Math.max(1, args.from - args.priorWindow) : null;

  const bodyByChapter = new Map<number, string>();
  if (args.source === 'final') {
    const rows = await db.query.chapters.findMany({
      where: (t, { and: andOp }) =>
        andOp(eq(t.projectId, args.projectId), fetchStart !== null ? gte(t.number, fetchStart) : undefined, args.to !== null ? lte(t.number, args.to) : undefined),
      columns: { number: true, content: true },
      orderBy: asc(schema.chapters.number),
    });
    for (const row of rows) if (row.content) bodyByChapter.set(row.number, row.content);
  } else {
    const rows = await db.query.drafts.findMany({
      where: (t, { and: andOp }) =>
        andOp(eq(t.projectId, args.projectId), fetchStart !== null ? gte(t.chapter, fetchStart) : undefined, args.to !== null ? lte(t.chapter, args.to) : undefined),
      columns: { chapter: true, body: true },
      orderBy: asc(schema.drafts.chapter),
    });
    for (const row of rows) if (row.body) bodyByChapter.set(row.chapter, row.body);
  }

  const allFetchedChapters = [...bodyByChapter.keys()].sort((a, b) => a - b);
  const targetChapters = args.from !== null ? allFetchedChapters.filter(c => c >= args.from!) : allFetchedChapters;

  if (targetChapters.length === 0) {
    console.log(`No ${args.source} prose found for project ${args.projectId} in the requested range.`);
    process.exit(0);
  }

  const briefRows = await db.query.briefs.findMany({
    where: (t, { and: andOp }) => andOp(eq(t.projectId, args.projectId), inArray(t.chapter, targetChapters)),
    columns: { chapter: true, endingContract: true },
  });
  const hookTypeByChapter = new Map<number, string | null>();
  for (const row of briefRows) {
    const contract = row.endingContract as { hookType?: string } | null;
    hookTypeByChapter.set(row.chapter, contract?.hookType ?? null);
  }

  const chapters: ChapterMetricsInput[] = targetChapters.map(chapter => ({
    chapter,
    body: bodyByChapter.get(chapter) ?? '',
    hookType: hookTypeByChapter.get(chapter) ?? null,
  }));

  const priorBodiesByChapter = new Map<number, string[]>();
  for (const chapter of targetChapters) {
    const priorNumbers = allFetchedChapters.filter(n => n < chapter).slice(-args.priorWindow);
    priorBodiesByChapter.set(
      chapter,
      priorNumbers.map(n => bodyByChapter.get(n) ?? ''),
    );
  }

  const report = computeDeterministicMetricsReport(chapters, priorBodiesByChapter);

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printTextReport(args, report);
  }

  await db.$client.close();
}

function printTextReport(args: Args, report: ReturnType<typeof computeDeterministicMetricsReport>): void {
  console.log(`Track 2 — deterministic prose metrics — project ${args.projectId} (${args.source})`);
  console.log(`Chapters: ${report.chapters.map(c => c.chapter).join(', ')}`);
  console.log('');

  console.log('Word count vs. target (1,800–2,600):');
  console.log(`  in-target: ${report.wordCountSummary.inTargetCount}/${report.wordCountSummary.count} (${(report.wordCountSummary.inTargetRate * 100).toFixed(1)}%)`);
  console.log(`  min=${report.wordCountSummary.min} max=${report.wordCountSummary.max} mean=${report.wordCountSummary.mean.toFixed(0)} median=${report.wordCountSummary.median}`);
  console.log('');

  console.log('Ending-mode distribution:');
  console.log(`  distinct types: ${report.endingModeDistribution.distinctCount} across ${report.endingModeDistribution.total} chapters`);
  for (const [hookType, count] of Object.entries(report.endingModeDistribution.counts)) console.log(`    ${hookType}: ${count}`);
  console.log('');

  console.log('Per-chapter:');
  for (const c of report.chapters) {
    console.log(`  chapter ${c.chapter}: ${c.words} words (${c.inWordTarget ? 'in target' : 'OUT OF TARGET'})`);
    console.log(`    sentence band (6–22 words): ${(c.sentence.bandRate * 100).toFixed(1)}% of ${c.sentence.sentenceCount}, longest monotony run=${c.sentence.longestMonotonyRun}`);
    console.log(`    within-chapter repeated n-grams: ${(c.withinChapterNgrams.overallRepeatedRate * 100).toFixed(1)}%`);
    console.log(`    cross-chapter repeated n-grams (vs. prior window): ${(c.crossChapterNgrams.overallRepeatedRate * 100).toFixed(1)}%`);
    console.log(
      `    stock phrases: ${c.stockPhrases.total} total${
        c.stockPhrases.total > 0
          ? ' — ' +
            c.stockPhrases.hits
              .filter(h => h.count > 0)
              .map(h => `${h.label}=${h.count}`)
              .join(', ')
          : ''
      }`,
    );
    console.log(
      `    dialogue tags: ${c.dialogueTags.totalTags} (said/asked=${c.dialogueTags.saidAskedCount}, alt=${c.dialogueTags.alternativeCount}, alt-rate=${(c.dialogueTags.saidAlternativeRate * 100).toFixed(1)}%)`,
    );
    console.log(
      `    dialogue contraction rate: ${(c.contractionRate.rate * 100).toFixed(1)}% (contracted=${c.contractionRate.contracted}, expanded=${c.contractionRate.expanded})`,
    );
    console.log(`    ending hookType: ${c.hookType ?? '(none)'}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
