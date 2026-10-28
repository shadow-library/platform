import path from 'node:path';

import { log } from '../../utils/index.ts';
import {
  type Author,
  type CapturedRun,
  type ChapterRecord,
  cleanup,
  type ContentMode,
  type CostTier,
  type Draft,
  errorMessage,
  EvalError,
  type GenreArchetype,
  type GenreFixture,
  genreFixtureIds,
  genreStory,
  intFlag,
  knowledgeContractFor,
  type KnowledgeContractInput,
  lastWords,
  loadGenreFixture,
  lockedSecrets,
  milestoneChapter,
  type ModelCall,
  openFacts,
  patternHits,
  proseOnly,
  proseWordCount,
  runSuite,
  seededCanonDigest,
  seedStoryBible,
  type StatValue,
  stringFlag,
  type SuiteContext,
  type SuiteVerdict,
  table,
  wordCount,
  type WordTarget,
  writeStoryChapter,
} from './lib/index.ts';

const KNOWN_FACTS_HEADING = '## KNOWN FACTS';

type CanonSource = 'writer_snapshot' | 'seeded';

interface CaseSecret {
  factKey: string;
  text: string;
  terms: string[];
  revealPatterns: string[];
  allowedClues: string[];
  writerNote: string;
  unlockChapter: number | null;
}

interface CaseModelCall extends ModelCall {
  kind: CapturedRun['kind'];
  graph: string;
}

interface GenreCase {
  id: string;
  suite: 'g-genre-craft';
  fixture: string;
  archetype: GenreArchetype;
  title: string;
  run: number;
  chapter: number;
  contentMode: ContentMode;
  tier: CostTier | null;
  target: string;
  dryRun: boolean;
  premise: string;
  writingInstructions: string;
  cast: { entityKey: string; name: string }[];
  brief: { title: string; pov: string; povName: string; plan: string; claimedMilestones: string[]; knowledgeContract: KnowledgeContractInput };
  canon: { source: CanonSource; walledOff: boolean; truncated: boolean; digest: string; seeded: string; knownFactsInWriterContext: boolean | null; note?: string };
  previous: { chapter: number; title: string; summary: string | null; ending: string } | null;
  hiddenSecrets: CaseSecret[];
  secretPatternHits: { factKey: string; match: string }[];
  draftTitle: string;
  prose: string;
  wordCount: { prose: number; total: number; target: WordTarget };
  system: { character: string; startingStats: StatValue[]; startingSkills: StatValue[]; trackedStats: string[] } | null;
  generation: {
    isolated: boolean;
    judge: string | null;
    judgeNote: string | null;
    finalized: boolean;
    reviewFlags: string[];
    modelRoute: { provider: string; model: string } | null;
    calls: CaseModelCall[];
    costUsd: number | null;
    callCount: number | null;
  };
}

interface FixtureOutcome {
  fixture: string;
  archetype: GenreArchetype;
  run: number;
  requested: number;
  cases: number;
  failure?: { chapter: number | null; error: string };
}

const USAGE = `Usage: bun scripts/evals/novel-forge/g-genre-craft.ts [flags]

(g) Genre craft, step 1 of 2: for each original genre fixture (fixtures/genres/*.json) creates a project with its premise, writing
instructions and word target, seeds the cast, open world facts and milestone-gated secrets, then puts each brief and writes,
approves and finalizes chapters 1..N in order through the real generate job. Writes one judge case per chapter to cases.jsonl, plus
generation.json and the chapters themselves. Step 2 judges the cases with DeepEval (scripts/evals/novel-forge/deepeval, see the
README). Default --runs 1.

  --fixtures <a,b>         fixtures to run (default: all — ${genreFixtureIds().join(', ')})
  --chapters <n>           chapters per fixture (default 3, at most the fixture's briefs)
  --content-mode <mode>    standard (default) | unrestricted: the project's and every chapter's content mode`;

const DEFAULT_CHAPTERS = 3;
const CANON_DIGEST_LIMIT = 60_000;
const ENDING_WORDS = 150;
const CONTENT_MODES: readonly ContentMode[] = ['standard', 'unrestricted'];

function fixturesFlag(context: SuiteContext): GenreFixture[] {
  const raw = stringFlag(context.flags, 'fixtures');
  const ids = raw
    ? raw
        .split(',')
        .map(id => id.trim())
        .filter(Boolean)
    : genreFixtureIds();
  if (ids.length === 0) throw new EvalError('No genre fixtures to run');
  return [...new Set(ids)].map(loadGenreFixture);
}

function contentModeFlag(context: SuiteContext): ContentMode {
  const raw = stringFlag(context.flags, 'content-mode') ?? 'standard';
  if (!(CONTENT_MODES as readonly string[]).includes(raw)) throw new EvalError(`--content-mode must be one of ${CONTENT_MODES.join(', ')}`);
  return raw as ContentMode;
}

async function seedGenreProject(context: SuiteContext, fixture: GenreFixture, contentMode: ContentMode, label: string): Promise<string> {
  const { projectId } = await context.api.createNovel(`[eval ${label}] ${fixture.title}`, fixture.premise, contentMode);
  try {
    await seedStoryBible(context, projectId, genreStory(fixture));
    for (const fact of openFacts(fixture)) await context.api.putFact(projectId, fact.factKey, { text: fact.text, subjects: fact.subjects, revealChapter: 1 });
    await context.api.updateProject(projectId, {
      ...(context.tier ? { costTier: context.tier } : {}),
      brief: fixture.premise,
      instructions: fixture.writingInstructions,
      wordTarget: fixture.wordTarget,
      protagonistKey: fixture.protagonist,
    });
    return projectId;
  } catch (error) {
    await cleanup(context, projectId);
    throw error;
  }
}

/** The writer's own view of the attempt that produced the kept prose; an isolated chapter's view is walled off, so its digest falls back to what was seeded. */
async function writerCanon(
  context: SuiteContext,
  projectId: string,
  draft: Draft,
  seeded: string,
): Promise<GenreCase['canon'] & { modelRoute: GenreCase['generation']['modelRoute'] }> {
  const fallback = (walledOff: boolean, note: string): GenreCase['canon'] & { modelRoute: null } => ({
    source: 'seeded',
    walledOff,
    truncated: false,
    digest: seeded,
    seeded,
    knownFactsInWriterContext: null,
    note,
    modelRoute: null,
  });
  try {
    const summaries = await context.api.listWriterSnapshots(projectId, draft.chapter);
    const current = summaries.filter(summary => summary.draftRevision === draft.revision);
    const latest = [...(current.length > 0 ? current : summaries)].sort((a, b) => a.draftRevision - b.draftRevision || a.attempt - b.attempt).at(-1);
    if (!latest) return fallback(false, 'no writer snapshot was stored');
    if (latest.isolated || draft.isolated) return fallback(true, 'the writer snapshot of an isolated chapter is walled off');
    const snapshot = await context.api.getWriterSnapshot(projectId, draft.chapter, latest.id);
    if (snapshot.isolated) return fallback(true, 'the writer snapshot of an isolated chapter is walled off');
    const full = snapshot.messages
      .filter(message => message.role !== 'system')
      .map(message => message.content)
      .join('\n\n');
    if (!full.trim()) return fallback(false, 'the writer snapshot held no context messages');
    const knownFactsInWriterContext = snapshot.messages.some(message => message.content.includes(KNOWN_FACTS_HEADING));
    const truncated = full.length > CANON_DIGEST_LIMIT;
    return {
      source: 'writer_snapshot',
      walledOff: false,
      truncated,
      digest: truncated ? `${full.slice(0, CANON_DIGEST_LIMIT)}\n\n[… truncated at ${CANON_DIGEST_LIMIT} characters]` : full,
      seeded,
      knownFactsInWriterContext,
      modelRoute: latest.modelRoute ?? null,
    };
  } catch (error) {
    return fallback(false, `the writer snapshot could not be read: ${errorMessage(error)}`);
  }
}

async function chapterCost(context: SuiteContext, projectId: string, chapter: number): Promise<{ costUsd: number | null; callCount: number | null }> {
  try {
    const cost = await context.api.chapterCost(projectId, chapter);
    return { costUsd: cost.totals.costUsd, callCount: cost.totals.calls };
  } catch (error) {
    log.warn(`could not read the cost of chapter ${chapter}: ${errorMessage(error)}`);
    return { costUsd: null, callCount: null };
  }
}

function caseSecrets(fixture: GenreFixture, chapter: number): CaseSecret[] {
  const story = genreStory(fixture);
  return lockedSecrets(fixture, chapter).map(secret => {
    const unlock = milestoneChapter(story, secret);
    return {
      factKey: secret.factKey,
      text: secret.text,
      terms: secret.terms,
      revealPatterns: secret.revealPatterns,
      allowedClues: secret.allowedClues,
      writerNote: secret.writerNote,
      unlockChapter: Number.isFinite(unlock) ? unlock : null,
    };
  });
}

interface CaseInput {
  context: SuiteContext;
  author: Author;
  fixture: GenreFixture;
  run: number;
  contentMode: ContentMode;
  projectId: string;
  record: ChapterRecord & { draft: Draft };
  previous: Draft | null;
}

async function buildCase({ context, author, fixture, run, contentMode, projectId, record, previous }: CaseInput): Promise<GenreCase> {
  const plan = fixture.chapters[record.chapter - 1];
  if (!plan) throw new EvalError(`${fixture.id} has no brief for chapter ${record.chapter}`);
  const { draft } = record;
  const seeded = seededCanonDigest(fixture, record.chapter);
  const { modelRoute, ...canon } = await writerCanon(context, projectId, draft, seeded);
  const hidden = caseSecrets(fixture, record.chapter);
  const calls = author.captured
    .filter(captured => captured.chapter === record.chapter)
    .flatMap(captured => captured.usage.calls.map(call => ({ ...call, kind: captured.kind, graph: captured.usage.graph })));
  const name = (key: string): string => fixture.entities.find(entity => entity.entityKey === key)?.name ?? key;
  return {
    id: `${fixture.id}-r${run}-ch${record.chapter}`,
    suite: 'g-genre-craft',
    fixture: fixture.id,
    archetype: fixture.archetype,
    title: fixture.title,
    run,
    chapter: record.chapter,
    contentMode,
    tier: context.tier,
    target: context.api.target,
    dryRun: context.dryRun,
    premise: fixture.premise,
    writingInstructions: fixture.writingInstructions,
    cast: fixture.entities.map(entity => ({ entityKey: entity.entityKey, name: entity.name })),
    brief: {
      title: plan.title,
      pov: plan.pov,
      povName: name(plan.pov),
      plan: plan.plan,
      claimedMilestones: plan.claimedMilestones ?? [],
      knowledgeContract: knowledgeContractFor(genreStory(fixture), plan),
    },
    canon,
    previous: previous
      ? {
          chapter: previous.chapter,
          title: previous.title ?? `Chapter ${previous.chapter}`,
          summary: previous.summary ?? null,
          ending: lastWords(proseOnly(previous.body), ENDING_WORDS),
        }
      : null,
    hiddenSecrets: hidden,
    secretPatternHits: hidden.flatMap(secret => patternHits(draft.body, secret.revealPatterns).map(match => ({ factKey: secret.factKey, match }))),
    draftTitle: draft.title ?? plan.title,
    prose: draft.body,
    wordCount: { prose: proseWordCount(draft.body), total: wordCount(draft.body), target: fixture.wordTarget },
    system: fixture.system,
    generation: {
      isolated: draft.isolated,
      judge: draft.judge ?? null,
      judgeNote: draft.judgeNote ?? null,
      finalized: record.finalize?.finalized ?? false,
      reviewFlags: record.finalize?.flags ?? [],
      modelRoute,
      calls,
      ...(await chapterCost(context, projectId, record.chapter)),
    },
  };
}

async function generateFixture(context: SuiteContext, fixture: GenreFixture, run: number, chapters: number, contentMode: ContentMode, cases: GenreCase[]): Promise<FixtureOutcome> {
  const outcome: FixtureOutcome = { fixture: fixture.id, archetype: fixture.archetype, run, requested: chapters, cases: 0 };
  const author = context.author(`g-${fixture.id}-run-${run}`);
  let projectId: string;
  try {
    projectId = await seedGenreProject(context, fixture, contentMode, `g ${fixture.id} run ${run}`);
  } catch (error) {
    return { ...outcome, failure: { chapter: null, error: `seeding failed: ${errorMessage(error)}` } };
  }
  try {
    let previous: Draft | null = null;
    for (const chapter of fixture.chapters.slice(0, chapters)) {
      const record = await writeStoryChapter(author, projectId, chapter, { story: genreStory(fixture), mode: contentMode });
      const { draft } = record;
      if (record.error || !draft?.body.trim()) return { ...outcome, failure: { chapter: chapter.n, error: record.error ?? 'the chapter was written empty' } };
      if (!record.finalize?.finalized)
        log.warn(`${fixture.id} run ${run}: chapter ${chapter.n} was approved but not finalized; the next chapter continues from the approved draft`);
      context.sink.writeArtifact(`chapters/${fixture.id}-run-${run}-ch-${chapter.n}.md`, `# ${draft.title ?? chapter.title}\n\n${draft.body}\n`);
      cases.push(await buildCase({ context, author, fixture, run, contentMode, projectId, record: { ...record, draft }, previous }));
      outcome.cases += 1;
      previous = draft;
    }
    return outcome;
  } catch (error) {
    return { ...outcome, failure: { chapter: outcome.cases + 1, error: errorMessage(error) } };
  } finally {
    await cleanup(context, projectId);
  }
}

function summary(outcomes: readonly FixtureOutcome[], cases: readonly GenreCase[], casesFile: string): string {
  return [
    '# (g) Genre craft — generation',
    '',
    `Cases written: **${cases.length}** to \`${path.basename(casesFile)}\`. Judge them with DeepEval (README, "DeepEval"); its \`result.json\` and \`summary.md\` land beside this file.`,
    '',
    table(
      ['fixture', 'archetype', 'run', 'chapters', 'failure'],
      outcomes.map(outcome => [
        outcome.fixture,
        outcome.archetype,
        outcome.run,
        `${outcome.cases}/${outcome.requested}`,
        outcome.failure ? `${outcome.failure.chapter === null ? 'setup' : `chapter ${outcome.failure.chapter}`}: ${outcome.failure.error}` : '',
      ]),
    ),
    '',
    '## Chapters',
    '',
    table(
      ['case', 'prose words', 'target', 'canon source', 'judge', 'finalized', 'secret pattern hits', 'calls', 'cost'],
      cases.map(entry => [
        entry.id,
        entry.wordCount.prose,
        `${entry.wordCount.target.min}–${entry.wordCount.target.max}`,
        entry.canon.source + (entry.canon.walledOff ? ' (walled off)' : ''),
        entry.generation.judge ?? '—',
        entry.generation.finalized ? 'yes' : 'NO',
        entry.secretPatternHits.map(hit => `${hit.factKey}: "${hit.match}"`).join('; ') || '—',
        entry.generation.callCount ?? '—',
        entry.generation.costUsd === null ? '—' : `$${entry.generation.costUsd.toFixed(4)}`,
      ]),
    ),
  ].join('\n');
}

async function run(context: SuiteContext): Promise<SuiteVerdict> {
  const fixtures = fixturesFlag(context);
  const chapters = intFlag(context.flags, 'chapters', DEFAULT_CHAPTERS);
  const short = fixtures.find(fixture => fixture.chapters.length < chapters);
  if (short) throw new EvalError(`--chapters is at most ${short.chapters.length} for ${short.id}`);
  const contentMode = contentModeFlag(context);

  const cases: GenreCase[] = [];
  const outcomes: FixtureOutcome[] = [];
  for (const fixture of fixtures) {
    for (let run = 1; run <= context.runs; run += 1) {
      const outcome = await generateFixture(context, fixture, run, chapters, contentMode, cases);
      if (outcome.failure) log.error(`${fixture.id} run ${run}: ${outcome.failure.error}`);
      outcomes.push(outcome);
    }
  }

  const casesFile = context.sink.writeArtifact('cases.jsonl', cases.map(entry => JSON.stringify(entry)).join('\n') + (cases.length > 0 ? '\n' : ''));
  context.sink.writeArtifact(
    'generation.json',
    `${JSON.stringify(
      {
        suite: 'g-genre-craft',
        target: context.api.target,
        dryRun: context.dryRun,
        runs: context.runs,
        tier: context.tier,
        contentMode,
        chapters,
        fixtures: fixtures.map(fixture => ({ id: fixture.id, archetype: fixture.archetype })),
        outcomes,
        cases: cases.length,
      },
      null,
      2,
    )}\n`,
  );
  context.sink.writeArtifact('generation.md', `${summary(outcomes, cases, casesFile)}\n`);

  const failed = outcomes.filter(outcome => outcome.failure);
  if (cases.length === 0) throw new EvalError(`No chapter was generated, so there is nothing to judge — see ${context.sink.suiteDir}/generation.md`);
  if (failed.length > 0)
    throw new EvalError(
      `${failed.length} fixture run(s) stopped early; ${cases.length} case(s) were still written to ${casesFile} — see generation.md before judging a partial set`,
    );
  log.info(`next: cd scripts/evals/novel-forge/deepeval && uv run python run_eval.py --cases ${casesFile}`);
  return { passed: null, headline: `${cases.length} case(s) over ${fixtures.length} fixture(s) × ${context.runs} run(s), ready to judge` };
}

await runSuite({ name: 'g-genre-craft', usage: USAGE, defaultRuns: 1, run });
