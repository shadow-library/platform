import {
  type Author,
  type ChapterRecord,
  cleanup,
  type ContentMode,
  EvalError,
  type IsolationBridge,
  loadStory,
  normalise,
  runSuite,
  seedStoryProject,
  shingles,
  stringFlag,
  type SuiteContext,
  type SuiteVerdict,
  table,
  writeStoryChapter,
} from './lib/index.ts';

type ViolationKind = 'isolated_prose_in_standard_call' | 'bridge_missing' | 'bridge_not_approved' | 'route_mode_mismatch' | 'chapter_failed' | 'no_writer_snapshot';

interface Violation {
  run: number;
  chapter: number;
  kind: ViolationKind;
  detail: string;
}

interface BridgeCheck {
  run: number;
  isolated: number;
  reader: number;
  offset: 1 | 5;
  status: 'present' | 'missing' | 'not_applicable';
  summaryFound: boolean;
  positionsFound: number;
  positionsTotal: number;
}

const USAGE = `Usage: bun scripts/evals/novel-forge/c4-isolation.ts [flags]

(c4) Isolation: writes a sequence of standard (S) and isolated (I) chapters of the invented story, approving, reviewing and
finalizing each, then reads every standard chapter's writer snapshots (the exact messages the router sent, T24) and its
model-call routes. Gate: zero isolated raw prose in any standard call, standard chapters routed standard, and each
isolated chapter's approved bridge present in the standard chapters N+1 and N+5. Default --runs 1.

  --sequence <S|I…>     modes for chapters 1..n (default SISIISSSSS: S→I→S and S→I→I→S, so N+1 and N+5 exist for each I).
                        One sequence alone: --sequence SIS`;

const DEFAULT_SEQUENCE = 'SISIISSSSS';
const PROSE_SHINGLE = 8;
const SUMMARY_SHINGLE = 5;
const SUMMARY_SHARE = 0.5;

function parseSequence(raw: string): ContentMode[] {
  if (!/^[SI]+$/.test(raw)) throw new EvalError('--sequence takes only S and I, e.g. SISIISSSSS');
  return [...raw].map(letter => (letter === 'I' ? 'unrestricted' : 'standard'));
}

/** Eight-word runs of the isolated prose that no approved bridge text and no plan also contains: those may legitimately reach a standard call. */
function rawProseShingles(isolated: ChapterRecord, bridge: IsolationBridge | undefined, plans: string): Set<string> {
  const allowed = new Set([
    ...shingles(`${bridge?.summary ?? ''}\n${(bridge?.positions ?? []).flatMap(position => position.conditions).join('\n')}`, PROSE_SHINGLE),
    ...shingles(plans, PROSE_SHINGLE),
  ]);
  return new Set([...shingles(isolated.draft?.body ?? '', PROSE_SHINGLE)].filter(shingle => !allowed.has(shingle)));
}

function summaryPresent(summary: string, sent: string): boolean {
  if (normalise(sent).includes(normalise(summary))) return true;
  const own = shingles(summary, SUMMARY_SHINGLE);
  if (own.size === 0) return false;
  const theirs = shingles(sent, SUMMARY_SHINGLE);
  return [...own].filter(shingle => theirs.has(shingle)).length / own.size >= SUMMARY_SHARE;
}

async function sentTo(context: SuiteContext, projectId: string, chapter: number): Promise<string[]> {
  const snapshots = await context.api.listWriterSnapshots(projectId, chapter);
  const detailed = await Promise.all(snapshots.map(snapshot => context.api.getWriterSnapshot(projectId, chapter, snapshot.id)));
  return detailed.map(snapshot => snapshot.messages.map(message => message.content).join('\n'));
}

/** The router trace: every model call a chapter's write, review and finalize runs made must carry that chapter's mode. */
function routeViolations(author: Author, run: number, record: ChapterRecord): Violation[] {
  const calls = author.captured.filter(entry => entry.chapter === record.chapter).flatMap(entry => entry.usage.calls);
  const wrong = calls.filter(call => call.contentMode && call.contentMode !== record.mode);
  if (wrong.length === 0) return [];
  return [
    {
      run,
      chapter: record.chapter,
      kind: 'route_mode_mismatch',
      detail: `${wrong.length}/${calls.length} call(s) routed ${wrong[0]?.contentMode} (roles: ${[...new Set(wrong.map(call => call.role))].join(', ')})`,
    },
  ];
}

async function evaluate(
  context: SuiteContext,
  author: Author,
  run: number,
  projectId: string,
  records: readonly ChapterRecord[],
): Promise<{ violations: Violation[]; bridges: BridgeCheck[] }> {
  const violations: Violation[] = [
    ...records.filter(record => record.error).map(record => ({ run, chapter: record.chapter, kind: 'chapter_failed' as const, detail: record.error ?? '' })),
    ...records.flatMap(record => routeViolations(author, run, record)),
  ];
  const isolated = records.filter(record => record.mode === 'unrestricted' && record.draft);
  const bridges = new Map<number, IsolationBridge>();
  for (const record of isolated) {
    const bridge = await context.api.getBridge(projectId, record.chapter);
    bridges.set(record.chapter, bridge);
    if (!bridge.approved) violations.push({ run, chapter: record.chapter, kind: 'bridge_not_approved', detail: 'finalized without an approved bridge' });
  }
  const story = loadStory();
  const plans = story.chapters.map(chapter => chapter.plan).join('\n');
  const sent = new Map<number, string>();
  for (const record of records.filter(entry => entry.mode === 'standard' && entry.draft)) {
    const messages = await sentTo(context, projectId, record.chapter);
    if (messages.length === 0) violations.push({ run, chapter: record.chapter, kind: 'no_writer_snapshot', detail: 'no writer snapshot recorded — cannot inspect what was sent' });
    const text = messages.join('\n');
    sent.set(record.chapter, text);
    const received = shingles(text, PROSE_SHINGLE);
    for (const source of isolated.filter(entry => entry.chapter < record.chapter)) {
      const leaked = [...rawProseShingles(source, bridges.get(source.chapter), plans)].filter(shingle => received.has(shingle));
      if (leaked.length > 0)
        violations.push({
          run,
          chapter: record.chapter,
          kind: 'isolated_prose_in_standard_call',
          detail: `${leaked.length} eight-word run(s) of chapter ${source.chapter}, e.g. "${leaked[0]}"`,
        });
    }
  }
  const checks: BridgeCheck[] = isolated.flatMap(source =>
    ([1, 5] as const).map((offset): BridgeCheck => {
      const reader = source.chapter + offset;
      const readerRecord = records.find(entry => entry.chapter === reader);
      const base = { run, isolated: source.chapter, reader, offset, summaryFound: false, positionsFound: 0, positionsTotal: 0 };
      if (!readerRecord || readerRecord.mode !== 'standard' || !sent.has(reader)) return { ...base, status: 'not_applicable' };
      const bridge = bridges.get(source.chapter);
      const text = sent.get(reader) ?? '';
      const conditions = (bridge?.positions ?? []).flatMap(position => position.conditions);
      const positionsFound = conditions.filter(condition => normalise(text).includes(normalise(condition))).length;
      const summaryFound = bridge?.summary ? summaryPresent(bridge.summary, text) : false;
      return { ...base, status: summaryFound || positionsFound > 0 ? 'present' : 'missing', summaryFound, positionsFound, positionsTotal: conditions.length };
    }),
  );
  for (const check of checks.filter(entry => entry.status === 'missing'))
    violations.push({
      run,
      chapter: check.reader,
      kind: 'bridge_missing',
      detail: `chapter ${check.isolated}'s approved bridge is absent from chapter ${check.reader} (N+${check.offset})`,
    });
  return { violations, bridges: checks };
}

function summary(
  sequence: string,
  violations: readonly Violation[],
  bridges: readonly BridgeCheck[],
  records: readonly (ChapterRecord & { run: number })[],
  passed: boolean,
): string {
  return [
    '# (c4) Isolation',
    '',
    `Sequence ${sequence}. Gate: zero isolated raw prose in standard calls (writer snapshots), standard chapters routed standard, approved bridge present in N+1 and N+5. **${passed ? 'PASS' : 'FAIL'}** — ${violations.length} violation(s).`,
    '',
    '"Raw prose" is any eight-word run of an isolated chapter that neither its approved bridge nor any plan also contains.',
    '',
    '## Chapters',
    '',
    table(
      ['run', 'chapter', 'mode', 'isolated flag', 'status', 'error'],
      records.map(record => [record.run, record.chapter, record.mode, record.draft ? String(record.draft.isolated) : '—', record.draft?.status ?? '—', record.error ?? '']),
    ),
    '',
    '## Bridge presence',
    '',
    table(
      ['run', 'isolated chapter', 'reader', 'offset', 'status', 'summary found', 'positions found'],
      bridges.map(check => [
        check.run,
        check.isolated,
        check.reader,
        `N+${check.offset}`,
        check.status,
        check.summaryFound ? 'yes' : 'no',
        `${check.positionsFound}/${check.positionsTotal}`,
      ]),
    ),
    '',
    '## Violations',
    '',
    violations.length === 0
      ? 'None.'
      : table(
          ['run', 'chapter', 'kind', 'detail'],
          violations.map(v => [v.run, v.chapter, v.kind, v.detail]),
        ),
  ].join('\n');
}

async function run(context: SuiteContext): Promise<SuiteVerdict> {
  const story = loadStory();
  const sequence = stringFlag(context.flags, 'sequence') ?? DEFAULT_SEQUENCE;
  const modes = parseSequence(sequence);
  if (modes.length > story.chapters.length) throw new EvalError(`--sequence is at most ${story.chapters.length} chapters`);
  const violations: Violation[] = [];
  const bridges: BridgeCheck[] = [];
  const records: (ChapterRecord & { run: number })[] = [];
  for (let run = 1; run <= context.runs; run += 1) {
    const author = context.author(`c4-run-${run}`);
    const { projectId } = await seedStoryProject(context, story, `c4 run ${run}`);
    try {
      const written: ChapterRecord[] = [];
      for (const [index, mode] of modes.entries()) {
        const chapter = story.chapters[index];
        if (!chapter) break;
        const record = await writeStoryChapter(author, projectId, chapter, { mode });
        written.push(record);
        if (record.draft && record.draft.isolated !== (mode === 'unrestricted'))
          violations.push({ run, chapter: record.chapter, kind: 'route_mode_mismatch', detail: `planned ${mode} but the draft's isolated flag is ${record.draft.isolated}` });
        if (record.error) break;
      }
      records.push(...written.map(record => ({ ...record, run })));
      const evaluated = await evaluate(context, author, run, projectId, written);
      violations.push(...evaluated.violations);
      bridges.push(...evaluated.bridges);
    } finally {
      await cleanup(context, projectId);
    }
  }
  const passed = violations.length === 0;
  context.sink.writeResult(
    {
      suite: 'c4-isolation',
      target: context.api.target,
      dryRun: context.dryRun,
      runs: context.runs,
      tier: context.tier,
      sequence,
      passed,
      violations,
      bridges,
      chapters: records.map(({ draft, ...rest }) => ({ ...rest, isolated: draft?.isolated, status: draft?.status })),
    },
    summary(sequence, violations, bridges, records, passed),
  );
  return {
    passed,
    headline: `${violations.length} violation(s) over ${records.length} chapter(s), ${bridges.filter(check => check.status === 'present').length} bridge check(s) present`,
  };
}

await runSuite({ name: 'c4-isolation', usage: USAGE, defaultRuns: 1, run });
