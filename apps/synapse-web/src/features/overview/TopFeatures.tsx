import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Alert, Card, EmptyState, Table, type TableColumn } from '@shadow-library/ui';

import { readTasks, useActiveCatalog } from '@/features/catalog';
import { COST_PHRASES, CostLabel, formatUsd, Mono, SectionHeader, ShareCell } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';

import { featureSpendOf, type FeatureSpendRow, topFeaturesSubtitle, windowSearch } from './feature-spend';
import styles from './Overview.module.css';
import { FEATURE_SPEND_DAYS, featureSpendOptions, featureSpendWindow } from './overview-queries';

function FeatureCell({ row }: { row: FeatureSpendRow }): ReactElement {
  return (
    <span className={styles.stack}>
      {row.usage ? (
        <Link to="/usage" search={row.usage}>
          {row.title}
        </Link>
      ) : (
        <span>{row.title}</span>
      )}
      {row.taskKey ? <Mono>{row.taskKey}</Mono> : null}
    </span>
  );
}

export function TopFeatures({ today, readCatalog }: { today: string; readCatalog: boolean }): ReactElement {
  const usage = useQuery(featureSpendOptions(today));
  const catalog = useActiveCatalog(readCatalog);
  const tasks = catalog.status === 'ready' ? readTasks(catalog.document) : [];
  const period = featureSpendWindow(today);
  const spend = featureSpendOf(usage.data?.rows ?? [], tasks, period);
  const empty = usage.data !== undefined && spend.rows.length === 0;

  const columns: TableColumn<FeatureSpendRow>[] = [
    { id: 'feature', header: 'Feature', cell: row => <FeatureCell row={row} /> },
    { id: 'billed', header: <CostLabel kind="billed" />, align: 'end', cell: row => <span className={controls.tabular}>{formatUsd(row.billedCostUsd)}</span> },
    { id: 'list', header: <CostLabel kind="list" />, align: 'end', cell: row => <span className={controls.tabular}>{formatUsd(row.listCostUsd)}</span> },
    { id: 'share', header: `Share of ${COST_PHRASES[spend.basis]}`, align: 'end', cell: row => <ShareCell share={row.share} /> },
  ];

  return (
    <section className={styles.section} aria-label="Top features by spend">
      <SectionHeader title="Top features by spend" subtitle={topFeaturesSubtitle(usage.data ? spend : null, FEATURE_SPEND_DAYS)} />
      {usage.error ? (
        <Alert intent="danger" title="Couldn’t load spend by feature">
          {usage.error.message}
        </Alert>
      ) : (
        <>
          {empty ? (
            <Card padding="md">
              <Card.Body>
                <EmptyState size="inline" title={`No calls in the last ${FEATURE_SPEND_DAYS} days`} description="Features appear here once apps call Synapse." />
              </Card.Body>
            </Card>
          ) : (
            <Table data={spend.rows} columns={columns} rowKey="id" loading={usage.isPending} aria-label={`Features with the most spend over the last ${FEATURE_SPEND_DAYS} days`} />
          )}
          <div className={styles.footerLink}>
            <Link to="/usage" search={{ groupBy: 'task', ...windowSearch(period), ...(spend.basis === 'list' && !empty && { basis: spend.basis }) }}>
              Every feature on the Usage screen
            </Link>
          </div>
        </>
      )}
    </section>
  );
}
