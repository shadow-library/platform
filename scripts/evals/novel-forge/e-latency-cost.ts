import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { log } from '../../utils/index.ts';
import {
  CALLS_FILE,
  type CallsRecord,
  type ChapterCostRecord,
  CHAPTERS_FILE,
  cleanup,
  COST_TIERS,
  type CostTier,
  distribution,
  type Distribution,
  EvalError,
  formatMs,
  formatRate,
  formatUsd,
  groupBy,
  loadStory,
  type Quota,
  runSuite,
  stringFlag,
  type SuiteContext,
  type SuiteVerdict,
  table,
  TIMINGS_FILE,
  type TimingSample,
  type TurnKind,
} from './lib/index.ts';

interface Target {
  kind: TurnKind;
  stat: 'p50' | 'p95';
  limitMs: number;
}

interface TargetResult extends Target {
  n: number;
  valueMs: number | null;
  status: 'met' | 'missed' | 'no data';
}

/** Only these gateway fields are ever read; prompt and answer carry end users' content and never leave the log store. */
interface GatewayLine {
  served_by?: string;
  model?: string;
  status?: string | number;
  ms: number;
  stream?: boolean;
  tools?: unknown;
  fallback?: unknown;
  error?: unknown;
  exit_code?: number;
}

const USAGE = `Usage: bun scripts/evals/novel-forge/e-latency-cost.ts [flags]

(e) Latency, quota and cost: aggregates the timing and model-call samples every other suite appends to <out>/samples, and
optionally takes a fresh sample itself. Reports p50/p95 per turn kind (chat turn, lookup round, organise, plan, write,
finalize review) overall and per cost tier, model calls per chapter, retries, and cost per tier. Targets — turn p50 <= 30 s,
plan p95 <= 120 s, organise p95 <= 300 s — are reported, never gating.

  --sample              take one live sample first: one chat turn (with a lookup) per tier on a fresh project
  --tiers <list>        tiers for --sample (default: ${COST_TIERS.join(',')})
  --samples <dir>       where to read samples (default: <out>/samples)
  --since <iso>         only samples at or after this time
  --gateway <file>      a JSONL export of the host gateway stream; only served_by, model, status, ms, stream, tools,
                        fallback, error and exit_code are read — prompt and answer are ignored and never written
  --include-fake        include dry-run samples in a live report (they are excluded by default)`;

const TARGETS: readonly Target[] = [
  { kind: 'chat_turn', stat: 'p50', limitMs: 30_000 },
  { kind: 'plan', stat: 'p95', limitMs: 120_000 },
  { kind: 'organise', stat: 'p95', limitMs: 300_000 },
];
const KINDS: readonly TurnKind[] = ['chat_turn', 'lookup_round', 'organise', 'plan', 'write', 'finalize_review', 'finalize'];
const SAMPLE_QUESTION = 'What do my notes say about Aldine, and what is still undecided about her?';
const GATEWAY_FIELDS = ['served_by', 'model', 'status', 'ms', 'stream', 'tools', 'fallback', 'error', 'exit_code'] as const;

function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf-8')
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line) as T);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Accepts a raw gateway line or a Loki export row wrapping it in `line`; everything but the allowed fields is dropped on read. */
function readGateway(file: string): GatewayLine[] {
  if (!existsSync(file)) throw new EvalError(`--gateway: ${file} does not exist`);
  return readFileSync(file, 'utf-8')
    .split('\n')
    .filter(line => line.trim())
    .flatMap(line => {
      try {
        const parsed: unknown = JSON.parse(line);
        const inner: unknown = isRecord(parsed) && typeof parsed['line'] === 'string' ? JSON.parse(parsed['line']) : parsed;
        if (!isRecord(inner) || typeof inner['ms'] !== 'number') return [];
        return [Object.fromEntries(GATEWAY_FIELDS.filter(field => field in inner).map(field => [field, inner[field]])) as unknown as GatewayLine];
      } catch {
        return [];
      }
    });
}

async function takeSample(context: SuiteContext, tiers: readonly CostTier[]): Promise<void> {
  const story = loadStory();
  for (const tier of tiers) {
    const author = context.author(`e-sample-${tier}`, tier);
    const { projectId, sessionId } = await context.api.createNovel(`[eval e sample ${tier}] ${story.title}`, story.notes);
    try {
      await context.api.updateProject(projectId, { costTier: tier });
      await author.turn(projectId, sessionId, SAMPLE_QUESTION, { justDiscussing: true });
    } finally {
      await cleanup(context, projectId);
    }
  }
}

function msOf(samples: readonly TimingSample[]): number[] {
  return samples.filter(sample => sample.ok).map(sample => sample.ms);
}

function targetResults(timings: readonly TimingSample[]): TargetResult[] {
  return TARGETS.map(target => {
    const stats = distribution(msOf(timings.filter(sample => sample.kind === target.kind)));
    const valueMs = stats[target.stat];
    return { ...target, n: stats.n, valueMs, status: valueMs === null ? 'no data' : valueMs <= target.limitMs ? 'met' : 'missed' };
  });
}

function latencyRows(timings: readonly TimingSample[]): (string | number)[][] {
  const tierOf = (sample: TimingSample): string => sample.tier ?? 'project default';
  return KINDS.flatMap(kind => {
    const ofKind = timings.filter(sample => sample.kind === kind);
    if (ofKind.length === 0) return [];
    const row = (label: string, samples: readonly TimingSample[]): (string | number)[] => {
      const stats: Distribution = distribution(msOf(samples));
      return [kind, label, stats.n, formatMs(stats.p50), formatMs(stats.p95), formatMs(stats.max), samples.filter(sample => !sample.ok).length];
    };
    return [row('all', ofKind), ...[...groupBy(ofKind, tierOf)].map(([tier, samples]) => row(tier, samples))];
  });
}

function costByTier(calls: readonly CallsRecord[]): { tier: string; calls: number; costUsd: number; chatTurnMeanUsd: number | null }[] {
  const flat = calls.flatMap(record => record.calls.map(call => ({ ...call, kind: record.kind, runId: record.runId })));
  return [...groupBy(flat, call => call.tier ?? 'unknown')].map(([tier, entries]) => {
    const turnRuns = groupBy(
      entries.filter(entry => entry.kind === 'chat_turn'),
      entry => entry.runId,
    );
    const turnCosts = [...turnRuns.values()].map(run => run.reduce((sum, entry) => sum + Number(entry.costUsd ?? 0), 0));
    return {
      tier,
      calls: entries.length,
      costUsd: entries.reduce((sum, entry) => sum + Number(entry.costUsd ?? 0), 0),
      chatTurnMeanUsd: turnCosts.length === 0 ? null : turnCosts.reduce((sum, cost) => sum + cost, 0) / turnCosts.length,
    };
  });
}

function summary(input: {
  timings: readonly TimingSample[];
  calls: readonly CallsRecord[];
  chapters: readonly ChapterCostRecord[];
  gateway: readonly GatewayLine[] | null;
  quota: Quota | null;
  targets: readonly TargetResult[];
}): string {
  const { timings, calls, chapters, gateway, quota, targets } = input;
  const flatCalls = calls.flatMap(record => record.calls.map(call => ({ ...call, kind: record.kind })));
  const retried = flatCalls.filter(call => call.attempt > 1);
  const retriedJobs = timings.filter(sample => (sample.attempts ?? 1) > 1);
  const perChapter = distribution(chapters.map(chapter => chapter.calls));
  const lines = [
    '# (e) Latency, quota and cost',
    '',
    `Samples: ${timings.length} timings, ${calls.length} runs with ${flatCalls.length} model calls, ${chapters.length} chapters. Suites: ${[...new Set(timings.map(t => t.suite))].join(', ') || '—'}. Targets are reported, never gating.`,
    '',
    "Wall-clock is measured at the client (POST to done for a turn; apply to terminal status for a job, polled every 2 s), so it includes the network and a job's queueing.",
    '',
    '## Targets',
    '',
    table(
      ['kind', 'statistic', 'target', 'n', 'value', 'status'],
      targets.map(target => [target.kind, target.stat, formatMs(target.limitMs), target.n, formatMs(target.valueMs), target.status === 'missed' ? 'MISSED' : target.status]),
    ),
    '',
    '## Latency per turn kind and tier',
    '',
    table(['kind', 'tier', 'n', 'p50', 'p95', 'max', 'failed'], latencyRows(timings)),
    '',
    '## Model calls per chapter (every action against the chapter, write through finalize)',
    '',
    perChapter.n === 0
      ? 'No chapters sampled.'
      : table(
          ['n chapters', 'p50 calls', 'p95 calls', 'max', 'mean cost per chapter'],
          [[perChapter.n, perChapter.p50 ?? '—', perChapter.p95 ?? '—', perChapter.max ?? '—', formatUsd(chapters.reduce((sum, c) => sum + c.costUsd, 0) / chapters.length)]],
        ),
    '',
    ...(chapters.length === 0
      ? []
      : [
          table(
            ['mode', 'chapters', 'mean calls', 'mean cost'],
            [...groupBy(chapters, chapter => chapter.mode)].map(([mode, rows]) => [
              mode,
              rows.length,
              (rows.reduce((s, r) => s + r.calls, 0) / rows.length).toFixed(1),
              formatUsd(rows.reduce((s, r) => s + r.costUsd, 0) / rows.length),
            ]),
          ),
          '',
        ]),
    '## Retries',
    '',
    `Model calls on a retry attempt (attempt > 1): ${formatRate(retried.length, flatCalls.length)}. Jobs that needed more than one attempt: ${formatRate(retriedJobs.length, timings.filter(t => t.attempts !== undefined).length)}.`,
    '',
    ...(retried.length === 0
      ? []
      : [
          table(
            ['kind', 'retried calls'],
            [...groupBy(retried, call => call.kind)].map(([kind, rows]) => [kind, rows.length]),
          ),
          '',
        ]),
    "## Cost per tier (from each call's recorded tier)",
    '',
    table(
      ['tier', 'calls', 'cost', 'mean cost per chat turn'],
      costByTier(calls).map(row => [row.tier, row.calls, formatUsd(row.costUsd), row.chatTurnMeanUsd === null ? '—' : formatUsd(row.chatTurnMeanUsd)]),
    ),
    '',
    '## Model latency (per call, as recorded by Forge)',
    '',
    table(
      ['model', 'calls', 'p50', 'p95'],
      [...groupBy(flatCalls, call => call.model)].map(([model, rows]) => {
        const stats = distribution(rows.flatMap(row => (typeof row.latencyMs === 'number' ? [row.latencyMs] : [])));
        return [model, rows.length, formatMs(stats.p50), formatMs(stats.p95)];
      }),
    ),
  ];
  if (gateway) {
    lines.push(
      '',
      '## Gateway (host AI CLI gateway export; only timing and status fields read)',
      '',
      table(
        ['served by', 'model', 'n', 'p50', 'p95', 'errors', 'fallbacks'],
        [...groupBy(gateway, line => `${line.served_by ?? '?'}\u0000${line.model ?? '?'}`)].map(([key, rows]) => {
          const [servedBy, model] = key.split('\u0000');
          const stats = distribution(rows.map(row => row.ms));
          const errors = rows.filter(row => row.error || (typeof row.exit_code === 'number' && row.exit_code !== 0)).length;
          const fallbacks = rows.filter(row => Boolean(row.fallback)).length;
          return [servedBy ?? '?', model ?? '?', stats.n, formatMs(stats.p50), formatMs(stats.p95), errors, fallbacks];
        }),
      ),
    );
  }
  if (quota) {
    lines.push(
      '',
      '## Quota (rolling window, now)',
      '',
      table(
        ['calls', 'max calls', 'cost', 'max cost', 'window'],
        [[quota.calls, quota.maxCalls || 'off', formatUsd(quota.costUsd), quota.maxCostUsd ? formatUsd(quota.maxCostUsd) : 'off', formatMs(quota.windowMs)]],
      ),
    );
  }
  return lines.join('\n');
}

async function run(context: SuiteContext): Promise<SuiteVerdict> {
  if (context.flags.has('sample')) {
    const tiers = (stringFlag(context.flags, 'tiers') ?? COST_TIERS.join(',')).split(',').map(tier => tier.trim()) as CostTier[];
    const unknown = tiers.filter(tier => !COST_TIERS.includes(tier));
    if (unknown.length > 0) throw new EvalError(`--tiers: unknown tier(s) ${unknown.join(', ')}`);
    await takeSample(context, tiers);
  }
  const dir = stringFlag(context.flags, 'samples') ?? path.join(context.sink.outDir, 'samples');
  const since = stringFlag(context.flags, 'since');
  const keep = <T extends { target: string; at: string }>(rows: readonly T[]): T[] =>
    rows.filter(row => {
      const fake = row.target.startsWith('fake://');
      if (context.dryRun ? !fake : fake && !context.flags.has('include-fake')) return false;
      return !since || row.at >= since;
    });
  const timings = keep(readJsonl<TimingSample>(path.join(dir, TIMINGS_FILE)));
  const calls = keep(readJsonl<CallsRecord>(path.join(dir, CALLS_FILE)));
  const chapters = keep(readJsonl<ChapterCostRecord>(path.join(dir, CHAPTERS_FILE)));
  const gatewayFile = stringFlag(context.flags, 'gateway');
  const gateway = gatewayFile ? readGateway(gatewayFile) : null;
  const quota = await context.api.quota().catch(() => null);
  if (timings.length === 0 && calls.length === 0 && !gateway) log.warn(`no samples in ${dir} — run a suite first or pass --sample`);
  const targets = targetResults(timings);
  context.sink.writeResult(
    {
      suite: 'e-latency-cost',
      target: context.api.target,
      dryRun: context.dryRun,
      samplesDir: dir,
      since: since ?? null,
      targets,
      costByTier: costByTier(calls),
      quota,
      counts: { timings: timings.length, runs: calls.length, chapters: chapters.length, gateway: gateway?.length ?? 0 },
    },
    summary({ timings, calls, chapters, gateway, quota, targets }),
  );
  const missed = targets.filter(target => target.status === 'missed').map(target => `${target.kind} ${target.stat}`);
  return { passed: null, headline: missed.length === 0 ? `no target missed (${targets.filter(t => t.status === 'no data').length} without data)` : `missed: ${missed.join(', ')}` };
}

await runSuite({ name: 'e-latency-cost', usage: USAGE, defaultRuns: 1, run });
