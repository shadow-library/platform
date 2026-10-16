import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Alert, Badge, type BadgeIntent, Card, DescriptionList, Statistic, Table, type TableColumn, Tag } from '@shadow-library/ui';

import { activeVersionOf } from '@/features/catalog';
import { formatDate, formatDateTime, formatNumber, formatRate, Mono, Muted, PageHeader, PermissionGate, SectionHeader, TextOrDash } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { type Capabilities, draftQueryOptions, type ProviderResponse, providersQueryOptions, usageQueryOptions, useCapabilities, versionsQueryOptions } from '@/lib';

import styles from './Overview.module.css';

const USD = { style: 'currency', currency: 'USD', maximumFractionDigits: 2 } as const;
const WARNING_ERROR_RATE = 0.01;
const DANGER_ERROR_RATE = 0.1;

function errorRateIntent(rate?: number): BadgeIntent {
  if (rate == null || rate < WARNING_ERROR_RATE) return 'success';
  return rate < DANGER_ERROR_RATE ? 'warning' : 'danger';
}

export function Overview(): ReactElement {
  const capabilities = useCapabilities();
  return (
    <PermissionGate allowed={capabilities.readCatalog} area="the Synapse overview" homeLink={false}>
      <OverviewScreen capabilities={capabilities} />
    </PermissionGate>
  );
}

function CatalogCard(): ReactElement {
  const versions = useQuery(versionsQueryOptions());
  const draft = useQuery(draftQueryOptions());
  const active = versions.data ? activeVersionOf(versions.data.items) : undefined;

  return (
    <Card padding="md">
      <Card.Header title="Active catalog" />
      <Card.Body>
        {versions.error ? (
          <Alert intent="danger" title="Couldn't load versions">
            {versions.error.message}
          </Alert>
        ) : active ? (
          <DescriptionList layout="row">
            <DescriptionList.Item term="Version" mono>
              v{active.version}
            </DescriptionList.Item>
            <DescriptionList.Item term="Published">{formatDateTime(active.publishedAt)}</DescriptionList.Item>
            <DescriptionList.Item term="Published by">
              <TextOrDash value={active.createdBy} mono />
            </DescriptionList.Item>
            <DescriptionList.Item term="Note">
              <TextOrDash value={active.note} />
            </DescriptionList.Item>
          </DescriptionList>
        ) : (
          <Muted>{versions.isLoading ? 'Loading…' : 'No catalog version has been published yet.'}</Muted>
        )}
        <div className={styles.cardLink}>
          {draft.data ? (
            <>
              A draft saved {formatDateTime(draft.data.draft.createdAt)} is waiting.{' '}
              <Link to="/catalog" search={{ tab: 'publish' }}>
                Review it
              </Link>
            </>
          ) : (
            <Link to="/catalog" search={{ tab: 'draft' }}>
              Open the catalog editor
            </Link>
          )}
        </div>
      </Card.Body>
    </Card>
  );
}

function UsageCard(): ReactElement {
  const usage = useQuery(usageQueryOptions({ groupBy: 'app' }));
  const totals = usage.data?.totals;
  return (
    <Card padding="md">
      <Card.Header title={usage.data ? `Usage ${formatDate(usage.data.from)} – ${formatDate(usage.data.to)}` : 'Usage'} />
      <Card.Body>
        {usage.error ? (
          <Alert intent="danger" title="Couldn't load usage">
            {usage.error.message}
          </Alert>
        ) : (
          <div className={styles.totals}>
            <Statistic label="Calls" value={totals?.calls ?? 0} loading={usage.isLoading} size="sm" />
            <Statistic label="List cost" value={totals?.listCostUsd ?? 0} format={USD} loading={usage.isLoading} size="sm" />
            <Statistic label="Billed" value={totals?.billedCostUsd ?? 0} format={USD} loading={usage.isLoading} size="sm" />
          </div>
        )}
        <div className={styles.cardLink}>
          <Link to="/usage" search={{ groupBy: 'app' }}>
            Usage by app, task and model
          </Link>
        </div>
      </Card.Body>
    </Card>
  );
}

function ProvidersSection(): ReactElement {
  const providers = useQuery(providersQueryOptions());
  const data = providers.data;

  const columns: TableColumn<ProviderResponse>[] = [
    {
      id: 'key',
      header: 'Provider',
      cell: row => (
        <span>
          <Mono>{row.key}</Mono>
          <div className={styles.url}>{row.url}</div>
        </span>
      ),
    },
    { id: 'kind', header: 'Kind', cell: row => (row.flavor ? `${row.kind} · ${row.flavor}` : row.kind) },
    { id: 'locality', header: 'Locality', cell: row => row.locality.replaceAll('_', ' ') },
    { id: 'cost', header: 'Cost', cell: row => row.cost },
    {
      id: 'features',
      header: 'Features',
      cell: row =>
        row.features.length === 0 ? (
          <Muted>—</Muted>
        ) : (
          <span className={styles.features}>
            {row.features.map(feature => (
              <Tag key={feature} size="sm">
                {feature.replaceAll('_', ' ')}
              </Tag>
            ))}
          </span>
        ),
    },
    {
      id: 'apiKey',
      header: 'API key',
      cell: row =>
        row.apiKeyConfigured === undefined ? (
          <Muted>not needed</Muted>
        ) : row.apiKeyConfigured ? (
          'Configured'
        ) : (
          <Badge intent="danger" variant="soft">
            Missing
          </Badge>
        ),
    },
    { id: 'calls', header: 'Calls', align: 'end', cell: row => <span className={controls.tabular}>{formatNumber(row.calls)}</span> },
    { id: 'errors', header: 'Errors', align: 'end', cell: row => <span className={controls.tabular}>{formatNumber(row.errors)}</span> },
    {
      id: 'errorRate',
      header: 'Error rate',
      align: 'end',
      cell: row =>
        row.errorRate == null ? (
          <Muted>no calls</Muted>
        ) : (
          <Badge intent={errorRateIntent(row.errorRate)} variant="soft">
            {formatRate(row.errorRate)}
          </Badge>
        ),
    },
  ];

  return (
    <section className={styles.section} aria-label="Providers">
      <SectionHeader title="Providers" subtitle={data ? `From catalog v${data.catalogVersion}; calls and errors over the last ${data.windowHours} hours.` : undefined} />
      {providers.error ? (
        <Alert intent="danger" title="Couldn't load providers">
          {providers.error.message}
        </Alert>
      ) : (
        <Table
          data={data?.providers ?? []}
          columns={columns}
          rowKey="key"
          loading={providers.isLoading}
          aria-label="Providers and their error rates"
          emptyState="The active catalog names no providers."
        />
      )}
    </section>
  );
}

function OverviewScreen({ capabilities }: { capabilities: Capabilities }): ReactElement {
  return (
    <>
      <PageHeader title="Overview" subtitle="What the platform's AI traffic is routed by right now, and how its providers are holding up." />
      <div className={styles.cards}>
        <CatalogCard />
        {capabilities.readUsage ? <UsageCard /> : null}
      </div>
      <ProvidersSection />
    </>
  );
}
