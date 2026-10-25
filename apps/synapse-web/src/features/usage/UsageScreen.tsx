import { useQuery } from '@tanstack/react-query';
import { type ReactElement, useMemo } from 'react';
import { Alert, Button, downloadTextFile } from '@shadow-library/ui';

import { readTasks, useActiveCatalog } from '@/features/catalog';
import { PageHeader, PermissionGate } from '@/features/shared';
import { usageQueryOptions, usageSeriesQueryOptions, useCapabilities } from '@/lib';

import { CSV_BOM, usageCsv, usageCsvFilename } from './usage-csv';
import { previousPeriod, totalsDeltas, usageNamesOf, usageRows } from './usage-report';
import { previousUsageQueryOptions } from './usage-previous.query';
import { costBasisOf, lastIncludedInstant, USAGE_GROUP_LABELS, usageParams, type UsageSearch } from './usage-search';
import { UsageChartPanel } from './UsageChartPanel';
import { UsageFilters } from './UsageFilters';
import { UsageTable } from './UsageTable';
import { UsageTotals } from './UsageTotals';

const SUBTITLE =
  "Billed spend is what providers actually charged; API-price cost is what the same calls would cost at the providers' list API prices, which is what budgets count.";

export function UsageScreen({ search }: { search: UsageSearch }): ReactElement {
  const capabilities = useCapabilities();
  return (
    <PermissionGate allowed={capabilities.readUsage} area="usage reports" homeLink={capabilities.readCatalog}>
      <UsageReport search={search} readCatalog={capabilities.readCatalog} />
    </PermissionGate>
  );
}

function UsageReport({ search, readCatalog }: { search: UsageSearch; readCatalog: boolean }): ReactElement {
  const basis = costBasisOf(search);
  const params = usageParams(search);
  const usage = useQuery(usageQueryOptions(params));
  const series = useQuery(usageSeriesQueryOptions(params));
  const period = usage.data ? previousPeriod(usage.data) : null;
  const previous = useQuery(previousUsageQueryOptions(period && { ...params, ...period }));
  const previousTotals = period ? previous.data?.totals : undefined;
  const active = useActiveCatalog(readCatalog);
  const document = active.status === 'ready' ? active.document : undefined;
  const names = useMemo(() => usageNamesOf(document), [document]);
  const tasks = useMemo(() => (document ? readTasks(document) : []), [document]);

  const data = usage.data;
  const groupLabel = USAGE_GROUP_LABELS[search.groupBy];
  const previousRows = period && previous.data && previous.data.totals.calls > 0 ? previous.data.rows : null;
  const rows = data ? usageRows(data.rows, previousRows, search.groupBy, basis, names) : [];

  const exportCsv = (): void => {
    if (!data) return;
    const filename = usageCsvFilename(data.from.slice(0, 10), lastIncludedInstant(data.to).slice(0, 10), search.groupBy);
    downloadTextFile(filename, `${CSV_BOM}${usageCsv(rows, search.groupBy, basis)}`);
  };

  return (
    <>
      <PageHeader
        title="Usage"
        subtitle={SUBTITLE}
        action={
          <Button type="button" variant="secondary" onClick={exportCsv} disabled={rows.length === 0 || (period !== null && previous.isPending)}>
            Export CSV
          </Button>
        }
      />
      <UsageFilters search={search} tasks={tasks} reportLastDay={data ? lastIncludedInstant(data.to).slice(0, 10) : null} />
      {usage.error ? (
        <Alert intent="danger" title="Couldn't load usage">
          {usage.error.message}
        </Alert>
      ) : (
        <>
          <UsageTotals totals={data?.totals} deltas={data ? totalsDeltas(data.totals, previousTotals) : {}} period={data} loading={usage.isLoading} />
          <UsageChartPanel query={series} group={search.groupBy} basis={basis} names={names} period={data} />
          <UsageTable rows={rows} groupLabel={groupLabel} basis={basis} previousFailed={period !== null && previous.isError} loading={usage.isLoading} />
        </>
      )}
    </>
  );
}
