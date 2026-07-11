/**
 * Importing npm packages
 */
import { Spinner } from '@shadow-library/ui';
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

/**
 * Importing user defined modules
 */
import { PaneError, PaneLoader, StatusChip, type ChipIntent } from '@/components/nf';
import { type RunModelCallResponse, type WorkflowRunDetailResponse, useListRunsQuery, useRunQuery } from '@/lib/apis';
import { relativeTime } from '@/lib/format';

import styles from './runs.module.css';

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
  return <div className={`nf-eyebrow ${styles.sectionLabel}`}>{children}</div>;
}

interface RunListItemProps {
  run: WorkflowRunDetailResponse;
  selected: boolean;
  onSelect: () => void;
}

function RunListItem({ run, selected, onSelect }: RunListItemProps): React.JSX.Element {
  return (
    <button onClick={onSelect} className="nf-selrow nf-selrow-stack" data-active={selected}>
      <div className={styles.rowTopRow}>
        <StatusChip intent={runIntent(run.status)} dot={run.status !== 'running'}>
          {run.status === 'running' && <Spinner size="sm" />}
          {run.status}
        </StatusChip>
        <div className={styles.spacer} />
        <span className={styles.rowTime}>{relativeTime(run.startedAt)}</span>
      </div>
      <div className={styles.rowTitle}>
        {run.graph} · {run.target}
      </div>
      <div className={styles.rowMeta}>{duration(run.startedAt, run.endedAt)}</div>
    </button>
  );
}

interface ModelCallsTableProps {
  calls: RunModelCallResponse[];
}

function ModelCallsTable({ calls }: ModelCallsTableProps): React.JSX.Element {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Model</th>
            <th>Role</th>
            <th>Status</th>
            <th>In</th>
            <th>Out</th>
            <th>Latency</th>
            <th>Cost</th>
          </tr>
        </thead>
        <tbody>
          {calls.map(c => (
            <tr key={c.id}>
              <td className={styles.cellMono}>
                {c.provider}/{c.model}
                {c.attempt > 0 && <span className={styles.retry}> · retry {c.attempt}</span>}
              </td>
              <td>{c.role}</td>
              <td>
                <StatusChip intent={c.status === 'ok' ? 'success' : c.status === 'repaired' ? 'warning' : 'danger'}>{c.status}</StatusChip>
              </td>
              <td>{tokens(c.inputTokens)}</td>
              <td>{tokens(c.outputTokens)}</td>
              <td>{c.latencyMs != null ? `${(c.latencyMs / 1000).toFixed(1)}s` : '—'}</td>
              <td>{c.costUsd != null ? `$${Number(c.costUsd).toFixed(4)}` : '—'}</td>
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
      <div className={styles.detailHead}>
        <div className={styles.detailTitleRow}>
          <span className={styles.detailTitle}>
            {run.graph} · {run.target}
          </span>
          <StatusChip intent={runIntent(run.status)}>{run.status}</StatusChip>
        </div>
        <div className={styles.factRow}>
          {facts.map(f => (
            <div key={f.label}>
              <div className={styles.factLabel}>{f.label}</div>
              <div className={styles.factValue}>{f.value}</div>
            </div>
          ))}
        </div>
      </div>
      <div className={`nf-scroll ${styles.detailScroll}`}>
        <div className={styles.detailInner}>
          {run.outcome && (
            <>
              <SectionLabel>Outcome</SectionLabel>
              <p className={styles.para}>{run.outcome}</p>
            </>
          )}
          {run.error && (
            <>
              <SectionLabel>Run error</SectionLabel>
              <div className={styles.errorBox}>
                <pre className={styles.pre}>{JSON.stringify(run.error, null, 2)}</pre>
              </div>
            </>
          )}
          {trace.length > 0 && (
            <>
              <SectionLabel>Steps</SectionLabel>
              <div className={styles.steps}>
                {trace.map((node, i) => (
                  <span key={`${node}-${i}`} className={styles.step}>
                    {i > 0 && <span className={styles.arrow}>→</span>}
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
              <div className={styles.inputBox}>
                <pre className={`${styles.pre} ${styles.preWell}`}>{JSON.stringify(run.input, null, 2)}</pre>
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
    <div className="nf-splitpane">
      <div className="nf-rail">
        <div className={`nf-railhead ${styles.railHeadFlex}`}>
          <span className={styles.railTitle}>Workflow Runs</span>
          <div className={styles.spacer} />
          <span className={styles.railCount}>latest {runs.length}</span>
        </div>
        <div className="nf-scroll nf-raillist">
          {runsQuery.isLoading && <PaneLoader />}
          {runsQuery.error && <PaneError error={runsQuery.error} />}
          {!runsQuery.isLoading && runs.length === 0 && <div className="nf-emptynote">No runs yet.</div>}
          {runs.map(run => (
            <RunListItem key={run.id} run={run} selected={run.id === selectedId} onSelect={() => setSelectedId(run.id)} />
          ))}
        </div>
      </div>
      <div className="nf-detail">
        {selectedId ? <RunDetail novelId={novelId} runId={selectedId} /> : <div className="nf-pane-empty">Select a run to see its detail.</div>}
      </div>
    </div>
  );
}
