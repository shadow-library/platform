import { Link } from '@tanstack/react-router';
import { type ReactElement, type ReactNode, useMemo, useState } from 'react';
import { Alert, Button, EmptyState, Input, Popover, SearchIcon, Spinner, Table, type TableColumn, Tag } from '@shadow-library/ui';

import { type ActiveCatalogState, type CatalogDocument, type ModelEntry, readModels, readProviders, useActiveCatalog } from '@/features/catalog';
import { changeResultNotice, useChangeFlow } from '@/features/changes';
import {
  EditIcon,
  formatPrice,
  type IssueNotice,
  IssueNoticeAlert,
  LiveVersionHint,
  modelDisplayName,
  Mono,
  Muted,
  PageHeader,
  PermissionGate,
  RemoveIcon,
  RowAction,
  RowActions,
} from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { type Capabilities, useCapabilities } from '@/lib';

import { ModelCompare } from './ModelCompare';
import { ModelEditor } from './ModelEditor';
import { type EditorMode, emptyModelForm, modelFormOf, removeModelEdit } from './model-form';
import {
  CAPABILITY_FILTER_NAMES,
  CAPABILITY_FILTERS,
  capabilityChips,
  type CapabilityFilter,
  filterModels,
  isInUse,
  keepVisible,
  modelKeysOf,
  type ModelUsage,
  modelUsageIndex,
  servedBy,
  sortModels,
  unreadableModelCount,
  usageOf,
  usageSentence,
  usageSummary,
} from './model-view';
import styles from './Models.module.css';

const COMPARE_MIN = 2;
const COMPARE_MAX = 3;

type EditorState = { mode: EditorMode; model?: ModelEntry } | null;

export function ModelsScreen(): ReactElement {
  const capabilities = useCapabilities();
  return (
    <PermissionGate allowed={capabilities.readCatalog} area="the model catalog">
      <ModelsView capabilities={capabilities} />
    </PermissionGate>
  );
}

function ModelsView({ capabilities }: { capabilities: Capabilities }): ReactElement {
  const active = useActiveCatalog();
  const [editor, setEditor] = useState<EditorState>(null);
  const [notice, setNotice] = useState<IssueNotice | null>(null);
  const document = active.status === 'ready' ? active.document : null;

  const header = (
    <PageHeader
      title="Models"
      subtitle="The models features can use: their prices, what they can do, and who serves them."
      action={
        capabilities.writeCatalog && active.status !== 'loading' && active.status !== 'error' ? (
          <Button variant="primary" onClick={() => setEditor({ mode: { kind: 'add' } })}>
            Add model
          </Button>
        ) : null
      }
    />
  );

  const handleSaved = (next: IssueNotice | null): void => {
    setEditor(null);
    setNotice(next);
  };

  return (
    <>
      {header}
      {notice ? <IssueNoticeAlert notice={notice} onDismiss={() => setNotice(null)} className={styles.notice} /> : null}
      <CatalogBody active={active} capabilities={capabilities} onEdit={setEditor} onNotice={setNotice} />
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

interface CatalogBodyProps {
  active: ActiveCatalogState;
  capabilities: Capabilities;
  onEdit: (editor: EditorState) => void;
  onNotice: (notice: IssueNotice | null) => void;
}

function CatalogBody({ active, capabilities, onEdit, onNotice }: CatalogBodyProps): ReactElement {
  switch (active.status) {
    case 'loading':
      return (
        <div className={controls.loading}>
          <Spinner aria-label="Loading models" />
        </div>
      );
    case 'error':
      return (
        <Alert intent="danger" title="Couldn't load the catalog">
          {active.error.message}
        </Alert>
      );
    case 'none':
      return (
        <EmptyState
          title="No catalog yet"
          description={capabilities.writeCatalog ? 'Add a model to start the catalog.' : 'Models appear here once a first catalog version goes live.'}
        />
      );
    case 'ready':
      return (
        <>
          <LiveVersionHint version={active.version} canEdit={capabilities.writeCatalog} readOnlyNote="Editing models needs permission to change the catalog." />
          <ModelTable document={active.document} capabilities={capabilities} onEdit={onEdit} onNotice={onNotice} />
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
  onNotice: (notice: IssueNotice | null) => void;
}

function ModelTable({ document, capabilities, onEdit, onNotice }: ModelTableProps): ReactElement {
  const flow = useChangeFlow();
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
    const name = modelDisplayName(model);
    setRemoving(model.key);
    const warning = { title: `This removes ${name}`, body: 'Nothing uses it any more. You can add it again later.' };
    const outcome = await flow.confirmChange(removeModelEdit(model.key), { warning });
    setRemoving(null);
    if (outcome.kind === 'applied') setSelection(current => current.filter(key => key !== model.key));
    onNotice(changeResultNotice(outcome, name, 'removed'));
  };

  const columns: TableColumn<ModelEntry>[] = [
    {
      id: 'model',
      header: 'Model',
      cell: row => (
        <span className={styles.cell}>
          <span>{modelDisplayName(row)}</span>
          <Mono>{row.key}</Mono>
          <ServedBy model={row} providerKeys={providerKeys} />
        </span>
      ),
    },
    {
      id: 'input',
      header: 'Input',
      align: 'end',
      cell: row => (
        <span className={styles.cell}>
          <span className={controls.tabular}>{formatPrice(row.pricePerMTok.input)}</span>
          {row.pricePerMTok.cachedInput === undefined ? null : <Muted>{formatPrice(row.pricePerMTok.cachedInput)} cached</Muted>}
        </span>
      ),
    },
    {
      id: 'output',
      header: 'Output',
      align: 'end',
      cell: row => (
        <span className={styles.cell}>
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
    { id: 'usedBy', header: 'Used by', cell: row => <UsedBy usage={usageOf(usage, row.key)} /> },
  ];

  if (capabilities.writeCatalog)
    columns.push({
      id: '_actions',
      header: <span className="sr-only">Actions</span>,
      align: 'end',
      cell: row => {
        const rowUsage = usageOf(usage, row.key);
        const name = modelDisplayName(row);
        const inUse = isInUse(rowUsage);
        return (
          <RowActions>
            <RowAction icon={<EditIcon />} label={`Edit ${name}`} tooltip="Edit" onClick={() => onEdit({ mode: { kind: 'edit', key: row.key }, model: row })} />
            <RowAction
              icon={<RemoveIcon />}
              label={inUse ? `Remove ${name}: unavailable. ${usageSentence(rowUsage)}` : `Remove ${name}`}
              tooltip={inUse ? `${usageSentence(rowUsage)}. Move them to another model first.` : 'Remove'}
              danger
              disabled={inUse || flow.pending}
              loading={removing === row.key && flow.pending}
              onClick={() => void handleRemove(row)}
            />
          </RowActions>
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
    if (index > 0) parts.push(<span key={`then-${index}`}>, then </span>);
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
  return <Muted>Served by {parts}</Muted>;
}
