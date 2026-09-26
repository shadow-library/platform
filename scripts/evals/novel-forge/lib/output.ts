import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { run } from '../../../utils/index.ts';
import { EvalError } from './errors.ts';
import { type CostTier, type ModelCall } from './forge.types.ts';

export type TurnKind = 'chat_turn' | 'lookup_round' | 'organise' | 'plan' | 'write' | 'finalize_review' | 'finalize';

export interface TimingSample {
  suite: string;
  runLabel: string;
  kind: TurnKind;
  ms: number;
  ok: boolean;
  tier: CostTier | null;
  target: string;
  projectId?: string;
  runId?: string;
  jobId?: string;
  chapter?: number;
  attempts?: number;
  at: string;
}

export interface CallsRecord {
  suite: string;
  runLabel: string;
  kind: TurnKind;
  target: string;
  projectId: string;
  runId: string;
  graph: string;
  chapter?: number;
  durationMs: number | null;
  calls: ModelCall[];
  at: string;
}

export interface ChapterCostRecord {
  suite: string;
  runLabel: string;
  target: string;
  projectId: string;
  chapter: number;
  tier: CostTier | null;
  mode: string;
  calls: number;
  costUsd: number;
  at: string;
}

export const TIMINGS_FILE = 'timings.jsonl';
export const CALLS_FILE = 'calls.jsonl';
export const CHAPTERS_FILE = 'chapters.jsonl';

const REPO_ROOT = path.resolve(import.meta.dir, '../../../..');

export function defaultOutDir(): string {
  return path.join(os.tmpdir(), 'novel-forge-evals');
}

/** Eval outputs may quote model prose and, for (c2), the owner's notes: they may land outside the repo or under a git-ignored path, never anywhere git would stage. */
export function assertSafeOutDir(dir: string): string {
  const resolved = path.resolve(dir);
  const relative = path.relative(REPO_ROOT, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) return resolved;
  const ignored = run('git', ['check-ignore', '-q', resolved], { cwd: REPO_ROOT, stream: false });
  if (ignored.status !== 0)
    throw new EvalError(`Output dir ${resolved} is inside the repository and not git-ignored — choose a path outside the repo or under an ignored directory`);
  return resolved;
}

/** One suite invocation's output: `<out>/<suite>/<stamp>/{result.json,summary.md}`, plus the shared samples every suite appends to for (e). */
export class OutputSink {
  readonly suiteDir: string;

  constructor(
    readonly outDir: string,
    readonly suite: string,
  ) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.suiteDir = path.join(outDir, suite, stamp);
    mkdirSync(this.suiteDir, { recursive: true });
    mkdirSync(path.join(outDir, 'samples'), { recursive: true });
  }

  writeResult(result: unknown, markdown: string): { json: string; md: string } {
    const json = path.join(this.suiteDir, 'result.json');
    const md = path.join(this.suiteDir, 'summary.md');
    writeFileSync(json, `${JSON.stringify(result, null, 2)}\n`);
    writeFileSync(md, markdown.endsWith('\n') ? markdown : `${markdown}\n`);
    return { json, md };
  }

  writeArtifact(name: string, content: string): string {
    const file = path.join(this.suiteDir, name);
    mkdirSync(path.dirname(file), { recursive: true });
    writeFileSync(file, content);
    return file;
  }

  recordTiming(sample: Omit<TimingSample, 'suite' | 'at'>): void {
    this.append(TIMINGS_FILE, { suite: this.suite, at: new Date().toISOString(), ...sample });
  }

  recordCalls(record: Omit<CallsRecord, 'suite' | 'at'>): void {
    this.append(CALLS_FILE, { suite: this.suite, at: new Date().toISOString(), ...record });
  }

  recordChapterCost(record: Omit<ChapterCostRecord, 'suite' | 'at'>): void {
    this.append(CHAPTERS_FILE, { suite: this.suite, at: new Date().toISOString(), ...record });
  }

  private append(file: string, value: unknown): void {
    appendFileSync(path.join(this.outDir, 'samples', file), `${JSON.stringify(value)}\n`);
  }
}
