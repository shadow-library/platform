import { Link } from '@tanstack/react-router';
import { type ReactElement, type ReactNode, useMemo, useState } from 'react';
import { Alert, Button, EmptyState, Input, Popover, SearchIcon, Spinner, Table, type TableColumn, Tag, Tooltip, useConfirm } from '@shadow-library/ui';

import { type CatalogDocument, type ModelEntry, readModels, readProviders, useActiveCatalog, useDraft, useDraftEdit } from '@/features/catalog';
import { formatPrice, Mono, Muted, PageHeader, PermissionGate } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { type Capabilities, useCapabilities } from '@/lib';

import { ModelCompare } from './ModelCompare';
import { ModelEditor } from './ModelEditor';
import { type EditorMode, emptyModelForm, modelFormOf, removeModelEdit } from './model-form';
import {
  cachedInputLabel,
  CAPABILITY_FILTER_NAMES,
  CAPABILITY_FILTERS,
  capabilityChips,
  type CapabilityFilter,
  defaultModelNote,
  draftOutcomeNotice,
  filterModels,
  isInUse,
  keepVisible,
  modelKeysOf,
  type ModelNotice,
  modelTitle,
  type ModelUsage,
  modelUsageIndex,
  servedBy,
  sortModels,
  unreadableModelCount,
  usageOf,
  usageSentence,
  usageSummary,
} from './model-view';
import { NoticeAlert } from './NoticeAlert';
import styles from './Models.module.css';

const COMPARE_MIN = 2;
const COMPARE_MAX = 3;

type WorkingCatalog =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'none' }
  | { status: 'ready'; document: CatalogDocument; source: { kind: 'draft' } | { kind: 'active'; version: number } };

type EditorState = { mode: EditorMode; model?: ModelEntry } | null;

export function ModelsScreen(): ReactElement {
  const capabilities = useCapabilities();
  return (
    <PermissionGate allowed={capabilities.readCatalog} area="the model catalog">
      <ModelsView capabilities={capabilities} />
    </PermissionGate>
  );
}

function useWorkingCatalog(): WorkingCatalog {
  const draft = useDraft();
  const saved = draft.status === 'ready' ? draft.draft : undefined;
  const active = useActiveCatalog(saved === null);
  if (draft.status === 'error') return { status: 'error', message: draft.error.message };
  if (saved) return { status: 'ready', document: saved.draft.document, source: { kind: 'draft' } };
  if (saved === undefined || active.status === 'loading') return { status: 'loading' };
  if (active.status === 'error') return { status: 'error', message: active.error.message };
  if (active.status === 'none') return { status: 'none' };
  return { status: 'ready', document: active.document, source: { kind: 'active', version: active.version } };
}

function ModelsView({ capabilities }: { capabilities: Capabilities }): ReactElement {
  const working = useWorkingCatalog();
  const [editor, setEditor] = useState<EditorState>(null);
  const [notice, setNotice] = useState<ModelNotice | null>(null);
  const document = working.status === 'ready' ? working.document : null;

  const header = (
    <PageHeader
      title="Models"
      subtitle="The models features can use: their prices, what they can do, and who serves them."
      action={
        capabilities.writeDraft && working.status !== 'loading' && working.status !== 'error' ? (
          <Button variant="primary" onClick={() => setEditor({ mode: { kind: 'add' } })}>
            Add model
          </Button>
        ) : null
      }
    />
  );

  const handleSaved = (next: ModelNotice): void => {
    setEditor(null);
    setNotice(next);
  };

  return (
    <>
      {header}
      {notice ? <NoticeAlert notice={notice} onDismiss={() => setNotice(null)} className={styles.notice} /> : null}
      <WorkingBody working={working} capabilities={capabilities} onEdit={setEditor} onNotice={setNotice} />
      {editor ? (
        <ModelEditor
          mode={editor.mode}
          initial={editor.model ? modelFormOf(editor.model) : emptyModelForm()}
          providers={document ? readProviders(document) : []}
          takenKeys={document ? modelKeysOf(document) : []}
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
  onEdit: (editor: EditorState) => void;
  onNotice: (notice: ModelNotice) => void;
}

function WorkingBody({ working, capabilities, onEdit, onNotice }: WorkingBodyProps): ReactElement {
  switch (working.status) {
    case 'loading':
      return (
        <div className={controls.loading}>
          <Spinner aria-label="Loading models" />
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
        <EmptyState
          title="No catalog yet"
          description={capabilities.writeDraft ? 'Add a model to start a draft catalog.' : 'Models appear here once a catalog version is published.'}
        />
      );
    case 'ready':
      return (
        <>
          <p className={controls.hint}>
            {working.source.kind === 'draft' ? (
              <>
                Showing the draft, which may hold changes that aren’t live yet. <Link to="/changes">Review &amp; publish</Link>
              </>
            ) : (
              `Showing published version ${working.source.version}. Saving a change starts a draft.`
            )}
            {capabilities.writeDraft ? null : ' Editing models needs permission to change the catalog.'}
          </p>
          <ModelTable document={working.document} capabilities={capabilities} onEdit={onEdit} onNotice={onNotice} />
        </>
      );
  }
}

function UsedBy({ usage }: { usage: ModelUsage }): ReactElement {
  if (!isInUse(usage)) return <Muted>Not used</Muted>;
  const card = (
    <div className={styles.usageCard}>
      {usage.features.length > 0 ? (
        <div>
          <p className={styles.usageHeading}>Features</p>
          <ul className={styles.usageList}>
            {usage.features.map(feature => (
              <li key={feature.key}>
                <Link to="/features/$task" params={{ task: feature.key }}>
                  {feature.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {usage.modelNames.length > 0 ? (
        <div>
          <p className={styles.usageHeading}>Model names</p>
          <ul className={styles.usageList}>
            {usage.modelNames.map(alias => (
              <li key={alias.key}>{alias.name}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
  return (
    <Popover>
      <Popover.Trigger asChild>
        <button type="button" className={styles.usageTrigger} aria-label={`${usageSummary(usage)}: show where this model is used`}>
          {usageSummary(usage)}
        </button>
      </Popover.Trigger>
      <Popover.Content align="start" aria-label="Where this model is used">
        {card}
      </Popover.Content>
    </Popover>
  );
}

interface ModelTableProps {
  document: CatalogDocument;
  capabilities: Capabilities;
  onEdit: (editor: EditorState) => void;
  onNotice: (notice: ModelNotice) => void;
}

function ModelTable({ document, capabilities, onEdit, onNotice }: ModelTableProps): ReactElement {
  const confirm = useConfirm();
  const draftEdit = useDraftEdit();
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState<CapabilityFilter[]>([]);
  const [selection, setSelection] = useState<string[]>([]);
  const [comparing, setComparing] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);

  const models = useMemo(() => sortModels(readModels(document)), [document]);
  const usage = useMemo(() => modelUsageIndex(document), [document]);
  const providerKeys = useMemo(() => new Set(readProviders(document).map(provider => provider.key)), [document]);
  const visible = filterModels(models, { query, capabilities: filters });
  const visibleSelection = keepVisible(selection, visible);
  const selected = visible.filter(model => visibleSelection.includes(model.key));
  const unreadable = unreadableModelCount(document, models);
  const canCompare = selected.length >= COMPARE_MIN && selected.length <= COMPARE_MAX;

  const applyFilter = (nextQuery: string, nextFilters: CapabilityFilter[]): void => {
    setQuery(nextQuery);
    setFilters(nextFilters);
    setSelection(current => keepVisible(current, filterModels(models, { query: nextQuery, capabilities: nextFilters })));
  };

  const toggleFilter = (filter: CapabilityFilter): void => applyFilter(query, filters.includes(filter) ? filters.filter(item => item !== filter) : [...filters, filter]);

  const handleRemove = async (model: ModelEntry): Promise<void> => {
    const name = modelTitle(model);
    const confirmed = await confirm({
      title: `Remove ${name}?`,
      description: 'The model leaves the draft. It stays live until the draft is published.',
      confirmLabel: 'Remove',
      intent: 'danger',
    });
    if (!confirmed) return;
    setRemoving(model.key);
    const outcome = await draftEdit.apply(removeModelEdit(model.key), defaultModelNote(name, 'removed'));
    setRemoving(null);
    if (outcome.kind === 'saved') setSelection(current => current.filter(key => key !== model.key));
    onNotice(draftOutcomeNotice(outcome, name, 'removed'));
  };

  const columns: TableColumn<ModelEntry>[] = [
    {
      id: 'model',
      header: 'Model',
      cell: row => (
        <span className={styles.stack}>
          <span>{modelTitle(row)}</span>
          <Mono>{row.key}</Mono>
        </span>
      ),
    },
    { id: 'input', header: 'Input', align: 'end', cell: row => <span className={controls.tabular}>{formatPrice(row.pricePerMTok.input)}</span> },
    {
      id: 'cachedInput',
      header: 'Cached input',
      align: 'end',
      cell: row =>
        row.pricePerMTok.cachedInput === undefined ? (
          <Muted>{cachedInputLabel(row.pricePerMTok)}</Muted>
        ) : (
          <span className={controls.tabular}>{formatPrice(row.pricePerMTok.cachedInput)}</span>
        ),
    },
    {
      id: 'output',
      header: 'Output',
      align: 'end',
      cell: row => (
        <span className={styles.stack}>
          <span className={controls.tabular}>{formatPrice(row.pricePerMTok.output)}</span>
          {row.pricePerMTok.perImage === undefined ? null : <Muted>{formatPrice(row.pricePerMTok.perImage)} per image</Muted>}
        </span>
      ),
    },
    {
      id: 'capabilities',
      header: 'Can do',
      cell: row => {
        const chips = capabilityChips(row.capabilities);
        if (chips.length === 0) return <Muted>Text only</Muted>;
        return (
          <span className={styles.tags}>
            {chips.map(chip => (
              <Tag key={chip} size="sm">
                {chip}
              </Tag>
            ))}
          </span>
        );
      },
    },
    { id: 'servedBy', header: 'Served by', cell: row => <ServedBy model={row} providerKeys={providerKeys} /> },
    { id: 'usedBy', header: 'Used by', cell: row => <UsedBy usage={usageOf(usage, row.key)} /> },
  ];

  if (capabilities.writeDraft)
    columns.push({
      id: '_actions',
      header: <span className="sr-only">Actions</span>,
      align: 'end',
      cell: row => {
        const rowUsage = usageOf(usage, row.key);
        const name = modelTitle(row);
        const remove = (
          <Button
            variant="ghost"
            size="sm"
            aria-label={isInUse(rowUsage) ? `Remove ${name}: unavailable. ${usageSentence(rowUsage)}` : `Remove ${name}`}
            disabled={isInUse(rowUsage) || draftEdit.pending}
            loading={removing === row.key}
            onClick={() => void handleRemove(row)}
          >
            Remove
          </Button>
        );
        return (
          <div className={controls.rowActions}>
            <Button variant="ghost" size="sm" aria-label={`Edit ${name}`} onClick={() => onEdit({ mode: { kind: 'edit', key: row.key }, model: row })}>
              Edit
            </Button>
            {isInUse(rowUsage) ? (
              <Tooltip content={`${usageSentence(rowUsage)}. Move them to another model first.`}>
                <span className={styles.disabledTrigger}>{remove}</span>
              </Tooltip>
            ) : (
              remove
            )}
          </div>
        );
      },
    });

  return (
    <>
      {unreadable > 0 ? (
        <Alert intent="warning" title={`${unreadable === 1 ? '1 model' : `${unreadable} models`} couldn't be read`} className={styles.notice}>
          Their settings are incomplete, so they aren’t listed. Fix them in the <Link to="/advanced">Advanced editor</Link>.
        </Alert>
      ) : null}
      <div className={styles.filters} role="group" aria-label="Filter models">
        <Input
          className={styles.search}
          value={query}
          onValueChange={next => applyFilter(next, filters)}
          placeholder="Search by name or key"
          aria-label="Search models"
          prefix={<SearchIcon />}
          clearable
        />
        {CAPABILITY_FILTERS.map(filter => (
          <Button key={filter} variant={filters.includes(filter) ? 'secondary' : 'ghost'} size="sm" aria-pressed={filters.includes(filter)} onClick={() => toggleFilter(filter)}>
            {CAPABILITY_FILTER_NAMES[filter]}
          </Button>
        ))}
      </div>
      <Table
        data={visible}
        columns={columns}
        rowKey="key"
        selection={visibleSelection}
        onSelectionChange={setSelection}
        bulkActions={
          <>
            {canCompare ? null : <Muted>{selected.length < COMPARE_MIN ? 'Pick one more to compare' : `Compare up to ${COMPARE_MAX} at a time`}</Muted>}
            <Button variant="secondary" size="sm" disabled={!canCompare} onClick={() => setComparing(true)}>
              Compare
            </Button>
          </>
        }
        aria-label="Models"
        emptyState={models.length === 0 ? 'The catalog has no models yet.' : 'No models match these filters.'}
      />
      {comparing && canCompare ? <ModelCompare models={selected} usage={usage} providerKeys={providerKeys} onClose={() => setComparing(false)} /> : null}
    </>
  );
}

function ServedBy({ model, providerKeys }: { model: ModelEntry; providerKeys: ReadonlySet<string> }): ReactElement {
  const links = servedBy(model, providerKeys);
  if (links.length === 0) return <span className={styles.problem}>No provider</span>;
  const parts: ReactNode[] = [];
  links.forEach((link, index) => {
    if (index > 0) parts.push(<Muted key={`then-${index}`}> then </Muted>);
    parts.push(
      link.known ? (
        <span key={`${link.key}-${index}`}>{link.name}</span>
      ) : (
        <span key={`${link.key}-${index}`} className={styles.problem}>
          {link.name} (not in the catalog)
        </span>
      ),
    );
  });
  return <span>{parts}</span>;
}
