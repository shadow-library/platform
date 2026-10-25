import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type ReactElement, useMemo } from 'react';
import { Alert, Badge, EmptyState, Skeleton, Spinner, Table, type TableColumn, Tag } from '@shadow-library/ui';

import { type CatalogDocument, useWorkingCatalog, type WorkingSource } from '@/features/catalog';
import { CostLabel, effortName, formatUsd, modelPriceText, Muted, PageHeader, PermissionGate, SectionHeader, taskKindName } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { type Capabilities, usageQueryOptions, useCapabilities } from '@/lib';

import { buildFeatureGroups, changedTaskKeys, type FeatureSummary } from './feature-list';
import styles from './Features.module.css';
import { WorkingHint } from './WorkingHint';

const USAGE_PARAMS = { groupBy: 'task' } as const;

export function FeaturesScreen(): ReactElement {
  const capabilities = useCapabilities();
  return (
    <PermissionGate allowed={capabilities.readCatalog} area="the model catalog">
      <PageHeader title="Features" subtitle="Every AI feature in our apps, the model that answers it, and what it costs." />
      <FeatureList capabilities={capabilities} />
    </PermissionGate>
  );
}

function FeatureList({ capabilities }: { capabilities: Capabilities }): ReactElement {
  const working = useWorkingCatalog('required');
  if (working.status === 'loading')
    return (
      <div className={controls.loading}>
        <Spinner aria-label="Loading features" />
      </div>
    );
  if (working.status === 'error')
    return (
      <Alert intent="danger" title="Couldn't load the catalog">
        {working.error.message}
      </Alert>
    );
  if (working.status === 'none') return <EmptyState title="No catalog published yet" description="Features appear here once a catalog version is published." />;
  return <FeatureGroups document={working.document} active={working.active} source={working.source} readUsage={capabilities.readUsage} />;
}

interface FeatureGroupsProps {
  document: CatalogDocument;
  active: CatalogDocument | null;
  source: WorkingSource;
  readUsage: boolean;
}

function SpendCell({ value, loading }: { value?: number; loading: boolean }): ReactElement {
  if (loading) return <Skeleton width="4em" />;
  return value === undefined ? <Muted>—</Muted> : <span className={controls.tabular}>{formatUsd(value)}</span>;
}

function FeatureGroups({ document, active, source, readUsage }: FeatureGroupsProps): ReactElement {
  const usage = useQuery({ ...usageQueryOptions(USAGE_PARAMS), enabled: readUsage });
  const rows = usage.data?.rows ?? null;
  const changed = useMemo(() => changedTaskKeys(active, source.kind === 'draft' ? document : null), [active, source.kind, document]);
  const groups = useMemo(() => buildFeatureGroups(document, changed, rows), [document, changed, rows]);
  const spendLoading = readUsage && usage.isLoading;

  const columns: TableColumn<FeatureSummary>[] = [
    {
      id: 'name',
      header: 'Feature',
      cell: row => (
        <span className={styles.featureCell}>
          <span className={styles.featureName}>
            <Link to="/features/$task" params={{ task: row.key }} className={styles.featureLink}>
              {row.name}
            </Link>
            {row.unpublished ? (
              <Badge intent="warning" variant="soft" size="sm">
                Unpublished changes
              </Badge>
            ) : null}
          </span>
          {row.description ? (
            <span className={styles.featureDescription}>
              <Muted>{row.description}</Muted>
            </span>
          ) : null}
        </span>
      ),
    },
    { id: 'kind', header: 'Kind', cell: row => taskKindName(row.kind) },
    {
      id: 'model',
      header: 'Default model',
      cell: row =>
        row.defaultModel ? (
          <span className={styles.featureCell}>
            <span>{row.defaultModel.name}</span>
            <Muted>{row.defaultModel.price ? modelPriceText(row.defaultModel.price) : 'Not in the catalog'}</Muted>
            {row.extraRules > 0 ? <Muted>+{row.extraRules === 1 ? '1 rule' : `${row.extraRules} rules`}</Muted> : null}
          </span>
        ) : (
          <Muted>No default</Muted>
        ),
    },
    { id: 'effort', header: 'Effort', cell: row => (row.effort ? effortName(row.effort) : <Muted>—</Muted>) },
    {
      id: 'aliases',
      header: 'Model names offered',
      cell: row =>
        row.aliases.length === 0 ? (
          <Muted>None</Muted>
        ) : (
          <span className={styles.tags}>
            {row.aliases.map(alias => (
              <Tag key={alias.key} size="sm">
                {alias.name}
              </Tag>
            ))}
          </span>
        ),
    },
    ...(readUsage
      ? [
          {
            id: 'billed',
            header: <CostLabel kind="billed" />,
            align: 'end' as const,
            cell: (row: FeatureSummary) => <SpendCell value={row.spend?.billed} loading={spendLoading} />,
          },
          { id: 'list', header: <CostLabel kind="list" />, align: 'end' as const, cell: (row: FeatureSummary) => <SpendCell value={row.spend?.list} loading={spendLoading} /> },
        ]
      : []),
  ];

  return (
    <>
      <WorkingHint source={source} />
      {readUsage ? (
        usage.error ? (
          <Alert intent="warning" title="Spend couldn't be loaded" className={styles.notice}>
            {usage.error.message}
          </Alert>
        ) : (
          <p className={controls.hint}>Spend covers the last 30 days.</p>
        )
      ) : null}
      {groups.length === 0 ? (
        <EmptyState title="No features yet" description="New features are added by the app's developers." />
      ) : (
        groups.map(group => (
          <section key={group.app} className={styles.group} aria-label={group.name}>
            <SectionHeader title={group.name} subtitle={group.features.length === 1 ? '1 feature' : `${group.features.length} features`} />
            <div className={styles.linkedRows}>
              <Table data={group.features} columns={columns} rowKey="key" aria-label={`${group.name} features`} />
            </div>
          </section>
        ))
      )}
      {groups.length > 0 ? <p className={controls.hint}>New features are added by the app&apos;s developers.</p> : null}
    </>
  );
}
