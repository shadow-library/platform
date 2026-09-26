import { Link } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Alert, Button, Spinner } from '@shadow-library/ui';

import { PaneError, PaneLoader, RunStatusChip } from '@/components/nf';
import { type RunModelCallResponse, useAiModelsQuery, useRunChargesQuery, useRunUsageQuery, useSettledRunRefresh, type WorkflowRunListItemResponse } from '@/lib/apis';
import { messageTime } from '@/lib/format';
import { modelLabel } from '@/lib/model-defaults';
import { formatSeconds } from '@/lib/runs';
import { useIsAdmin } from '@/lib/session';
import { callCharge, callRoleLabel, formatCompactTokens, formatUsd, pageRange, runLabel } from '@/lib/usage';

import styles from './usage.module.css';
import { EstimateMark, UsageEmpty } from './UsageParts';

const PAGE_SIZE = 20;

interface RunCallLineProps {
  call: RunModelCallResponse;
}

function RunCallLine({ call }: RunCallLineProps): ReactElement {
  const modelsQuery = useAiModelsQuery();
  const registry = modelsQuery.data?.models ?? [];
  const charge = callCharge(call, modelsQuery.data ? (registry.find(model => model.id === call.model) ?? null) : undefined);
  const tokens =
    call.inputTokens == null && call.outputTokens == null ? '—' : `${formatCompactTokens(call.inputTokens ?? 0)} in · ${formatCompactTokens(call.outputTokens ?? 0)} out`;
  return (
    <div className={styles.callRow}>
      <span>
        {callRoleLabel(call.role)}
        {call.status !== 'ok' && <span className={styles.callMuted}> · {call.status}</span>}
      </span>
      <span className={styles.callMuted}>{modelLabel(registry, call.model, call.provider)}</span>
      <span className={styles.callMuted}>{tokens}</span>
      <span className={styles.callMuted}>{formatSeconds(call.latencyMs)}</span>
      <span className={styles.callCost}>
        {charge.usd == null ? '—' : formatUsd(charge.usd)}
        {charge.estimated && <span className={styles.callMuted}> est.</span>}
      </span>
    </div>
  );
}

interface RunDrillDownProps {
  novelId: string;
  runId: string;
  id: string;
  live: boolean;
}

function RunDrillDown({ novelId, runId, id, live }: RunDrillDownProps): ReactElement {
  const isAdmin = useIsAdmin();
  const usageQuery = useRunUsageQuery(novelId, runId, live);
  const calls = usageQuery.data?.calls ?? [];

  return (
    <div id={id} className={styles.drill}>
      {usageQuery.isLoading && <Spinner size="sm" label="Loading the calls" />}
      {usageQuery.error && (
        <Alert intent="danger" title="Couldn’t load this run’s calls" action={{ label: 'Retry', onClick: () => void usageQuery.refetch() }}>
          {usageQuery.error.message}
        </Alert>
      )}
      {usageQuery.data && calls.length === 0 && <span className={styles.callMuted}>This run made no model calls.</span>}
      {calls.map(call => (
        <RunCallLine key={call.id} call={call} />
      ))}
      {isAdmin && (
        <div className={styles.drillFoot}>
          <Link to="/novels/$novelId/runs" params={{ novelId }} search={{ run: runId }}>
            Full run details
          </Link>
        </div>
      )}
    </div>
  );
}

interface RunChargeRowProps {
  novelId: string;
  run: WorkflowRunListItemResponse;
  open: boolean;
  onToggle: () => void;
}

function RunChargeRow({ novelId, run, open, onToggle }: RunChargeRowProps): ReactElement {
  const drillId = `run-charges-${run.id}`;
  const { totals } = run;
  const settled = run.status === 'completed';
  return (
    <>
      <tr className={styles.runRow} onClick={onToggle}>
        <td className={styles.runWhen}>{messageTime(run.startedAt)}</td>
        <td>
          <div className={styles.runCell}>
            <button
              type="button"
              className={styles.runToggle}
              aria-expanded={open}
              aria-controls={open ? drillId : undefined}
              onClick={event => {
                event.stopPropagation();
                onToggle();
              }}
            >
              {runLabel(run)}
            </button>
            {!settled && <RunStatusChip status={run.status} friendly />}
          </div>
        </td>
        <td>{totals.calls.toLocaleString()}</td>
        <td>{formatCompactTokens(totals.inputTokens + totals.outputTokens)}</td>
        <td>
          {formatUsd(totals.costUsd)}
          {totals.estimatedCostUsd > 0 && <EstimateMark />}
        </td>
        <td className={styles.caret} aria-hidden="true">
          {open ? '▴' : '▾'}
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} className={styles.drillCell}>
            <RunDrillDown novelId={novelId} runId={run.id} id={drillId} live={run.status === 'running'} />
          </td>
        </tr>
      )}
    </>
  );
}

interface RunChargesProps {
  novelId: string;
  from?: string;
}

export function RunCharges({ novelId, from }: RunChargesProps): ReactElement {
  const [offset, setOffset] = useState(0);
  const [openRunId, setOpenRunId] = useState<string | null>(null);
  const runsQuery = useRunChargesQuery(novelId, { limit: PAGE_SIZE, offset, from });
  useSettledRunRefresh(novelId, runsQuery.data?.items);

  if (runsQuery.isLoading) return <PaneLoader />;
  if (runsQuery.error) return <PaneError error={runsQuery.error} />;

  const runs = runsQuery.data?.items ?? [];
  const total = runsQuery.data?.total ?? 0;
  if (runs.length === 0)
    return <UsageEmpty>{from ? 'No runs in this period.' : 'No runs yet. Every chat reply, chapter, review and audit shows up here with what it cost.'}</UsageEmpty>;

  const range = pageRange(offset, runs.length, total);
  const toggle = (runId: string): void => setOpenRunId(current => (current === runId ? null : runId));

  return (
    <>
      <table className={`${styles.costTable} ${styles.runsTable}`} data-flush>
        <thead>
          <tr>
            <th scope="col">When</th>
            <th scope="col">What</th>
            <th scope="col">Calls</th>
            <th scope="col">Tokens</th>
            <th scope="col">Charged</th>
            <th scope="col">
              <span className="sr-only">Details</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {runs.map(run => (
            <RunChargeRow key={run.id} novelId={novelId} run={run} open={openRunId === run.id} onToggle={() => toggle(run.id)} />
          ))}
        </tbody>
      </table>
      {(range.hasPrevious || range.hasNext) && (
        <div className={styles.pager}>
          <span className={styles.pagerLabel}>
            {range.from.toLocaleString()}–{range.to.toLocaleString()} of {total.toLocaleString()}
          </span>
          <Button size="sm" variant="secondary" disabled={!range.hasPrevious || runsQuery.isFetching} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
            Newer
          </Button>
          <Button size="sm" variant="secondary" disabled={!range.hasNext || runsQuery.isFetching} onClick={() => setOffset(offset + PAGE_SIZE)}>
            Older
          </Button>
        </div>
      )}
    </>
  );
}
