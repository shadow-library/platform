/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Button, Dialog, Spinner } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { type ChipIntent, PaneError, PaneLoader, StatusChip } from '@/components/nf';
import {
  listRunsQueryOptions,
  type RunContextPackResponse,
  type RunModelCallResponse,
  type RunToolCallResponse,
  useListRunsQuery,
  useRunCallQuery,
  useRunContextQuery,
  useRunQuery,
  type WorkflowRunDetailResponse,
} from '@/lib/apis';
import { relativeTime } from '@/lib/format';

import styles from './runs.module.css';

export const Route = createFileRoute('/novels/$novelId/runs')({
  // The run list is the screen's primary data; the detail ladder (context, calls) is fetched on demand.
  loader: ({ context, params }) => context.queryClient.prefetchQuery(listRunsQueryOptions(params.novelId)),
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

/** One model call: the summary row, plus the raw model output fetched lazily when expanded. */
interface ModelCallRowProps {
  novelId: string;
  runId: string;
  call: RunModelCallResponse;
}

function ModelCallRow({ novelId, runId, call }: ModelCallRowProps): React.JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const detailQuery = useRunCallQuery(novelId, runId, call.id, expanded);

  return (
    <>
      <tr className={styles.callRow} onClick={() => setExpanded(e => !e)}>
        <td className={styles.cellMono}>
          {call.provider}/{call.model}
          {call.attempt > 0 && <span className={styles.retry}> · retry {call.attempt}</span>}
        </td>
        <td className={styles.cellMono}>
          {call.promptKey}@{call.promptVersion}
        </td>
        <td>{call.role}</td>
        <td>
          <StatusChip intent={call.status === 'ok' ? 'success' : call.status === 'repaired' ? 'warning' : 'danger'}>{call.status}</StatusChip>
        </td>
        <td>{tokens(call.inputTokens)}</td>
        <td>{tokens(call.outputTokens)}</td>
        <td>{call.latencyMs != null ? `${(call.latencyMs / 1000).toFixed(1)}s` : '—'}</td>
        <td>{call.costUsd != null ? `$${Number(call.costUsd).toFixed(4)}` : '—'}</td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={8} className={styles.callDetailCell}>
            {detailQuery.isLoading && <Spinner size="sm" />}
            {detailQuery.error && <PaneError error={detailQuery.error} />}
            {detailQuery.data?.error != null && (
              <>
                <div className={styles.callDetailLabel}>Call error</div>
                <pre className={styles.pre}>{JSON.stringify(detailQuery.data.error, null, 2)}</pre>
              </>
            )}
            {detailQuery.data && (
              <>
                <div className={styles.callDetailLabel}>Raw model output</div>
                <pre className={`${styles.pre} ${styles.preWell}`}>{detailQuery.data.rawOutput ?? '(not recorded)'}</pre>
              </>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

interface ModelCallsTableProps {
  novelId: string;
  runId: string;
  calls: RunModelCallResponse[];
}

function ModelCallsTable({ novelId, runId, calls }: ModelCallsTableProps): React.JSX.Element {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Model</th>
            <th>Prompt</th>
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
            <ModelCallRow key={c.id} novelId={novelId} runId={runId} call={c} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface ToolCallsTableProps {
  calls: RunToolCallResponse[];
}

function ToolCallsTable({ calls }: ToolCallsTableProps): React.JSX.Element {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Tool</th>
            <th>Node</th>
            <th>Arguments</th>
            <th>Status</th>
            <th>Latency</th>
          </tr>
        </thead>
        <tbody>
          {calls.map(c => (
            <tr key={c.id}>
              <td className={styles.cellMono}>{c.tool}</td>
              <td>{c.node ?? '—'}</td>
              <td className={styles.cellMono}>{c.args ? JSON.stringify(c.args) : '—'}</td>
              <td>
                <StatusChip intent={c.status === 'ok' ? 'success' : 'danger'}>{c.status}</StatusChip>
              </td>
              <td>{c.latencyMs != null ? `${c.latencyMs}ms` : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Where the run's input tokens actually come from: the assembled context pack, section by section.
 * The chain input below is just the trigger — this is the prompt.
 */
interface PromptAnatomyProps {
  novelId: string;
  runId: string;
  pack: RunContextPackResponse;
}

function PromptAnatomy({ novelId, runId, pack }: PromptAnatomyProps): React.JSX.Element {
  const [contextOpen, setContextOpen] = useState(false);
  const contextQuery = useRunContextQuery(novelId, runId, contextOpen);
  const sectionTotal = pack.sections.reduce((sum, s) => sum + s.tokens, 0);

  return (
    <>
      <div className={styles.anatomyHead}>
        <StatusChip intent="info">{pack.purpose}</StatusChip>
        <span className={styles.anatomySummary}>
          {tokens(pack.usedTokens ?? sectionTotal)} of {tokens(pack.budgetTokens)} budget tokens
        </span>
        <div className={styles.spacer} />
        <Button size="sm" variant="ghost" onClick={() => setContextOpen(true)}>
          View full context
        </Button>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Section</th>
              <th>Segment</th>
              <th>Tier</th>
              <th>Tokens</th>
              <th>Share</th>
            </tr>
          </thead>
          <tbody>
            {pack.sections.map(s => (
              <tr key={s.key}>
                <td className={styles.cellMono}>
                  {s.key}
                  {s.truncated && <span className={styles.retry}> · truncated</span>}
                </td>
                <td>{s.segment}</td>
                <td>{s.tier}</td>
                <td>{tokens(s.tokens)}</td>
                <td>{sectionTotal > 0 ? `${Math.round((s.tokens / sectionTotal) * 100)}%` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={contextOpen} onOpenChange={setContextOpen}>
        <Dialog.Content size="lg">
          <Dialog.Header title="Rendered prompt context" description="The exact assembled text that fed this run's model prompt (stable segment first, volatile tail last)." />
          <Dialog.Body>
            {contextQuery.isLoading && <PaneLoader />}
            {contextQuery.error && <PaneError error={contextQuery.error} />}
            {contextQuery.data && <pre className={`${styles.pre} ${styles.contextPre}`}>{contextQuery.data.rendered}</pre>}
          </Dialog.Body>
        </Dialog.Content>
      </Dialog>
    </>
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
  const toolCalls = run.toolCalls ?? [];
  const totalIn = calls.reduce((sum, c) => sum + (c.inputTokens ?? 0), 0);
  const totalOut = calls.reduce((sum, c) => sum + (c.outputTokens ?? 0), 0);
  const totalCost = calls.reduce((sum, c) => sum + (c.costUsd != null ? Number(c.costUsd) : 0), 0);
  const trace = run.nodeTrace ?? [];

  const facts: RunFact[] = [
    { label: 'Duration', value: duration(run.startedAt, run.endedAt) },
    { label: 'Started', value: new Date(run.startedAt).toLocaleString() },
    { label: 'Model calls', value: String(calls.length) },
    { label: 'Tool calls', value: String(toolCalls.length) },
    { label: 'Tokens in / out', value: `${totalIn.toLocaleString()} / ${totalOut.toLocaleString()}` },
    { label: 'Cost', value: totalCost > 0 ? `$${totalCost.toFixed(4)}` : '—' },
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
          {run.contextPack && (
            <>
              <SectionLabel>Prompt anatomy — where the input tokens go</SectionLabel>
              <PromptAnatomy novelId={novelId} runId={runId} pack={run.contextPack} />
            </>
          )}
          {calls.length > 0 && (
            <>
              <SectionLabel>Model calls</SectionLabel>
              <ModelCallsTable novelId={novelId} runId={runId} calls={calls} />
              <p className={styles.tableNote}>
                Click a call to see its raw model output. Input tokens include the assembled context, playbook, and history — not just the trigger below.
              </p>
            </>
          )}
          {toolCalls.length > 0 && (
            <>
              <SectionLabel>Tool calls</SectionLabel>
              <ToolCallsTable calls={toolCalls} />
            </>
          )}
          {run.input && (
            <>
              <SectionLabel>Chain input — the trigger, not the prompt</SectionLabel>
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
    const first = runs[0];
    if (!selectedId && first) setSelectedId(first.id);
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
      <div className="nf-detail">{selectedId ? <RunDetail novelId={novelId} runId={selectedId} /> : <div className="nf-pane-empty">Select a run to see its detail.</div>}</div>
    </div>
  );
}
