import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type ReactElement, useMemo, useState } from 'react';
import { Alert, Badge, Button, EmptyState, Spinner, Table, type TableColumn, Tag } from '@shadow-library/ui';

import { type ActiveCatalogState, type CatalogDocument, readProviders, useActiveCatalog } from '@/features/catalog';
import { changeResultNotice, useChangeFlow } from '@/features/changes';
import {
  EditIcon,
  formatNumber,
  formatRate,
  type IssueNotice,
  IssueNoticeAlert,
  LiveVersionHint,
  Mono,
  Muted,
  PageHeader,
  PermissionGate,
  RemoveIcon,
  RowAction,
  RowActions,
  SectionHeader,
} from '@/features/shared';
import cells from '@/features/shared/cells.module.css';
import controls from '@/features/shared/controls.module.css';
import { type Capabilities, credentialsQueryOptions, providersQueryOptions, type ProvidersResponse, useCapabilities } from '@/lib';

import { type CredentialList, credentialListOf, CredentialPicker, LegacyKeyBadge, listedCredentials } from './CredentialPicker';
import { ProviderEditor } from './ProviderEditor';
import { assignCredentialEdit, emptyProviderForm, keySnapshotOf, type ProviderEditorMode, providerFormOf, removeProviderEdit } from './provider-form';
import {
  errorRateIntent,
  featureName,
  healthWindowSentence,
  legacyKeyLabel,
  providerFacts,
  providerKeysOf,
  providerKeyStatus,
  type ProviderKeyStatus,
  type ProviderRow,
  providerRows,
  providerUsers,
  strandedNotice,
  type StrandedProvider,
  strandedProviders,
  unreadableProviderCount,
  usersSentence,
} from './provider-view';
import styles from './Providers.module.css';

interface EditorState {
  mode: ProviderEditorMode;
  row?: ProviderRow;
}

export function ProvidersScreen(): ReactElement {
  const capabilities = useCapabilities();
  return (
    <PermissionGate allowed={capabilities.readCatalog} area="the model catalog">
      <ProvidersView capabilities={capabilities} />
    </PermissionGate>
  );
}

function ProvidersView({ capabilities }: { capabilities: Capabilities }): ReactElement {
  const active = useActiveCatalog();
  const credentials = useQuery({ ...credentialsQueryOptions(), enabled: capabilities.manageCredentials });
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [notice, setNotice] = useState<IssueNotice | null>(null);
  const canEdit = capabilities.writeCatalog && capabilities.writeProviders;
  const credentialList = credentialListOf(capabilities.manageCredentials, credentials);
  const document = active.status === 'ready' ? active.document : null;

  const handleSaved = (next: IssueNotice | null): void => {
    setEditor(null);
    setNotice(next);
  };

  return (
    <>
      <PageHeader
        title="Providers"
        subtitle="The services that run our models, how they are holding up, and the API key each one uses."
        action={
          canEdit && active.status !== 'loading' && active.status !== 'error' ? (
            <Button variant="primary" onClick={() => setEditor({ mode: { kind: 'add' } })}>
              Add provider
            </Button>
          ) : null
        }
      />
      {notice ? <IssueNoticeAlert notice={notice} onDismiss={() => setNotice(null)} className={styles.notice} /> : null}
      <CatalogBody active={active} capabilities={capabilities} credentials={credentialList} onEdit={setEditor} onNotice={setNotice} />
      {editor ? (
        <ProviderEditor
          mode={editor.mode}
          initial={editor.row ? providerFormOf(editor.row.entry) : emptyProviderForm()}
          takenKeys={document ? providerKeysOf(document) : []}
          credentials={credentialList}
          onClose={() => setEditor(null)}
          onSaved={handleSaved}
        />
      ) : null}
    </>
  );
}

interface CatalogBodyProps {
  active: ActiveCatalogState;
  capabilities: Capabilities;
  credentials: CredentialList;
  onEdit: (editor: EditorState) => void;
  onNotice: (notice: IssueNotice | null) => void;
}

function CatalogBody({ active, capabilities, credentials, onEdit, onNotice }: CatalogBodyProps): ReactElement {
  const canEdit = capabilities.writeCatalog && capabilities.writeProviders;
  switch (active.status) {
    case 'loading':
      return (
        <div className={controls.loading}>
          <Spinner aria-label="Loading providers" />
        </div>
      );
    case 'error':
      return (
        <Alert intent="danger" title="Couldn't load the catalog">
          {active.error.message}
        </Alert>
      );
    case 'none':
      return <EmptyState title="No catalog yet" description={canEdit ? 'Add a provider to start the catalog.' : 'Providers appear here once a first catalog version goes live.'} />;
    case 'ready':
      return (
        <>
          <LiveVersionHint version={active.version} canEdit={canEdit} readOnlyNote="Editing providers needs permission to change the catalog and its providers." />
          <ProviderTable document={active.document} capabilities={capabilities} credentials={credentials} onEdit={onEdit} onNotice={onNotice} />
          {credentials.status === 'not_allowed' ? (
            <p className={controls.hint}>Your role cannot list stored API keys, so only whether one is set is shown and none can be picked.</p>
          ) : null}
          {credentials.status === 'error' ? <p className={controls.hint}>Couldn&apos;t load the stored API keys: {credentials.message}</p> : null}
        </>
      );
  }
}

function KeyStatusText({ status }: { status: ProviderKeyStatus }): ReactElement {
  switch (status.kind) {
    case 'not_needed':
      return <Muted>Not needed</Muted>;
    case 'none':
      return <Muted>No key</Muted>;
    case 'legacy_setting':
      return <>{legacyKeyLabel(false)}</>;
    case 'configured':
      return <>Set in the old environment key setting</>;
    case 'missing':
      return (
        <Badge intent="danger" variant="soft">
          The old environment key setting is empty
        </Badge>
      );
    case 'credential':
      return status.name ? <>{status.name}</> : <>Stored key</>;
    case 'credential_revoked':
      return (
        <Badge intent="danger" variant="soft">
          {status.name} is revoked
        </Badge>
      );
    case 'credential_unknown':
      return (
        <Badge intent="danger" variant="soft">
          Stored key not found
        </Badge>
      );
  }
}

function HealthCell({ row, column }: { row: ProviderRow; column: 'calls' | 'errors' | 'errorRate' }): ReactElement {
  const { health } = row;
  if (health.kind === 'unavailable') return <Muted>—</Muted>;
  if (column === 'calls') return <span className={controls.tabular}>{formatNumber(health.calls)}</span>;
  if (column === 'errors') return <span className={controls.tabular}>{formatNumber(health.errors)}</span>;
  if (health.errorRate === undefined) return <Muted>No calls</Muted>;
  return (
    <Badge intent={errorRateIntent(health.errorRate)} variant="soft">
      {formatRate(health.errorRate)}
    </Badge>
  );
}

interface StrandedAlertProps {
  stranded: StrandedProvider;
  busy: boolean;
  onSwitch: (credentialId: string) => void;
}

function StrandedAlert({ stranded, busy, onSwitch }: StrandedAlertProps): ReactElement {
  const { title, body } = strandedNotice(stranded);
  const { fix } = stranded;
  const action = fix.kind === 'use' && !busy ? { label: `Switch to “${fix.credential.name}”`, onClick: () => onSwitch(fix.credential.id) } : undefined;
  return (
    <Alert intent="danger" title={title} action={action} className={styles.notice}>
      {body}
      {fix.kind === 'add' ? (
        <>
          {' '}
          <Link to="/credentials">Open Credentials</Link>
        </>
      ) : null}
    </Alert>
  );
}

function healthSubtitle(health: ProvidersResponse | undefined): string | undefined {
  return health ? healthWindowSentence(health.windowHours, health.catalogVersion) : undefined;
}

interface ProviderTableProps {
  document: CatalogDocument;
  capabilities: Capabilities;
  credentials: CredentialList;
  onEdit: (editor: EditorState) => void;
  onNotice: (notice: IssueNotice | null) => void;
}

function ProviderTable({ document, capabilities, credentials, onEdit, onNotice }: ProviderTableProps): ReactElement {
  const flow = useChangeFlow();
  const [busy, setBusy] = useState<string | null>(null);
  const health = useQuery(providersQueryOptions());
  const editable = capabilities.writeCatalog && capabilities.writeProviders;
  const listed = listedCredentials(credentials);

  const readable = useMemo(() => readProviders(document), [document]);
  const rows = useMemo(() => providerRows({ document, health: health.data?.providers }), [document, health.data]);
  const unreadable = unreadableProviderCount(document, readable);
  const stranded = strandedProviders(rows, listed, editable && capabilities.manageCredentials);

  const assign = async (row: ProviderRow, credentialId: string | null): Promise<void> => {
    onNotice(null);
    setBusy(row.key);
    const outcome = await flow.confirmChange(assignCredentialEdit(row.key, keySnapshotOf(row.entry), credentialId));
    setBusy(null);
    onNotice(changeResultNotice(outcome, row.name, 'updated'));
  };

  const remove = async (row: ProviderRow): Promise<void> => {
    onNotice(null);
    setBusy(row.key);
    const warning = { title: `This removes ${row.name}`, body: 'No model uses it any more. You can add it again later.' };
    const outcome = await flow.confirmChange(removeProviderEdit(row.key), { warning });
    setBusy(null);
    onNotice(changeResultNotice(outcome, row.name, 'removed'));
  };

  const keyCell = (row: ProviderRow): ReactElement => {
    const { entry } = row;
    const status = providerKeyStatus(row, listed);
    if (entry.kind === 'ollama' && entry.credential !== undefined)
      return (
        <span className={styles.cell}>
          <span className={styles.issueMessage}>Names a stored key, but Ollama never sends one</span>
          {editable ? (
            <span>
              <Button variant="secondary" size="sm" aria-label={`Remove the API key of ${row.name}`} disabled={flow.pending} onClick={() => void assign(row, null)}>
                Remove key
              </Button>
            </span>
          ) : null}
        </span>
      );
    if (!editable || listed === undefined || entry.kind === 'ollama')
      return (
        <span className={styles.cell}>
          {entry.apiKeyConfig && entry.kind !== 'ollama' ? <LegacyKeyBadge apiKeyConfig={entry.apiKeyConfig} alongside={entry.credential !== undefined} /> : null}
          {status.kind === 'legacy_setting' || status.kind === 'configured' ? null : <KeyStatusText status={status} />}
        </span>
      );
    return (
      <span className={styles.cell}>
        <CredentialPicker
          providerName={row.name}
          url={entry.url}
          value={entry.credential ?? ''}
          {...(entry.apiKeyConfig !== undefined && { apiKeyConfig: entry.apiKeyConfig })}
          credentials={listed}
          disabled={flow.pending}
          onChange={id => void assign(row, id)}
        />
        {status.kind === 'credential_revoked' || status.kind === 'credential_unknown' || status.kind === 'missing' ? <KeyStatusText status={status} /> : null}
      </span>
    );
  };

  const columns: TableColumn<ProviderRow>[] = [
    {
      id: 'provider',
      header: 'Provider',
      cell: row => (
        <span className={styles.cell}>
          <span className={styles.inline}>
            <span>{row.name}</span>
          </span>
          <span className={styles.tags}>
            <Muted>{providerFacts(row.entry)}</Muted>
            {row.entry.features.map(feature => (
              <Tag key={feature} size="sm">
                {featureName(feature)}
              </Tag>
            ))}
          </span>
          <Mono>{row.key}</Mono>
          <span className={cells.url}>{row.entry.url || 'No address'}</span>
        </span>
      ),
    },
    { id: 'apiKey', header: 'API key', cell: keyCell },
    { id: 'calls', header: 'Calls', align: 'end', cell: row => <HealthCell row={row} column="calls" /> },
    { id: 'errors', header: 'Errors', align: 'end', cell: row => <HealthCell row={row} column="errors" /> },
    { id: 'errorRate', header: 'Error rate', align: 'end', cell: row => <HealthCell row={row} column="errorRate" /> },
  ];

  if (editable)
    columns.push({
      id: '_actions',
      header: <span className="sr-only">Actions</span>,
      align: 'end',
      cell: row => {
        const users = providerUsers(document, row.key);
        const inUse = users.length > 0;
        return (
          <RowActions>
            <RowAction icon={<EditIcon />} label={`Edit ${row.name}`} tooltip="Edit" onClick={() => onEdit({ mode: { kind: 'edit', key: row.key }, row })} />
            <RowAction
              icon={<RemoveIcon />}
              label={inUse ? `Remove ${row.name}: unavailable. ${usersSentence(users)}` : `Remove ${row.name}`}
              tooltip={inUse ? `${usersSentence(users)}. Move those models to another provider first.` : 'Remove'}
              danger
              disabled={inUse || flow.pending}
              loading={busy === row.key && flow.pending}
              onClick={() => void remove(row)}
            />
          </RowActions>
        );
      },
    });

  return (
    <section className={styles.section} aria-label="Providers">
      <SectionHeader title="Providers and their health" subtitle={healthSubtitle(health.data)} />
      {unreadable > 0 ? (
        <Alert intent="warning" title={`${unreadable === 1 ? '1 provider' : `${unreadable} providers`} couldn't be read`} className={styles.notice}>
          Their settings are malformed, so they aren’t listed. Fix them in the <Link to="/advanced">Advanced editor</Link>.
        </Alert>
      ) : null}
      {health.error ? (
        <Alert intent="warning" title="Couldn't load how providers are doing" className={styles.notice}>
          {health.error.message} The settings below are still accurate; calls and errors are missing.
        </Alert>
      ) : null}
      {stranded.map(item => (
        <StrandedAlert key={item.row.key} stranded={item} busy={flow.pending} onSwitch={credentialId => void assign(item.row, credentialId)} />
      ))}
      <Table
        data={rows}
        columns={columns}
        rowKey="key"
        loading={health.isLoading && rows.length === 0}
        aria-label="Providers, their API keys and error rates"
        emptyState={editable ? 'The catalog names no providers yet. Add one to get started.' : 'The catalog names no providers yet.'}
      />
    </section>
  );
}
