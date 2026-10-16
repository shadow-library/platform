import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Alert, Badge, type BadgeIntent, Button, EmptyState, Spinner, Table, type TableColumn } from '@shadow-library/ui';

import { activeVersionOf, type AliasEntry, type AliasState, type CatalogDocument, describeAvailability, readAliases, readModels } from '@/features/catalog';
import { Mono, Muted, PageHeader, PermissionGate } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { type Capabilities, useCapabilities, versionQueryOptions, versionsQueryOptions } from '@/lib';

import { AliasImpactPanel } from './AliasImpactPanel';
import styles from './Aliases.module.css';

export interface AliasesSearch {
  alias?: string;
  model?: string;
}

const STATE_INTENT: Record<AliasState, BadgeIntent> = { active: 'success', hidden: 'warning', retired: 'neutral' };

export function AliasesScreen({ search }: { search: AliasesSearch }): ReactElement {
  const capabilities = useCapabilities();
  return (
    <PermissionGate allowed={capabilities.readCatalog} area="the model catalog">
      <AliasesView search={search} capabilities={capabilities} />
    </PermissionGate>
  );
}

function AliasesView({ search, capabilities }: { search: AliasesSearch; capabilities: Capabilities }): ReactElement {
  const versions = useQuery(versionsQueryOptions());
  const active = versions.data ? activeVersionOf(versions.data.items) : undefined;
  const detail = useQuery({ ...versionQueryOptions(active?.version ?? 0), enabled: active !== undefined });

  const header = (
    <PageHeader
      title="Aliases"
      subtitle={`The family names users pick from${active ? `, as published in v${active.version}` : ''}. Retarget one by editing the draft, then publish it.`}
    />
  );

  const loadError = versions.error ?? detail.error;
  if (loadError)
    return (
      <>
        {header}
        <Alert intent="danger" title="Couldn't load the active catalog">
          {loadError.message}
        </Alert>
      </>
    );
  if (versions.data && !active)
    return (
      <>
        {header}
        <EmptyState title="No catalog published yet" description="Aliases appear here once a catalog version is published." />
      </>
    );
  if (!detail.data)
    return (
      <>
        {header}
        <div className={controls.loading}>
          <Spinner aria-label="Loading aliases" />
        </div>
      </>
    );

  return (
    <>
      {header}
      <AliasTable document={detail.data.document} search={search} capabilities={capabilities} />
    </>
  );
}

function AliasTable({ document, search, capabilities }: { document: CatalogDocument; search: AliasesSearch; capabilities: Capabilities }): ReactElement {
  const navigate = useNavigate();
  const aliases = readAliases(document);
  const models = readModels(document);
  const modelByKey = new Map(models.map(model => [model.key, model]));
  const selected = aliases.find(alias => alias.key === search.alias);

  const columns: TableColumn<AliasEntry>[] = [
    {
      id: 'label',
      header: 'Alias',
      cell: row => (
        <span className={styles.aliasCell}>
          <span>{row.label}</span>
          <Mono>{row.key}</Mono>
        </span>
      ),
    },
    {
      id: 'model',
      header: 'Target model',
      cell: row => {
        const model = modelByKey.get(row.model);
        return (
          <span className={styles.aliasCell}>
            <span>{model ? `${model.label}${model.version ? ` ${model.version}` : ''}` : 'Unknown model'}</span>
            <Mono>{row.model}</Mono>
          </span>
        );
      },
    },
    {
      id: 'state',
      header: 'State',
      cell: row => (
        <Badge intent={STATE_INTENT[row.state]} variant="soft" dot>
          {row.state}
        </Badge>
      ),
    },
    { id: 'showVersion', header: 'Shows version', cell: row => (row.showVersion ? 'Yes' : <Muted>No</Muted>) },
    { id: 'available', header: 'Available', cell: row => <Muted>{describeAvailability(row.available)}</Muted> },
    {
      id: '_impact',
      header: <span className="sr-only">Impact</span>,
      align: 'end',
      cell: row => (
        <Button
          variant={row.key === selected?.key ? 'secondary' : 'ghost'}
          size="sm"
          aria-pressed={row.key === selected?.key}
          aria-label={`Impact of retargeting ${row.label}`}
          onClick={() => void navigate({ to: '/aliases', search: { alias: row.key } })}
        >
          Impact
        </Button>
      ),
    },
  ];

  return (
    <>
      <Table data={aliases} columns={columns} rowKey="key" aria-label="Aliases in the active catalog" emptyState="The active catalog defines no aliases." />
      {selected ? (
        <AliasImpactPanel key={selected.key} alias={selected} models={models} candidate={search.model} activeDocument={document} capabilities={capabilities} />
      ) : search.alias ? (
        <Alert intent="warning" title={`The active catalog has no alias "${search.alias}"`} className={styles.result} />
      ) : null}
    </>
  );
}
