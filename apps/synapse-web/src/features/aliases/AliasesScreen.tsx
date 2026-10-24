import { Link, useNavigate } from '@tanstack/react-router';
import { type ReactElement, useMemo, useState } from 'react';
import { Alert, Badge, Button, EmptyState, Spinner, Table, type TableColumn } from '@shadow-library/ui';

import { type CatalogDocument, useActiveCatalog, useDraft } from '@/features/catalog';
import { Mono, Muted, PageHeader, PermissionGate } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { type ApiError, type Capabilities, useCapabilities } from '@/lib';

import { type AliasEditorMode, aliasFormOf, emptyAliasForm } from './alias-form';
import { ALIAS_STATE_INFO, aliasKeysOf, type AliasRow, aliasRows, changedAliasKeys, type AliasFeedback as Notice, unreadableAliasCount } from './alias-view';
import { AliasEditor } from './AliasEditor';
import { AliasImpactPanel } from './AliasImpactPanel';
import { AliasNotice } from './AliasNotice';
import styles from './Aliases.module.css';

export interface AliasesSearch {
  alias?: string;
  model?: string;
}

type WorkingSource = { kind: 'draft'; activeVersion: number | null } | { kind: 'active'; version: number };

type WorkingCatalog =
  | { status: 'loading' }
  | { status: 'error'; error: ApiError }
  | { status: 'none' }
  | { status: 'ready'; document: CatalogDocument; active: CatalogDocument | null; source: WorkingSource };

type EditorState = { mode: AliasEditorMode; row?: AliasRow } | null;

export function AliasesScreen({ search }: { search: AliasesSearch }): ReactElement {
  const capabilities = useCapabilities();
  return (
    <PermissionGate allowed={capabilities.readCatalog} area="the model catalog">
      <AliasesView search={search} capabilities={capabilities} />
    </PermissionGate>
  );
}

function useWorkingCatalog(): WorkingCatalog {
  const active = useActiveCatalog();
  const draft = useDraft();
  if (active.status === 'error') return { status: 'error', error: active.error };
  if (draft.status === 'error') return { status: 'error', error: draft.error };
  if (active.status === 'loading' || draft.status === 'loading') return { status: 'loading' };
  const activeDocument = active.status === 'ready' ? active.document : null;
  const saved = draft.draft?.draft.document;
  if (saved) return { status: 'ready', document: saved, active: activeDocument, source: { kind: 'draft', activeVersion: active.status === 'ready' ? active.version : null } };
  if (active.status === 'ready') return { status: 'ready', document: active.document, active: active.document, source: { kind: 'active', version: active.version } };
  return { status: 'none' };
}

function AliasesView({ search, capabilities }: { search: AliasesSearch; capabilities: Capabilities }): ReactElement {
  const working = useWorkingCatalog();
  const [editor, setEditor] = useState<EditorState>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const ready = working.status === 'ready' ? working : null;

  const header = (
    <PageHeader
      title="Model names"
      subtitle="The names people pick a model by, such as Opus. Each points to one model, so moving a name changes what everyone who picked it gets."
      action={
        capabilities.writeDraft && ready ? (
          <Button variant="primary" onClick={() => setEditor({ mode: { kind: 'add' } })}>
            Add model name
          </Button>
        ) : null
      }
    />
  );

  const handleSaved = (next: Notice): void => {
    setEditor(null);
    setNotice(next);
  };

  return (
    <>
      {header}
      {notice ? <AliasNotice notice={notice} onDismiss={() => setNotice(null)} className={styles.notice} /> : null}
      <WorkingBody working={working} search={search} capabilities={capabilities} onEdit={setEditor} />
      {editor && ready ? (
        <AliasEditor
          mode={editor.mode}
          initial={editor.row ? aliasFormOf(editor.row.entry) : emptyAliasForm()}
          document={ready.document}
          takenKeys={[...new Set([...aliasKeysOf(ready.document), ...aliasKeysOf(ready.active)])]}
          usedBy={editor.row?.usedBy ?? []}
          onClose={() => setEditor(null)}
          onSaved={handleSaved}
        />
      ) : null}
    </>
  );
}

interface WorkingBodyProps {
  working: WorkingCatalog;
  search: AliasesSearch;
  capabilities: Capabilities;
  onEdit: (editor: EditorState) => void;
}

function WorkingBody({ working, search, capabilities, onEdit }: WorkingBodyProps): ReactElement {
  switch (working.status) {
    case 'loading':
      return (
        <div className={controls.loading}>
          <Spinner aria-label="Loading model names" />
        </div>
      );
    case 'error':
      return (
        <Alert intent="danger" title="Couldn't load the catalog">
          {working.error.message}
        </Alert>
      );
    case 'none':
      return <EmptyState title="No catalog yet" description="Model names appear here once a catalog version is published or a draft is started." />;
    case 'ready':
      return (
        <>
          <WorkingHint source={working.source} canEdit={capabilities.writeDraft} />
          <AliasTable working={working} search={search} capabilities={capabilities} onEdit={onEdit} />
        </>
      );
  }
}

function WorkingHint({ source, canEdit }: { source: WorkingSource; canEdit: boolean }): ReactElement {
  const permission = canEdit ? null : ' Changing model names needs permission to change the catalog.';
  if (source.kind === 'active')
    return (
      <p className={controls.hint}>
        Showing published version {source.version}. Saving a change starts a draft that changes nothing until it is published.{permission}
      </p>
    );
  return (
    <p className={controls.hint}>
      Showing the draft, including changes not yet published{source.activeVersion === null ? '; nothing has been published yet' : ` over version ${source.activeVersion}`}.{' '}
      <Link to="/changes">Review &amp; publish</Link>
      {permission}
    </p>
  );
}

interface AliasTableProps {
  working: Extract<WorkingCatalog, { status: 'ready' }>;
  search: AliasesSearch;
  capabilities: Capabilities;
  onEdit: (editor: EditorState) => void;
}

function AliasTable({ working, search, capabilities, onEdit }: AliasTableProps): ReactElement {
  const navigate = useNavigate();
  const { document, active, source } = working;
  const rows = useMemo(() => aliasRows(document, changedAliasKeys(active, source.kind === 'draft' ? document : null)), [document, active, source.kind]);
  const unreadable = unreadableAliasCount(document);
  const selected = rows.find(row => row.key === search.alias);

  const columns: TableColumn<AliasRow>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: row => (
        <span className={styles.stack}>
          <span className={styles.name}>
            {row.name}
            {row.changed ? (
              <Badge intent="info" variant="soft" size="sm">
                Unpublished changes
              </Badge>
            ) : null}
          </span>
          {row.description ? <Muted>{row.description}</Muted> : null}
          <Mono>{row.key}</Mono>
        </span>
      ),
    },
    {
      id: 'seen',
      header: 'What users see',
      cell: row => (
        <span>
          {row.seen}
          {row.showVersion ? <Muted> · version shown</Muted> : null}
        </span>
      ),
    },
    {
      id: 'target',
      header: 'Target model',
      cell: row => (
        <span className={styles.stack}>
          {row.target.name ? <span>{row.target.name}</span> : <span className={styles.problem}>Not in the catalog</span>}
          {row.target.price ? <Muted>{row.target.price}</Muted> : null}
          <Mono>{row.target.key}</Mono>
        </span>
      ),
    },
    {
      id: 'state',
      header: 'State',
      cell: row => (
        <span className={styles.stack}>
          <span>
            <Badge intent={ALIAS_STATE_INFO[row.state].intent} variant="soft" dot>
              {ALIAS_STATE_INFO[row.state].label}
            </Badge>
          </span>
          <Muted>{ALIAS_STATE_INFO[row.state].meaning}</Muted>
        </span>
      ),
    },
    { id: 'availability', header: 'Available when', cell: row => <span>{row.availability}</span> },
    {
      id: 'usedBy',
      header: 'Used by',
      cell: row =>
        row.usedBy.length === 0 ? (
          <Muted>No feature</Muted>
        ) : (
          <ul className={styles.users}>
            {row.usedBy.map(user => (
              <li key={user.key}>
                <Link to="/features/$task" params={{ task: user.key }}>
                  {user.title}
                </Link>
              </li>
            ))}
          </ul>
        ),
    },
    {
      id: '_actions',
      header: <span className="sr-only">Actions</span>,
      align: 'end',
      cell: row => (
        <div className={controls.rowActions}>
          {capabilities.writeDraft ? (
            <Button variant="ghost" size="sm" aria-label={`Edit ${row.name}`} onClick={() => onEdit({ mode: { kind: 'edit', key: row.key }, row })}>
              Edit
            </Button>
          ) : null}
          <Button
            variant={row.key === selected?.key ? 'secondary' : 'ghost'}
            size="sm"
            aria-pressed={row.key === selected?.key}
            aria-label={`Impact of changing ${row.name}`}
            onClick={() => void navigate({ to: '/aliases', search: { alias: row.key } })}
          >
            Impact
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      {unreadable > 0 ? (
        <Alert intent="warning" title={`${unreadable === 1 ? '1 model name' : `${unreadable} model names`} couldn't be read`} className={styles.notice}>
          Their settings are incomplete, so they aren’t listed. Fix them in the <Link to="/advanced">Advanced editor</Link>.
        </Alert>
      ) : null}
      <Table data={rows} columns={columns} rowKey="key" aria-label="Model names" emptyState="The catalog has no model names yet." />
      {selected ? (
        <AliasImpactPanel key={selected.key} alias={selected} workingDocument={document} activeDocument={active} candidate={search.model} capabilities={capabilities} />
      ) : search.alias ? (
        <Alert intent="warning" title={`The catalog has no model name "${search.alias}"`} className={styles.result} />
      ) : null}
    </>
  );
}
