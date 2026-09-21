import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { Alert, Button, Dialog, Spinner, EmptyState as UiEmptyState } from '@shadow-library/ui';

import { LockIcon, RunsIcon } from '@/components/icons';
import { useCollectionJump } from '@/components/Layout';
import { type ChipIntent, CollectionPage, DetailPage, EmptyState, ItemPager, type ItemPagerJump, PaneError, PaneLoader, StatusChip, StopButton } from '@/components/nf';
import {
  hasRunningRun,
  listRunsQueryOptions,
  type RunContextPackResponse,
  type RunModelCallResponse,
  type RunToolCallResponse,
  useListRunsQuery,
  useRunCallQuery,
  useRunContextQuery,
  useRunQuery,
  useRunStop,
  type WorkflowRunDetailResponse,
} from '@/lib/apis';
import { relativeTime } from '@/lib/format';
import { formatCost, formatMillis, formatSeconds, formatTokens, resolveRunView, runDuration, runIds, runsBackLabel, runTitle, runTotals, sectionShare } from '@/lib/runs';
import { resolveIsAdmin } from '@/lib/session';

import styles from './runs.module.css';

interface RunsSearch {
  run?: string;
}

/**
 * The admin check resolves in `beforeLoad`, so the admin-only screen never flashes before it answers, on
 * the server or the client. The detail endpoints (`getRun`, `getRunContext`, `getRunCall`) 403 for a
 * non-admin, so the loader skips prefetching the list too: a non-admin never issues a request this route
 * can't show.
 */
export const Route = createFileRoute('/novels/$novelId/runs')({
  validateSearch: (search: Record<string, unknown>): RunsSearch => ({ run: typeof search.run === 'string' && search.run ? search.run : undefined }),
  beforeLoad: async ({ context }) => ({ isAdmin: await resolveIsAdmin(context.queryClient) }),
  loader: ({ context, params }) => (context.isAdmin ? context.queryClient.prefetchQuery(listRunsQueryOptions(params.novelId)) : undefined),
  component: RunsScreen,
});

/**
 * The person most likely to hit this is the product owner before granting themselves the role — a silent
 * bounce to Overview would just look like the nav entry doesn't exist. This names the role and stays on
 * the URL they asked for, rather than redirecting or rendering a generic 404.
 */
function AdminRequired(): React.JSX.Element {
  const navigate = useNavigate();
  const { novelId } = Route.useParams();
  return (
    <div className={styles.adminGate}>
      <UiEmptyState
        size="page"
        illustration={<LockIcon size={28} />}
        title="Workflow Runs needs the admin role"
        description="This screen exposes run internals — prompts, raw model output, cost. Assign yourself the NovelForgeAdmin role in Shadow Identity to see it."
        action={{ label: 'Back to Overview', onClick: () => navigate({ to: '/novels/$novelId/overview', params: { novelId } }) }}
      />
    </div>
  );
}

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

interface RunStatusChipProps {
  status: string;
}

function RunStatusChip({ status }: RunStatusChipProps): React.JSX.Element {
  return (
    <StatusChip intent={runIntent(status)} dot={status !== 'running'}>
      {status === 'running' && <Spinner size="sm" />}
      {status}
    </StatusChip>
  );
}

interface SectionLabelProps {
  children: React.ReactNode;
}

function SectionLabel({ children }: SectionLabelProps): React.JSX.Element {
  return <div className={`nf-eyebrow ${styles.sectionLabel}`}>{children}</div>;
}

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
        <td>{formatTokens(call.inputTokens)}</td>
        <td>{formatTokens(call.outputTokens)}</td>
        <td>{formatSeconds(call.latencyMs)}</td>
        <td>{formatCost(call.costUsd != null ? Number(call.costUsd) : null)}</td>
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
                <pre className={`${styles.pre} ${styles.preWell} ${styles.preScroll}`}>{detailQuery.data.rawOutput ?? '(not recorded)'}</pre>
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
              <td>{formatMillis(c.latencyMs)}</td>
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
          {formatTokens(pack.usedTokens ?? sectionTotal)} of {formatTokens(pack.budgetTokens)} budget tokens
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
                <td>{formatTokens(s.tokens)}</td>
                <td>{sectionShare(s.tokens, sectionTotal)}</td>
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
  run: WorkflowRunDetailResponse;
  total: number | undefined;
  ids: readonly string[] | undefined;
  jump?: ItemPagerJump;
  onSelect: (runId?: string) => void;
}

interface RunDetailPendingProps {
  novelId: string;
  runId: string;
  summary: WorkflowRunDetailResponse | undefined;
  total: number | undefined;
  ids: readonly string[] | undefined;
  jump?: ItemPagerJump;
  onSelect: (runId?: string) => void;
}

/** The directory already knows a listed run's name and status, so opening one keeps the page rather than blanking it while the internals load. */
function RunDetailPending({ novelId, runId, summary, total, ids, jump, onSelect }: RunDetailPendingProps): React.JSX.Element {
  return (
    <DetailPage
      back={
        <Link to="/novels/$novelId/runs" params={{ novelId }}>
          {runsBackLabel(total)}
        </Link>
      }
      identity={<DetailPage.Identity title={summary ? runTitle(summary) : 'Workflow run'}>{summary && <RunStatusChip status={summary.status} />}</DetailPage.Identity>}
      pager={<ItemPager ids={ids} currentId={runId} onSelect={onSelect} itemNoun="run" jump={jump} />}
    >
      <PaneLoader />
    </DetailPage>
  );
}

function RunDetail({ novelId, run, total, ids, jump, onSelect }: RunDetailProps): React.JSX.Element {
  const runStop = useRunStop(novelId);
  const calls = run.modelCalls ?? [];
  const toolCalls = run.toolCalls ?? [];
  const totals = runTotals(calls);
  const trace = run.nodeTrace ?? [];

  const facts: RunFact[] = [
    { label: 'Duration', value: runDuration(run) },
    { label: 'Started', value: new Date(run.startedAt).toLocaleString() },
    { label: 'Model calls', value: String(calls.length) },
    { label: 'Tool calls', value: String(toolCalls.length) },
    { label: 'Tokens in / out', value: `${totals.inputTokens.toLocaleString()} / ${totals.outputTokens.toLocaleString()}` },
    { label: 'Cost', value: totals.costUsd > 0 ? formatCost(totals.costUsd) : '—' },
    ...(run.jobId ? [{ label: 'Job', value: run.jobId }] : []),
  ];

  return (
    <DetailPage
      back={
        <Link to="/novels/$novelId/runs" params={{ novelId }}>
          {runsBackLabel(total)}
        </Link>
      }
      identity={
        <DetailPage.Identity title={runTitle(run)}>
          <RunStatusChip status={run.status} />
        </DetailPage.Identity>
      }
      pager={<ItemPager ids={ids} currentId={run.id} onSelect={onSelect} itemNoun="run" jump={jump} />}
      actions={run.status === 'running' && <StopButton onStop={() => runStop.stop(run.id)} stopping={runStop.stopping} />}
      asideLabel="Run ledger"
      aside={
        <section className={styles.asideBlock}>
          <h2 className={styles.asideTitle}>Ledger</h2>
          <dl className={styles.factGrid}>
            {facts.map(fact => (
              <div key={fact.label} className={styles.fact}>
                <dt className={styles.factLabel}>{fact.label}</dt>
                <dd className={styles.factValue}>{fact.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      }
    >
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
          <PromptAnatomy novelId={novelId} runId={run.id} pack={run.contextPack} />
        </>
      )}
      {calls.length > 0 && (
        <>
          <SectionLabel>Model calls</SectionLabel>
          <ModelCallsTable novelId={novelId} runId={run.id} calls={calls} />
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
            <pre className={`${styles.pre} ${styles.preWell} ${styles.preScroll}`}>{JSON.stringify(run.input, null, 2)}</pre>
          </div>
        </>
      )}
    </DetailPage>
  );
}

function RunsScreen(): React.JSX.Element {
  const { isAdmin } = Route.useRouteContext();
  const { novelId } = Route.useParams();
  const { run: runParam } = Route.useSearch();
  const goSearch = Route.useNavigate();
  const runsQuery = useListRunsQuery(novelId, isAdmin, { refetchInterval: query => (hasRunningRun(query.state.data) ? 4000 : false) });
  const runQuery = useRunQuery(novelId, runParam, isAdmin);

  const runs = useMemo(() => runsQuery.data?.items ?? [], [runsQuery.data]);
  const resolved = !runsQuery.isLoading && !runsQuery.error;
  const total = resolved ? runs.length : undefined;
  const ids = useMemo(() => (resolved ? runIds(runs) : undefined), [resolved, runs]);
  const jumpItems = useMemo(() => runs.map(run => ({ id: run.id, label: runTitle(run), caption: `${run.status} · ${relativeTime(run.startedAt)}` })), [runs]);

  const selectRun = (runId?: string): void => void goSearch({ search: { run: runId } });
  const jump = useCollectionJump(resolved ? { collection: 'runs', items: jumpItems, currentId: runParam, onSelect: selectRun } : null);
  const view = resolveRunView({ runId: runParam, run: runQuery.data, isLoading: runQuery.isLoading, error: runQuery.error });

  if (!isAdmin) return <AdminRequired />;
  if (view.kind === 'loading')
    return <RunDetailPending novelId={novelId} runId={view.runId} summary={runs.find(run => run.id === view.runId)} total={total} ids={ids} jump={jump} onSelect={selectRun} />;
  if (view.kind === 'failed') return <PaneError error={view.error} />;
  if (view.kind === 'detail') return <RunDetail novelId={novelId} run={view.run} total={total} ids={ids} jump={jump} onSelect={selectRun} />;

  return (
    <CollectionPage
      title="Workflow Runs"
      subtitle="The most recent graph runs for this project — prompts, raw model output, token counts and cost, exactly as recorded."
      total={total}
      notice={
        view.kind === 'missing' && (
          <Alert intent="warning" title="That run is no longer here." action={{ label: 'Back to the directory', onClick: () => selectRun(undefined) }}>
            It belongs to another project, or the link was typed by hand.
          </Alert>
        )
      }
      empty={
        <EmptyState
          icon={<RunsIcon size={24} />}
          title="No runs yet"
          description="A run is recorded every time a workflow graph executes for this project. This is the operator's record — prompts, raw model output, token counts and cost — not an authoring screen."
        />
      }
    >
      {runsQuery.isLoading ? (
        <PaneLoader />
      ) : runsQuery.error ? (
        <PaneError error={runsQuery.error} />
      ) : (
        <CollectionPage.Rows>
          {runs.map(run => (
            <CollectionPage.Row
              key={run.id}
              link={<Link to="/novels/$novelId/runs" params={{ novelId }} search={{ run: run.id }} />}
              title={runTitle(run)}
              caption={run.outcome ?? undefined}
              clampCaption
              trailing={<RunStatusChip status={run.status} />}
              meta={`${relativeTime(run.startedAt)} · ${runDuration(run)}`}
            />
          ))}
        </CollectionPage.Rows>
      )}
    </CollectionPage>
  );
}
