import { Link, useNavigate } from '@tanstack/react-router';
import { type ReactElement, useMemo, useRef, useState } from 'react';
import { Alert, Badge, Button, EmptyState, Spinner, Table, type TableColumn } from '@shadow-library/ui';

import { useWorkingCatalog, type WorkingCatalog, type WorkingSource } from '@/features/catalog';
import { type DraftNotice, DraftNoticeAlert, EditIcon, ImpactIcon, Mono, Muted, PageHeader, PermissionGate, RowAction, RowActions } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { type Capabilities, useCapabilities } from '@/lib';

import { type AliasEditorMode, aliasFormOf, emptyAliasForm } from './alias-form';
import { ALIAS_STATE_INFO, aliasKeysOf, type AliasRow, aliasRows, changedAliasKeys, seenNote, unreadableAliasCount } from './alias-view';
import { AliasEditor } from './AliasEditor';
import { AliasImpactPanel } from './AliasImpactPanel';
import styles from './Aliases.module.css';

export interface AliasesSearch {
  alias?: string;
  model?: string;
}

type EditorState = { mode: AliasEditorMode; row?: AliasRow } | null;

export function AliasesScreen({ search }: { search: AliasesSearch }): ReactElement {
  const capabilities = useCapabilities();
  return (
    <PermissionGate allowed={capabilities.readCatalog} area="the model catalog">
      <AliasesView search={search} capabilities={capabilities} />
    </PermissionGate>
  );
}

function AliasesView({ search, capabilities }: { search: AliasesSearch; capabilities: Capabilities }): ReactElement {
  const working = useWorkingCatalog('required');
  const [editor, setEditor] = useState<EditorState>(null);
  const [notice, setNotice] = useState<DraftNotice | null>(null);
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

  const handleSaved = (next: DraftNotice): void => {
    setEditor(null);
    setNotice(next);
  };

  return (
    <>
      {header}
      {notice ? <DraftNoticeAlert notice={notice} onDismiss={() => setNotice(null)} className={styles.notice} /> : null}
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
  const impactButtons = useRef(new Map<string, HTMLButtonElement>());
  const { document, active, source } = working;
  const rows = useMemo(() => aliasRows(document, changedAliasKeys(active, source.kind === 'draft' ? document : null)), [document, active, source.kind]);
  const unreadable = unreadableAliasCount(document);
  const selected = rows.find(row => row.key === search.alias);

  const toggleImpact = (row: AliasRow): void => {
    void navigate({ to: '/aliases', search: row.key === selected?.key ? {} : { alias: row.key } });
  };

  const closeImpact = (aliasKey: string): void => {
    impactButtons.current.get(aliasKey)?.focus();
    void navigate({ to: '/aliases', search: {} });
  };

  const columns: TableColumn<AliasRow>[] = [
    {
      id: 'name',
      header: 'Name',
      cell: row => {
        const note = seenNote(row);
        return (
          <span className={styles.cell}>
            <span className={styles.name}>
              {row.name}
              {row.changed ? (
                <Badge intent="info" variant="soft" size="sm">
                  Unpublished changes
                </Badge>
              ) : null}
            </span>
            {row.description ? <Muted>{row.description}</Muted> : null}
            {note ? <Muted>{note}</Muted> : null}
            <Mono>{row.key}</Mono>
          </span>
        );
      },
    },
    {
      id: 'target',
      header: 'Target model',
      cell: row => (
        <span className={styles.cell}>
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
        <span className={styles.cell}>
          <span>
            <Badge intent={ALIAS_STATE_INFO[row.state].intent} variant="soft" dot>
              {ALIAS_STATE_INFO[row.state].label}
            </Badge>
          </span>
          <Muted>{ALIAS_STATE_INFO[row.state].meaning}</Muted>
        </span>
      ),
    },
    { id: 'availability', header: 'Available when', cell: row => <span className={styles.cell}>{row.availability}</span> },
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
        <RowActions>
          {capabilities.writeDraft ? (
            <RowAction icon={<EditIcon />} label={`Edit ${row.name}`} tooltip="Edit" onClick={() => onEdit({ mode: { kind: 'edit', key: row.key }, row })} />
          ) : null}
          <RowAction
            ref={node => {
              if (node) impactButtons.current.set(row.key, node);
              else impactButtons.current.delete(row.key);
            }}
            icon={<ImpactIcon />}
            label={`Impact of changing ${row.name}`}
            tooltip={row.key === selected?.key ? 'Close the impact' : 'Impact of changing it'}
            pressed={row.key === selected?.key}
            onClick={() => toggleImpact(row)}
          />
        </RowActions>
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
        <AliasImpactPanel
          key={selected.key}
          alias={selected}
          workingDocument={document}
          activeDocument={active}
          candidate={search.model}
          capabilities={capabilities}
          onClose={() => closeImpact(selected.key)}
        />
      ) : search.alias ? (
        <Alert intent="warning" title={`The catalog has no model name "${search.alias}"`} className={styles.result} />
      ) : null}
    </>
  );
}
