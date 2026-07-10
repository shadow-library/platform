/**
 * Importing npm packages
 */
import { Spinner } from '@shadow-library/ui';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

/**
 * Importing user defined modules
 */
import { PaneError, PaneLoader, StatusChip, detailPaneStyle, railStyle, splitPaneStyle, type ChipIntent } from '@/components/nf';
import { type RunModelCallResponse, type WorkflowRunDetailResponse, useListRunsQuery, useRunQuery } from '@/lib/apis';
import { relativeTime } from '@/lib/format';

export const Route = createFileRoute('/novels/$novelId/runs')({
  component: RunsScreen,
});

const RUN_INTENT: Record<string, ChipIntent> = {
  running: 'info',
  completed: 'success',
  awaiting_review: 'warning',
  failed: 'danger',
  cancelled: 'neutral',
};

function runIntent(status: string): ChipIntent {
  return RUN_INTENT[status] ?? 'neutral';
}

interface RunFact {
  label: string;
  value: string;
}

function duration(startedAt: string, endedAt?: string | null): string {
  const start = new Date(startedAt).getTime();
  const end = endedAt ? new Date(endedAt).getTime() : Date.now();
  const secs = Math.max(0, Math.round((end - start) / 1000));
  if (secs < 60) return `${secs}s`;
  return `${Math.floor(secs / 60)}m ${secs % 60}s`;
}

function tokens(n?: number | null): string {
  return n == null ? '—' : n.toLocaleString();
}

interface SectionLabelProps {
  children: React.ReactNode;
}

function SectionLabel({ children }: SectionLabelProps): React.JSX.Element {
  return (
    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--sh-text-tertiary)', margin: '20px 0 8px' }}>{children}</div>
  );
}

interface RunListItemProps {
  run: WorkflowRunDetailResponse;
  selected: boolean;
  onSelect: () => void;
}

function RunListItem({ run, selected, onSelect }: RunListItemProps): React.JSX.Element {
  return (
    <button
      onClick={onSelect}
      className="nf-selrow"
      style={{
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 5,
        padding: 12,
        marginBottom: 4,
        background: selected ? 'var(--sh-accent-soft)' : undefined,
        boxShadow: selected ? 'inset 2px 0 0 var(--sh-accent)' : undefined,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <StatusChip intent={runIntent(run.status)} dot={run.status !== 'running'}>
          {run.status === 'running' && <Spinner size="sm" />}
          {run.status}
        </StatusChip>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 10, color: 'var(--sh-text-tertiary)' }}>{relativeTime(run.startedAt)}</span>
      </div>
      <div style={{ fontSize: 'var(--sh-text-body-sm)', fontWeight: 600, color: selected ? 'var(--sh-accent)' : 'var(--sh-text-primary)', textAlign: 'left' }}>
        {run.graph} · {run.target}
      </div>
      <div style={{ fontSize: 10, color: 'var(--sh-text-tertiary)', textAlign: 'left', fontVariantNumeric: 'tabular-nums' }}>{duration(run.startedAt, run.endedAt)}</div>
    </button>
  );
}

interface ModelCallsTableProps {
  calls: RunModelCallResponse[];
}

function ModelCallsTable({ calls }: ModelCallsTableProps): React.JSX.Element {
  const th: React.CSSProperties = {
    textAlign: 'left',
    padding: '7px 10px',
    fontSize: 10,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: 'var(--sh-text-tertiary)',
    borderBottom: '1px solid var(--sh-border-subtle)',
  };
  const td: React.CSSProperties = {
    padding: '7px 10px',
    fontSize: 12,
    color: 'var(--sh-text-secondary)',
    borderBottom: '1px solid var(--sh-border-subtle)',
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
  };
  return (
    <div style={{ border: '1px solid var(--sh-border-subtle)', borderRadius: 'var(--sh-radius-lg)', overflow: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--sh-surface-card)' }}>
        <thead>
          <tr>
            <th style={th}>Model</th>
            <th style={th}>Role</th>
            <th style={th}>Status</th>
            <th style={th}>In</th>
            <th style={th}>Out</th>
            <th style={th}>Latency</th>
            <th style={th}>Cost</th>
          </tr>
        </thead>
        <tbody>
          {calls.map(c => (
            <tr key={c.id}>
              <td style={{ ...td, fontFamily: 'var(--sh-font-mono)' }}>
                {c.provider}/{c.model}
                {c.attempt > 0 && <span style={{ color: 'var(--sh-warning-solid)' }}> · retry {c.attempt}</span>}
              </td>
              <td style={td}>{c.role}</td>
              <td style={td}>
                <StatusChip intent={c.status === 'ok' ? 'success' : c.status === 'repaired' ? 'warning' : 'danger'}>{c.status}</StatusChip>
              </td>
              <td style={td}>{tokens(c.inputTokens)}</td>
              <td style={td}>{tokens(c.outputTokens)}</td>
              <td style={td}>{c.latencyMs != null ? `${(c.latencyMs / 1000).toFixed(1)}s` : '—'}</td>
              <td style={td}>{c.costUsd != null ? `$${Number(c.costUsd).toFixed(4)}` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface RunDetailProps {
  novelId: string;
  runId: string;
}

function RunDetail({ novelId, runId }: RunDetailProps): React.JSX.Element {
  const runQuery = useRunQuery(novelId, runId);
  if (runQuery.isLoading) return <PaneLoader />;
  if (runQuery.error) return <PaneError error={runQuery.error} />;
  const run = runQuery.data;
  if (!run) return <PaneLoader />;

  const calls = run.modelCalls ?? [];
  const totalIn = calls.reduce((sum, c) => sum + (c.inputTokens ?? 0), 0);
  const totalOut = calls.reduce((sum, c) => sum + (c.outputTokens ?? 0), 0);
  const trace = run.nodeTrace ?? [];

  const facts: RunFact[] = [
    { label: 'Duration', value: duration(run.startedAt, run.endedAt) },
    { label: 'Started', value: new Date(run.startedAt).toLocaleString() },
    { label: 'Model calls', value: String(calls.length) },
    { label: 'Tokens in / out', value: `${totalIn.toLocaleString()} / ${totalOut.toLocaleString()}` },
    ...(run.jobId ? [{ label: 'Job', value: run.jobId }] : []),
  ];

  return (
    <>
      <div style={{ flexShrink: 0, padding: '16px 26px', borderBottom: '1px solid var(--sh-border-subtle)', background: 'var(--sh-surface-card)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 'var(--sh-text-h3)', fontWeight: 700 }}>
            {run.graph} · {run.target}
          </span>
          <StatusChip intent={runIntent(run.status)}>{run.status}</StatusChip>
        </div>
        <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
          {facts.map(f => (
            <div key={f.label}>
              <div style={{ fontSize: 10, color: 'var(--sh-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{f.label}</div>
              <div style={{ fontSize: 'var(--sh-text-body-sm)', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{f.value}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="nf-scroll" style={{ flex: 1, minHeight: 0, padding: '4px 26px 22px' }}>
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          {run.outcome && (
            <>
              <SectionLabel>Outcome</SectionLabel>
              <p style={{ margin: 0, fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-secondary)', lineHeight: 1.55 }}>{run.outcome}</p>
            </>
          )}
          {run.error && (
            <>
              <SectionLabel>Run error</SectionLabel>
              <div style={{ border: '1px solid var(--sh-danger-border)', background: 'var(--sh-danger-bg-subtle)', borderRadius: 'var(--sh-radius-lg)', padding: '14px 16px' }}>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontFamily: 'var(--sh-font-mono)', fontSize: 12, color: 'var(--sh-text-secondary)' }}>
                  {JSON.stringify(run.error, null, 2)}
                </pre>
              </div>
            </>
          )}
          {trace.length > 0 && (
            <>
              <SectionLabel>Steps</SectionLabel>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {trace.map((node, i) => (
                  <span key={`${node}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    {i > 0 && <span style={{ color: 'var(--sh-text-placeholder)', fontSize: 11 }}>→</span>}
                    <StatusChip intent="neutral">{node}</StatusChip>
                  </span>
                ))}
              </div>
            </>
          )}
          {calls.length > 0 && (
            <>
              <SectionLabel>Model calls</SectionLabel>
              <ModelCallsTable calls={calls} />
            </>
          )}
          {run.input && (
            <>
              <SectionLabel>Context input</SectionLabel>
              <div style={{ border: '1px solid var(--sh-border-subtle)', borderRadius: 'var(--sh-radius-lg)', overflow: 'hidden' }}>
                <pre
                  style={{
                    margin: 0,
                    padding: '14px 16px',
                    whiteSpace: 'pre-wrap',
                    fontFamily: 'var(--sh-font-mono)',
                    fontSize: 12,
                    color: 'var(--sh-text-secondary)',
                    background: 'var(--sh-surface-well)',
                  }}
                >
                  {JSON.stringify(run.input, null, 2)}
                </pre>
              </div>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function RunsScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  // Newest runs arrive first from the API; keep polling while any run is still executing.
  const runsQuery = useListRunsQuery(novelId, true, { refetchInterval: 4000 });
  const runs = runsQuery.data?.items ?? [];
  const [selectedId, setSelectedId] = useState<string | undefined>();

  useEffect(() => {
    if (!selectedId && runs.length > 0) setSelectedId(runs[0]!.id);
  }, [runs, selectedId]);

  return (
    <div style={splitPaneStyle}>
      <div style={railStyle}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--sh-border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 'var(--sh-text-body)', fontWeight: 700 }}>Workflow Runs</span>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 'var(--sh-text-caption)', color: 'var(--sh-text-tertiary)' }}>latest {runs.length}</span>
        </div>
        <div className="nf-scroll" style={{ flex: 1, padding: 8 }}>
          {runsQuery.isLoading && <PaneLoader />}
          {runsQuery.error && <PaneError error={runsQuery.error} />}
          {!runsQuery.isLoading && runs.length === 0 && <div style={{ padding: 16, fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-tertiary)' }}>No runs yet.</div>}
          {runs.map(run => (
            <RunListItem key={run.id} run={run} selected={run.id === selectedId} onSelect={() => setSelectedId(run.id)} />
          ))}
        </div>
      </div>
      <div style={detailPaneStyle}>
        {selectedId ? (
          <RunDetail novelId={novelId} runId={selectedId} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--sh-text-tertiary)' }}>Select a run to see its detail.</div>
        )}
      </div>
    </div>
  );
}
