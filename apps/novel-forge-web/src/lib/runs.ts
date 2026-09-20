export interface RunIdentity {
  graph: string;
  target: string;
}

export interface RunTiming {
  startedAt: string;
  endedAt?: string | null;
}

export interface RunCallCost {
  inputTokens?: number | null;
  outputTokens?: number | null;
  costUsd?: string | null;
}

export interface RunTotals {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export type RunView<TRun, TError> =
  { kind: 'directory' } | { kind: 'missing' } | { kind: 'loading'; runId: string } | { kind: 'failed'; error: TError } | { kind: 'detail'; run: TRun };

export interface RunViewInput<TRun, TError extends { status: number }> {
  runId: string | undefined;
  run: TRun | undefined;
  isLoading: boolean;
  error: TError | null;
}

/**
 * The run endpoint answers 404 both for a run this project never had and for one the ownership middleware
 * hides, so a dead `?run=` link is a directory with a warning rather than an error pane. A run outside the
 * directory's twenty author-facing rows still resolves — the detail query, not the list, decides.
 */
export function resolveRunView<TRun, TError extends { status: number }>({ runId, run, isLoading, error }: RunViewInput<TRun, TError>): RunView<TRun, TError> {
  if (!runId) return { kind: 'directory' };
  if (error?.status === 404) return { kind: 'missing' };
  if (run !== undefined) return { kind: 'detail', run };
  if (error) return { kind: 'failed', error };
  return isLoading ? { kind: 'loading', runId } : { kind: 'directory' };
}

export function runTitle(run: RunIdentity): string {
  return `${run.graph} · ${run.target}`;
}

export function runDuration({ startedAt, endedAt }: RunTiming, now = Date.now()): string {
  const end = endedAt ? new Date(endedAt).getTime() : now;
  const secs = Math.max(0, Math.round((end - new Date(startedAt).getTime()) / 1000));
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

export function runIds(runs: readonly { id: string }[]): string[] {
  return runs.map(run => run.id);
}

export function runsBackLabel(total: number | undefined): string {
  return total === undefined ? 'Workflow Runs' : `All ${total.toLocaleString()} runs`;
}

export function runTotals(calls: readonly RunCallCost[]): RunTotals {
  return calls.reduce<RunTotals>(
    (totals, call) => ({
      inputTokens: totals.inputTokens + (call.inputTokens ?? 0),
      outputTokens: totals.outputTokens + (call.outputTokens ?? 0),
      costUsd: totals.costUsd + (call.costUsd != null ? Number(call.costUsd) : 0),
    }),
    { inputTokens: 0, outputTokens: 0, costUsd: 0 },
  );
}

export function formatTokens(value?: number | null): string {
  return value == null ? '—' : value.toLocaleString();
}

export function formatCost(value?: number | null): string {
  return value == null ? '—' : `$${value.toFixed(4)}`;
}

export function formatSeconds(ms?: number | null): string {
  return ms == null ? '—' : `${(ms / 1000).toFixed(1)}s`;
}

export function formatMillis(ms?: number | null): string {
  return ms == null ? '—' : `${ms}ms`;
}

export function sectionShare(tokens: number, total: number): string {
  return total > 0 ? `${Math.round((tokens / total) * 100)}%` : '—';
}
