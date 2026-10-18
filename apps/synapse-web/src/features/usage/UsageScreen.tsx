import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Alert, Button, Card, type DateRange, DateRangePicker, FormField, Select, Statistic, Table, type TableColumn } from '@shadow-library/ui';

import { formatDate, formatNumber, formatRate, formatUsd, Mono, Muted, PageHeader, PermissionGate, usdFormat } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { usageQueryOptions, type UsageRowResponse, useCapabilities } from '@/lib';

import styles from './Usage.module.css';
import {
  isReportableRange,
  lastIncludedInstant,
  MAX_USAGE_RANGE_DAYS,
  pickerRangeOf,
  searchRangeOf,
  USAGE_GROUP_LABELS,
  USAGE_GROUPS,
  type UsageGroup,
  usageParams,
  usageRangePresets,
  type UsageSearch,
  utcToday,
} from './usage-search';

export function UsageScreen({ search }: { search: UsageSearch }): ReactElement {
  const capabilities = useCapabilities();
  return (
    <PermissionGate allowed={capabilities.readUsage} area="usage reports" homeLink={capabilities.readCatalog}>
      <UsageReport search={search} />
    </PermissionGate>
  );
}

function RangeForm({ search }: { search: UsageSearch }): ReactElement {
  const navigate = useNavigate();
  const [today] = useState(() => utcToday(new Date()));
  const [tooLong, setTooLong] = useState(false);
  const show = (next: UsageSearch): void => {
    setTooLong(false);
    void navigate({ to: '/usage', search: next });
  };
  const pick = (range: DateRange): void => {
    const next = { groupBy: search.groupBy, ...searchRangeOf(range) };
    if (next.from && !isReportableRange(next.from, next.to, new Date())) return setTooLong(true);
    show(next);
  };

  return (
    <div className={styles.filters} role="group" aria-label="Usage range">
      <FormField label="Range" helper="Whole days, UTC" error={tooLong ? `Pick at most ${MAX_USAGE_RANGE_DAYS} days` : undefined} className={styles.range}>
        <DateRangePicker value={pickerRangeOf(search)} onValueChange={pick} presets={usageRangePresets(today)} max={today} confirm placeholder="Default: last 30 days" />
      </FormField>
      <FormField label="Group by" className={styles.field}>
        <Select value={search.groupBy} onValueChange={value => show({ ...search, groupBy: value as UsageGroup })} aria-label="Group usage by">
          {USAGE_GROUPS.map(group => (
            <Select.Item key={group} value={group}>
              {USAGE_GROUP_LABELS[group]}
            </Select.Item>
          ))}
        </Select>
      </FormField>
      {search.from || search.to ? (
        <Button type="button" variant="ghost" onClick={() => show({ groupBy: search.groupBy })}>
          Default range
        </Button>
      ) : null}
    </div>
  );
}

function UsageReport({ search }: { search: UsageSearch }): ReactElement {
  const usage = useQuery(usageQueryOptions(usageParams(search)));
  const data = usage.data;
  const totalListCost = data?.totals.listCostUsd ?? 0;
  const totalBilled = data?.totals.billedCostUsd ?? 0;
  const groupLabel = USAGE_GROUP_LABELS[search.groupBy];

  const columns: TableColumn<UsageRowResponse>[] = [
    { id: 'key', header: groupLabel, cell: row => (row.key === null ? <Muted>none</Muted> : <Mono>{row.key}</Mono>) },
    { id: 'calls', header: 'Calls', align: 'end', cell: row => <span className={controls.tabular}>{formatNumber(row.calls)}</span> },
    { id: 'inputTokens', header: 'Input', align: 'end', cell: row => <span className={controls.tabular}>{formatNumber(row.inputTokens)}</span> },
    { id: 'cachedInputTokens', header: 'Cached', align: 'end', cell: row => <span className={controls.tabular}>{formatNumber(row.cachedInputTokens)}</span> },
    { id: 'outputTokens', header: 'Output', align: 'end', cell: row => <span className={controls.tabular}>{formatNumber(row.outputTokens)}</span> },
    { id: 'reasoningTokens', header: 'Reasoning', align: 'end', cell: row => <span className={controls.tabular}>{formatNumber(row.reasoningTokens)}</span> },
    { id: 'listCostUsd', header: 'List cost', align: 'end', cell: row => <span className={controls.tabular}>{formatUsd(row.listCostUsd)}</span> },
    { id: 'billedCostUsd', header: 'Billed', align: 'end', cell: row => <span className={controls.tabular}>{formatUsd(row.billedCostUsd)}</span> },
    {
      id: 'share',
      header: 'Share of list cost',
      align: 'end',
      cell: row => {
        const share = totalListCost > 0 ? row.listCostUsd / totalListCost : 0;
        return (
          <span className={styles.share}>
            <span className={styles.bar} aria-hidden>
              <span className={styles.barFill} style={{ width: `${Math.round(share * 100)}%` }} />
            </span>
            <span className={controls.tabular}>{totalListCost > 0 ? formatRate(share) : '—'}</span>
          </span>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader
        title="Usage"
        subtitle={
          data
            ? `Settled calls from ${formatDate(data.from)} through ${formatDate(lastIncludedInstant(data.to))}, grouped by ${groupLabel.toLowerCase()}. Cost is counted at list price; billed is what providers charged.`
            : 'Settled calls from the usage ledger.'
        }
      />
      <RangeForm search={search} />
      {usage.error ? (
        <Alert intent="danger" title="Couldn't load usage">
          {usage.error.message}
        </Alert>
      ) : (
        <>
          <div className={styles.totals}>
            <Card padding="md">
              <Card.Body>
                <Statistic label="Calls" value={data?.totals.calls ?? 0} loading={usage.isLoading} />
              </Card.Body>
            </Card>
            <Card padding="md">
              <Card.Body>
                <Statistic label="Input tokens" value={data?.totals.inputTokens ?? 0} loading={usage.isLoading} />
              </Card.Body>
            </Card>
            <Card padding="md">
              <Card.Body>
                <Statistic label="Output tokens" value={data?.totals.outputTokens ?? 0} loading={usage.isLoading} />
              </Card.Body>
            </Card>
            <Card padding="md">
              <Card.Body>
                <Statistic label="List cost" value={totalListCost} format={usdFormat(totalListCost)} loading={usage.isLoading} />
              </Card.Body>
            </Card>
            <Card padding="md">
              <Card.Body>
                <Statistic label="Billed" value={totalBilled} format={usdFormat(totalBilled)} loading={usage.isLoading} />
              </Card.Body>
            </Card>
          </div>
          <Table
            data={data?.rows ?? []}
            columns={columns}
            rowKey={row => row.key ?? '∅'}
            loading={usage.isLoading}
            aria-label={`Usage by ${groupLabel.toLowerCase()}`}
            emptyState="No settled calls in this range."
          />
        </>
      )}
    </>
  );
}
