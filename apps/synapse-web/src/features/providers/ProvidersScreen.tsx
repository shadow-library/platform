import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type ReactElement, useMemo, useState } from 'react';
import { Alert, Badge, Button, EmptyState, Spinner, Table, type TableColumn, Tag, Tooltip, useConfirm } from '@shadow-library/ui';

import { type CatalogDocument, credentialIssuesByProvider, EMPTY_CATALOG, readProviders, useActiveCatalog, useDraft, useDraftEdit } from '@/features/catalog';
import { issueAdvice } from '@/features/credentials/credential-view';
import { draftOutcomeNotice, type ModelNotice } from '@/features/models/model-view';
import { NoticeAlert } from '@/features/models/NoticeAlert';
import { formatNumber, formatRate, Mono, Muted, PageHeader, PermissionGate, SectionHeader } from '@/features/shared';
import cells from '@/features/shared/cells.module.css';
import controls from '@/features/shared/controls.module.css';
import {
  type Capabilities,
  type CatalogIssueResponse,
  credentialsQueryOptions,
  draftValidationQueryOptions,
  providersQueryOptions,
  type ProvidersResponse,
  useCapabilities,
} from '@/lib';

import { type CredentialList, credentialListOf, CredentialPicker, LegacyKeyBadge, listedCredentials } from './CredentialPicker';
import { ProviderEditor } from './ProviderEditor';
import { assignCredentialEdit, emptyProviderForm, keySnapshotOf, type ProviderEditorMode, providerFormOf, removeProviderEdit } from './provider-form';
import {
  type CatalogSource,
  costName,
  defaultProviderNote,
  errorRateIntent,
  featureName,
  kindName,
  localityName,
  presenceLabel,
  providerKeysOf,
  providerKeyStatus,
  type ProviderKeyStatus,
  type ProviderRow,
  providerRows,
  providerUsers,
  unreadableProviderCount,
  usersSentence,
} from './provider-view';
import styles from './Providers.module.css';

type WorkingCatalog =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'none' }
  | { status: 'ready'; document: CatalogDocument; source: { kind: 'draft'; fingerprint: string } | { kind: 'active'; version: number } };

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

function useWorkingCatalog(): WorkingCatalog {
  const draft = useDraft();
  const saved = draft.status === 'ready' ? draft.draft : undefined;
  const active = useActiveCatalog(saved === null);
  if (draft.status === 'error') return { status: 'error', message: draft.error.message };
  if (saved) return { status: 'ready', document: saved.draft.document, source: { kind: 'draft', fingerprint: saved.fingerprint } };
  if (saved === undefined || active.status === 'loading') return { status: 'loading' };
  if (active.status === 'error') return { status: 'error', message: active.error.message };
  if (active.status === 'none') return { status: 'none' };
  return { status: 'ready', document: active.document, source: { kind: 'active', version: active.version } };
}

function ProvidersView({ capabilities }: { capabilities: Capabilities }): ReactElement {
  const working = useWorkingCatalog();
  const credentials = useQuery({ ...credentialsQueryOptions(), enabled: capabilities.manageCredentials });
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [notice, setNotice] = useState<ModelNotice | null>(null);
  const canEdit = capabilities.writeDraft && capabilities.writeProviders;
  const credentialList = credentialListOf(capabilities.manageCredentials, credentials);
  const document = working.status === 'ready' ? working.document : null;

  const handleSaved = (next: ModelNotice): void => {
    setEditor(null);
    setNotice(next);
  };

  return (
    <>
      <PageHeader
        title="Providers"
        subtitle="The services that run our models, how they are holding up, and the API key each one uses."
        action={
          canEdit && working.status !== 'loading' && working.status !== 'error' ? (
            <Button variant="primary" onClick={() => setEditor({ mode: { kind: 'add' } })}>
              Add provider
            </Button>
          ) : null
        }
      />
      {notice ? <NoticeAlert notice={notice} onDismiss={() => setNotice(null)} className={styles.notice} /> : null}
      <WorkingBody working={working} capabilities={capabilities} credentials={credentialList} onEdit={setEditor} onNotice={setNotice} />
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

interface WorkingBodyProps {
  working: WorkingCatalog;
  capabilities: Capabilities;
  credentials: CredentialList;
  onEdit: (editor: EditorState) => void;
  onNotice: (notice: ModelNotice) => void;
}

function WorkingBody({ working, capabilities, credentials, onEdit, onNotice }: WorkingBodyProps): ReactElement {
  const canEdit = capabilities.writeDraft && capabilities.writeProviders;
  switch (working.status) {
    case 'loading':
      return (
        <div className={controls.loading}>
          <Spinner aria-label="Loading providers" />
        </div>
      );
    case 'error':
      return (
        <Alert intent="danger" title="Couldn't load the catalog">
          {working.message}
        </Alert>
      );
    case 'none':
      return (
        <EmptyState title="No catalog yet" description={canEdit ? 'Add a provider to start a draft catalog.' : 'Providers appear here once a catalog version is published.'} />
      );
    case 'ready':
      return (
        <>
          <p className={controls.hint}>
            {working.source.kind === 'draft' ? 'Showing the draft, which may hold changes that aren’t live yet.' : `Showing published version ${working.source.version}.`} Changes
            here are saved to the shared draft; apps keep using the published providers until it is published on <Link to="/changes">Review &amp; publish</Link>.
            {canEdit ? null : ' Editing providers needs permission to change the catalog and its providers.'}
          </p>
          <ProviderTable
            document={working.document}
            source={working.source.kind}
            fingerprint={working.source.kind === 'draft' ? working.source.fingerprint : undefined}
            capabilities={capabilities}
            credentials={credentials}
            onEdit={onEdit}
            onNotice={onNotice}
          />
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
      return <>Old key setting</>;
    case 'configured':
      return <>Set (old key setting)</>;
    case 'missing':
      return (
        <Badge intent="danger" variant="soft">
          Old key setting is empty
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

function KeyIssues({ issues }: { issues: readonly CatalogIssueResponse[] }): ReactElement | null {
  if (issues.length === 0) return null;
  return (
    <>
      {issues.map(issue => (
        <span key={`${issue.path}:${issue.code}`} className={styles.issue}>
          <span className={styles.issueMessage}>{issue.message}</span>
          {issueAdvice(issue.code) ? <span className={styles.issueAdvice}>{issueAdvice(issue.code)}</span> : null}
        </span>
      ))}
    </>
  );
}

function HealthCell({ row, column }: { row: ProviderRow; column: 'calls' | 'errors' | 'errorRate' }): ReactElement {
  const { health } = row;
  if (health.kind === 'not_live') return column === 'calls' ? <Muted>Not live yet</Muted> : <Muted>—</Muted>;
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

function healthSubtitle(health: ProvidersResponse | undefined, source: CatalogSource): string | undefined {
  if (!health) return undefined;
  const window = `Calls and errors over the last ${health.windowHours} hours, from published version ${health.catalogVersion}.`;
  return source === 'draft' ? `${window} Providers only the draft has get numbers once it is published.` : window;
}

interface ProviderTableProps {
  document: CatalogDocument;
  source: CatalogSource;
  fingerprint: string | undefined;
  capabilities: Capabilities;
  credentials: CredentialList;
  onEdit: (editor: EditorState) => void;
  onNotice: (notice: ModelNotice) => void;
}

function ProviderTable({ document, source, fingerprint, capabilities, credentials, onEdit, onNotice }: ProviderTableProps): ReactElement {
  const confirm = useConfirm();
  const draftEdit = useDraftEdit();
  const [busy, setBusy] = useState<string | null>(null);
  const health = useQuery(providersQueryOptions());
  const validation = useQuery({ ...draftValidationQueryOptions(fingerprint ?? ''), enabled: capabilities.writeDraft && fingerprint !== undefined });
  const published = useActiveCatalog(source === 'draft');
  const canEdit = capabilities.writeDraft && capabilities.writeProviders;
  const listed = listedCredentials(credentials);
  const active = source === 'active' ? document : published.status === 'ready' ? published.document : published.status === 'none' ? EMPTY_CATALOG : undefined;

  const working = useMemo(() => readProviders(document), [document]);
  const rows = useMemo(() => providerRows({ working: document, active, health: health.data?.providers }), [document, active, health.data]);
  const issuesByProvider = useMemo(() => credentialIssuesByProvider(fingerprint === undefined ? [] : (validation.data?.issues ?? [])), [fingerprint, validation.data]);
  const unreadable = unreadableProviderCount(document, working);

  const assign = async (row: ProviderRow, credentialId: string | null): Promise<void> => {
    setBusy(row.key);
    const outcome = await draftEdit.apply(assignCredentialEdit(row.key, keySnapshotOf(row.entry), credentialId), defaultProviderNote(row.name, 'updated'));
    setBusy(null);
    onNotice(draftOutcomeNotice(outcome, row.name, 'updated'));
  };

  const remove = async (row: ProviderRow): Promise<void> => {
    const live = row.presence === 'live' || row.presence === 'changed';
    const confirmed = await confirm({
      title: `Remove ${row.name}?`,
      description: live ? 'The provider leaves the draft. Apps keep using it until the draft is published.' : 'The provider leaves the draft.',
      confirmLabel: 'Remove',
      intent: 'danger',
    });
    if (!confirmed) return;
    setBusy(row.key);
    const outcome = await draftEdit.apply(removeProviderEdit(row.key), defaultProviderNote(row.name, 'removed'));
    setBusy(null);
    onNotice(draftOutcomeNotice(outcome, row.name, 'removed'));
  };

  const keyCell = (row: ProviderRow): ReactElement => {
    const { entry } = row;
    const issues = issuesByProvider.get(row.key) ?? [];
    const status = providerKeyStatus(row, listed);
    const editable = canEdit && row.presence !== 'removed_in_draft';
    if (entry.kind === 'ollama' && entry.credential !== undefined)
      return (
        <span className={styles.stack}>
          <span className={styles.issueMessage}>Names a stored key, but Ollama never sends one</span>
          {editable ? (
            <span>
              <Button variant="secondary" size="sm" aria-label={`Remove the API key of ${row.name}`} disabled={draftEdit.pending} onClick={() => void assign(row, null)}>
                Remove key
              </Button>
            </span>
          ) : null}
          <KeyIssues issues={issues} />
        </span>
      );
    if (!editable || listed === undefined || entry.kind === 'ollama')
      return (
        <span className={styles.stack}>
          {entry.apiKeyConfig && entry.kind !== 'ollama' ? <LegacyKeyBadge apiKeyConfig={entry.apiKeyConfig} alongside={entry.credential !== undefined} /> : null}
          {status.kind === 'legacy_setting' || status.kind === 'configured' ? null : <KeyStatusText status={status} />}
          <KeyIssues issues={issues} />
        </span>
      );
    return (
      <span className={styles.stack}>
        <CredentialPicker
          providerName={row.name}
          url={entry.url}
          value={entry.credential ?? ''}
          {...(entry.apiKeyConfig !== undefined && { apiKeyConfig: entry.apiKeyConfig })}
          credentials={listed}
          disabled={draftEdit.pending}
          onChange={id => void assign(row, id)}
        />
        {status.kind === 'credential_revoked' || status.kind === 'credential_unknown' ? <KeyStatusText status={status} /> : null}
        <KeyIssues issues={issues} />
      </span>
    );
  };

  const columns: TableColumn<ProviderRow>[] = [
    {
      id: 'provider',
      header: 'Provider',
      cell: row => {
        const presence = presenceLabel(row.presence);
        return (
          <span className={styles.stack}>
            <span className={styles.inline}>
              <span>{row.name}</span>
              {presence ? (
                <Badge intent={row.presence === 'removed_in_draft' ? 'danger' : 'info'} variant="soft">
                  {presence}
                </Badge>
              ) : null}
            </span>
            <Mono>{row.key}</Mono>
            <span className={cells.url}>{row.entry.url || 'No address'}</span>
          </span>
        );
      },
    },
    { id: 'kind', header: 'Kind', cell: row => kindName(row.entry.kind, row.entry.flavor) },
    { id: 'locality', header: 'Where it runs', cell: row => localityName(row.entry.locality) },
    { id: 'cost', header: 'Cost', cell: row => costName(row.entry.cost) },
    {
      id: 'features',
      header: 'Features',
      cell: row =>
        row.entry.features.length === 0 ? (
          <Muted>—</Muted>
        ) : (
          <span className={styles.tags}>
            {row.entry.features.map(feature => (
              <Tag key={feature} size="sm">
                {featureName(feature)}
              </Tag>
            ))}
          </span>
        ),
    },
    { id: 'apiKey', header: 'API key', cell: keyCell },
    { id: 'calls', header: 'Calls', align: 'end', cell: row => <HealthCell row={row} column="calls" /> },
    { id: 'errors', header: 'Errors', align: 'end', cell: row => <HealthCell row={row} column="errors" /> },
    { id: 'errorRate', header: 'Error rate', align: 'end', cell: row => <HealthCell row={row} column="errorRate" /> },
  ];

  if (canEdit)
    columns.push({
      id: '_actions',
      header: <span className="sr-only">Actions</span>,
      align: 'end',
      cell: row => {
        if (row.presence === 'removed_in_draft') return <Muted>—</Muted>;
        const users = providerUsers(document, row.key);
        const removeButton = (
          <Button
            variant="ghost"
            size="sm"
            aria-label={users.length > 0 ? `Remove ${row.name}: unavailable. ${usersSentence(users)}` : `Remove ${row.name}`}
            disabled={users.length > 0 || draftEdit.pending}
            loading={busy === row.key && draftEdit.pending}
            onClick={() => void remove(row)}
          >
            Remove
          </Button>
        );
        return (
          <div className={controls.rowActions}>
            <Button variant="ghost" size="sm" aria-label={`Edit ${row.name}`} onClick={() => onEdit({ mode: { kind: 'edit', key: row.key }, row })}>
              Edit
            </Button>
            {users.length > 0 ? (
              <Tooltip content={`${usersSentence(users)}. Move those models to another provider first.`}>
                <span className={styles.disabledTrigger}>{removeButton}</span>
              </Tooltip>
            ) : (
              removeButton
            )}
          </div>
        );
      },
    });

  return (
    <section className={styles.section} aria-label="Providers">
      <SectionHeader title="Providers and their health" subtitle={healthSubtitle(health.data, source)} />
      {unreadable > 0 ? (
        <Alert intent="warning" title={`${unreadable === 1 ? '1 provider' : `${unreadable} providers`} couldn't be read`} className={styles.notice}>
          Their settings are malformed, so they aren’t listed. Fix them in the <Link to="/advanced">Advanced editor</Link>.
        </Alert>
      ) : null}
      {source === 'draft' && published.status === 'error' ? (
        <Alert intent="warning" title="Couldn't load the published catalog" className={styles.notice}>
          {published.error.message} Which providers are new, changed or removed in the draft isn’t marked.
        </Alert>
      ) : null}
      {health.error ? (
        <Alert intent="warning" title="Couldn't load how providers are doing" className={styles.notice}>
          {health.error.message} The settings below are still accurate; calls and errors are missing.
        </Alert>
      ) : null}
      <Table
        data={rows}
        columns={columns}
        rowKey="key"
        loading={health.isLoading && rows.length === 0}
        aria-label="Providers, their API keys and error rates"
        emptyState={canEdit ? 'The catalog names no providers yet. Add one to get started.' : 'The catalog names no providers yet.'}
      />
    </section>
  );
}
