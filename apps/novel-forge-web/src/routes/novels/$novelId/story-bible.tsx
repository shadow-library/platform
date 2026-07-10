/**
 * Importing npm packages
 */
import { Button, Dialog, FormField, IconButton, Input, Select, Textarea, Tooltip, toast } from '@shadow-library/ui';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';

/**
 * Importing user defined modules
 */
import { ChevronDownIcon, PlusIcon, SparkIcon, TrashIcon } from '@/components/icons';
import { AssetBox, PaneError, PaneLoader, RowAction, StatusChip, detailPaneStyle, railStyle, splitPaneStyle } from '@/components/nf';
import { ForgeBar } from '@/components/nf/ForgeBar';
import {
  type CreateEntityBody,
  type EntityResponse,
  type EntityType,
  type UpdateEntityBody,
  useAuditBibleMutation,
  useCreateEntityMutation,
  useDeleteEntityMutation,
  useEntityQuery,
  useListEntitiesQuery,
  useProjectQuery,
  useSeedFromBriefMutation,
  useUpdateEntityMutation,
} from '@/lib/apis';
import { coverColor } from '@/lib/format';

export const Route = createFileRoute('/novels/$novelId/story-bible')({
  component: StoryBibleScreen,
});

const TYPE_ORDER: EntityType[] = ['character', 'faction', 'location', 'power_rule', 'item', 'concept'];
const TYPE_LABEL: Record<EntityType, string> = {
  character: 'Characters',
  faction: 'Factions',
  location: 'Locations',
  power_rule: 'Power rules',
  item: 'Items',
  concept: 'Concepts',
};
const TYPE_SINGULAR: Record<EntityType, string> = {
  character: 'Character',
  faction: 'Faction',
  location: 'Location',
  power_rule: 'Power rule',
  item: 'Item',
  concept: 'Concept',
};

type BibleCategory = EntityType | 'all';

const TYPE_ICON: Record<BibleCategory, [string, string]> = {
  all: ['M3 3h7v7H3z M14 3h7v7h-7z M14 14h7v7h-7z M3 14h7v7H3z', ''],
  character: ['M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8'],
  faction: ['M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z', 'M4 22v-7'],
  location: ['M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z', 'M12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z'],
  power_rule: ['M13 2L3 14h9l-1 8 10-12h-9l1-8z', ''],
  item: ['M21 8l-9-5-9 5v8l9 5 9-5V8z', 'M3 8l9 5 9-5M12 13v10'],
  concept: ['M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z', ''],
};

interface TypeGlyphProps {
  type: BibleCategory;
  size: number;
}

function TypeGlyph({ type, size }: TypeGlyphProps): React.JSX.Element {
  const [d1, d2] = TYPE_ICON[type];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
      <path d={d1} />
      {d2 && <path d={d2} />}
    </svg>
  );
}

function iconTile(size: number, radius: number, background: string, color: string): React.CSSProperties {
  return { width: size, height: size, borderRadius: radius, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background, color };
}

interface TypePickerProps {
  active: BibleCategory;
  counts: Map<EntityType, number>;
  onPick: (category: BibleCategory) => void;
}

function TypePicker({ active, counts, onPick }: TypePickerProps): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const pick = (category: BibleCategory): void => {
    onPick(category);
    setOpen(false);
  };

  return (
    <div style={{ position: 'relative' }}>
      <button type="button" className="nf-btrigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(prev => !prev)}>
        <span style={iconTile(34, 9, 'var(--sh-accent)', 'var(--sh-on-accent)')}>
          <TypeGlyph type={active} size={18} />
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--sh-text-tertiary)' }}>Showing</span>
          <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: 'var(--sh-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {active === 'all' ? 'All types' : TYPE_LABEL[active]}
          </span>
        </span>
        <ChevronDownIcon size={17} style={{ color: 'var(--sh-text-secondary)', flexShrink: 0 }} />
      </button>
      {open && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 59 }} onClick={() => setOpen(false)} />
          <div
            role="menu"
            style={{
              position: 'absolute',
              top: 'calc(100% + 6px)',
              left: 0,
              right: 0,
              zIndex: 60,
              background: 'var(--sh-surface-raised)',
              border: '1px solid var(--sh-border-default)',
              borderRadius: 'var(--sh-radius-lg)',
              boxShadow: 'var(--sh-shadow-e3)',
              padding: 6,
            }}
          >
            <button type="button" className="nf-menuitem" data-active={active === 'all' || undefined} onClick={() => pick('all')}>
              <span style={iconTile(28, 7, 'var(--sh-accent-soft)', 'var(--sh-accent)')}>
                <TypeGlyph type="all" size={15} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--sh-text-primary)' }}>All types</span>
                <span style={{ display: 'block', fontSize: 11, color: 'var(--sh-text-tertiary)' }}>Browse everything as cards</span>
              </span>
            </button>
            <div style={{ height: 1, background: 'var(--sh-border-subtle)', margin: '5px 6px' }} />
            {TYPE_ORDER.map(type => (
              <button key={type} type="button" className="nf-menuitem" data-active={active === type || undefined} onClick={() => pick(type)}>
                <span style={iconTile(28, 7, 'var(--sh-surface-well)', 'var(--sh-text-secondary)')}>
                  <TypeGlyph type={type} size={15} />
                </span>
                <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: 'var(--sh-text-primary)' }}>{TYPE_LABEL[type]}</span>
                <span style={{ fontFamily: 'var(--sh-font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--sh-text-tertiary)' }}>{counts.get(type) ?? 0}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

interface BibleOverviewProps {
  entities: EntityResponse[];
  counts: Map<EntityType, number>;
  onOpen: (type: EntityType) => void;
}

function BibleOverview({ entities, counts, onOpen }: BibleOverviewProps): React.JSX.Element {
  return (
    <>
      <div style={{ height: 60, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 11, padding: '0 24px' }}>
        <h2 style={{ margin: 0, fontSize: 'var(--sh-text-h3)', fontWeight: 700, letterSpacing: '-0.01em' }}>Story Bible</h2>
        <span style={{ fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-tertiary)' }}>All types · {entities.length} entities</span>
      </div>
      <div className="nf-scroll" style={{ flex: 1, minHeight: 0 }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '8px 24px 60px' }}>
          <p style={{ margin: '0 0 20px', fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-secondary)' }}>
            Pick a category to browse its entries — or use the type selector on the left.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 14 }}>
            {TYPE_ORDER.map(type => {
              const sample = entities
                .filter(e => e.type === type)
                .slice(0, 3)
                .map(e => e.name)
                .join(' · ');
              return (
                <button key={type} type="button" className="nf-catcard" onClick={() => onOpen(type)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <span style={iconTile(40, 11, 'var(--sh-accent-soft)', 'var(--sh-accent)')}>
                      <TypeGlyph type={type} size={20} />
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 'var(--sh-text-body)', fontWeight: 700, color: 'var(--sh-text-primary)' }}>{TYPE_LABEL[type]}</div>
                      <div style={{ fontFamily: 'var(--sh-font-mono)', fontSize: 11, color: 'var(--sh-text-tertiary)' }}>{counts.get(type) ?? 0} entries</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--sh-text-tertiary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {sample || 'No entries yet'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}

interface EntityFormState {
  entityKey: string;
  name: string;
  type: EntityType;
  significance: 'major' | 'minor';
  status: string;
  notes: string;
  motivation: string;
  body: string;
}

function emptyForm(type: EntityType): EntityFormState {
  return { entityKey: '', name: '', type, significance: 'minor', status: '', notes: '', motivation: '', body: '' };
}

interface EntityDialogState {
  mode: 'create' | 'edit';
  initial: EntityFormState;
}

const SECTION_LABEL: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: 'var(--sh-text-tertiary)',
  marginBottom: 6,
};

interface EntityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  initial: EntityFormState;
  onSubmit: (form: EntityFormState) => void;
  pending: boolean;
}

function EntityDialog({ open, onOpenChange, mode, initial, onSubmit, pending }: EntityDialogProps): React.JSX.Element {
  const [form, setForm] = useState(initial);
  useEffect(() => {
    if (open) setForm(initial);
  }, [open, initial]);
  const set = <K extends keyof EntityFormState>(key: K, value: EntityFormState[K]): void => setForm(prev => ({ ...prev, [key]: value }));
  const invalid = !form.name.trim() || (mode === 'create' && !form.entityKey.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="md">
        <Dialog.Header title={mode === 'create' ? 'New entity' : 'Edit entity'} />
        <Dialog.Body>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <FormField label="Name" required>
                <Input value={form.name} onValueChange={v => set('name', v)} autoFocus />
              </FormField>
              {mode === 'create' ? (
                <FormField label="Key" required helper="Stable id, e.g. mare-velan">
                  <Input value={form.entityKey} onValueChange={v => set('entityKey', v)} />
                </FormField>
              ) : (
                <FormField label="Type">
                  <Select value={form.type} onValueChange={v => set('type', v as EntityType)}>
                    {TYPE_ORDER.map(t => (
                      <Select.Item key={t} value={t}>
                        {TYPE_SINGULAR[t]}
                      </Select.Item>
                    ))}
                  </Select>
                </FormField>
              )}
            </div>
            {mode === 'create' && (
              <FormField label="Type">
                <Select value={form.type} onValueChange={v => set('type', v as EntityType)}>
                  {TYPE_ORDER.map(t => (
                    <Select.Item key={t} value={t}>
                      {TYPE_SINGULAR[t]}
                    </Select.Item>
                  ))}
                </Select>
              </FormField>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <FormField label="Significance">
                <Select value={form.significance} onValueChange={v => set('significance', v as 'major' | 'minor')}>
                  <Select.Item value="major">Major</Select.Item>
                  <Select.Item value="minor">Minor</Select.Item>
                </Select>
              </FormField>
              <FormField label="Status">
                <Input value={form.status} onValueChange={v => set('status', v)} placeholder="e.g. alive, active" />
              </FormField>
            </div>
            <FormField label="Summary">
              <Textarea value={form.body} onValueChange={v => set('body', v)} minRows={3} autoGrow />
            </FormField>
            <FormField label="Motivation">
              <Textarea value={form.motivation} onValueChange={v => set('motivation', v)} minRows={2} autoGrow />
            </FormField>
            <FormField label="Notes">
              <Textarea value={form.notes} onValueChange={v => set('notes', v)} minRows={2} autoGrow />
            </FormField>
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" loading={pending} disabled={invalid} onClick={() => onSubmit(form)}>
            {mode === 'create' ? 'Create entity' : 'Save changes'}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

interface EntityDetailProps {
  novelId: string;
  entityKey: string;
  onEdit: (entity: EntityResponse) => void;
}

function EntityDetail({ novelId, entityKey, onEdit }: EntityDetailProps): React.JSX.Element {
  const entityQuery = useEntityQuery(novelId, entityKey);

  if (entityQuery.isLoading) return <PaneLoader />;
  if (entityQuery.error) return <PaneError error={entityQuery.error} />;
  const entity = entityQuery.data;
  if (!entity) return <PaneLoader />;

  return (
    <>
      <div style={{ height: 60, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 12, padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 11, minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 'var(--sh-text-h3)', fontWeight: 700, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>{entity.name}</h2>
          <span style={{ fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-tertiary)' }}>
            {TYPE_SINGULAR[entity.type]} · {entity.significance || 'minor'}
          </span>
        </div>
        <div style={{ flex: 1 }} />
        <Button variant="ghost" onClick={() => onEdit(entity)}>
          Edit
        </Button>
      </div>
      <div className="nf-scroll" style={{ flex: 1, minHeight: 0 }}>
        <div style={{ maxWidth: 740, margin: '0 auto', padding: '16px 24px 120px', display: 'grid', gridTemplateColumns: '196px 1fr', gap: 30 }}>
          <div>
            <div style={{ aspectRatio: '3 / 4', borderRadius: 'var(--sh-radius-lg)', overflow: 'hidden', boxShadow: 'var(--sh-shadow-e2)' }}>
              {entity.imagePath ? (
                <img src={entity.imagePath} alt={entity.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <AssetBox height={261} color={coverColor(entity.id)} radius={0} />
              )}
            </div>
          </div>
          <div>
            {entity.body && (
              <>
                <div style={SECTION_LABEL}>Summary</div>
                <p style={{ margin: '0 0 22px', fontSize: 'var(--sh-text-body)', lineHeight: 1.65 }}>{entity.body}</p>
              </>
            )}
            {entity.motivation && (
              <>
                <div style={SECTION_LABEL}>Motivation</div>
                <p style={{ margin: '0 0 22px', fontSize: 'var(--sh-text-body)', lineHeight: 1.65, color: 'var(--sh-text-secondary)' }}>{entity.motivation}</p>
              </>
            )}
            {entity.notes && (
              <>
                <div style={SECTION_LABEL}>Notes</div>
                <p style={{ margin: '0 0 22px', fontSize: 'var(--sh-text-body)', lineHeight: 1.65, color: 'var(--sh-text-secondary)' }}>{entity.notes}</p>
              </>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {entity.status && <StatusChip intent="neutral">{entity.status}</StatusChip>}
              {entity.origin && <StatusChip intent="info">{entity.origin}</StatusChip>}
              {entity.firstSeenChapter != null && <StatusChip intent="neutral">first seen · ch. {entity.firstSeenChapter}</StatusChip>}
            </div>
          </div>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          bottom: 22,
          width: 'min(680px, calc(100% - 60px))',
          display: 'flex',
          justifyContent: 'center',
          zIndex: 5,
        }}
      >
        <ForgeBar
          novelId={novelId}
          scope={{ type: 'novel', title: entity.name }}
          placeholder={`Ask Forge to update ${entity.name} — add a detail, change a trait, note a new relationship…`}
        />
      </div>
    </>
  );
}

interface BibleEmptyPaneProps {
  brief?: string;
  pending: boolean;
  onGenerate: () => void;
  onSettings: () => void;
}

function BibleEmptyPane({ brief, pending, onGenerate, onSettings }: BibleEmptyPaneProps): React.JSX.Element {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', textAlign: 'center', padding: 32 }}>
      <div
        style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--sh-accent-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 18 }}
      >
        <SparkIcon size={24} style={{ color: 'var(--sh-accent)' }} />
      </div>
      <h2 style={{ margin: '0 0 8px', fontSize: 'var(--sh-text-h3)', fontWeight: 700 }}>Draft the story bible</h2>
      <p style={{ margin: '0 0 22px', maxWidth: 420, fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-secondary)', lineHeight: 1.6 }}>
        Forge reads your brief and drafts the world, cast, factions, locations, and plot — the canon every chapter is checked against. This runs the full bible builder and can take
        a few minutes.
      </p>
      {brief ? (
        <Button variant="primary" prefix={<SparkIcon />} loading={pending} onClick={onGenerate}>
          Generate story bible
        </Button>
      ) : (
        <Button variant="secondary" onClick={onSettings}>
          Add a brief in Settings
        </Button>
      )}
    </div>
  );
}

function StoryBibleScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const navigate = useNavigate();
  const entitiesQuery = useListEntitiesQuery(novelId, { limit: 500 });
  const entities = useMemo(() => entitiesQuery.data?.items ?? [], [entitiesQuery.data]);
  const createEntity = useCreateEntityMutation(novelId);
  const projectQuery = useProjectQuery(novelId);
  const seed = useSeedFromBriefMutation(novelId);
  const [activeType, setActiveType] = useState<BibleCategory>('all');
  const [selectedKey, setSelectedKey] = useState<string | undefined>();
  const [dialog, setDialog] = useState<EntityDialogState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EntityResponse | undefined>();

  const updateEntity = useUpdateEntityMutation(novelId, dialog?.mode === 'edit' ? dialog.initial.entityKey : '');
  const deleteEntity = useDeleteEntityMutation(novelId);

  const doDelete = (): void => {
    if (!deleteTarget) return;
    deleteEntity.mutate(deleteTarget.entityKey, {
      onSuccess: () => {
        toast.success(`Deleted “${deleteTarget.name}”`);
        setDeleteTarget(undefined);
        if (deleteTarget.entityKey === selectedKey) setSelectedKey(undefined);
      },
      onError: err => toast.danger(err.message),
    });
  };

  const counts = useMemo(() => {
    const map = new Map<EntityType, number>();
    for (const e of entities) map.set(e.type, (map.get(e.type) ?? 0) + 1);
    return map;
  }, [entities]);

  const visible = useMemo(() => (activeType === 'all' ? entities : entities.filter(e => e.type === activeType)), [entities, activeType]);

  useEffect(() => {
    if (activeType === 'all') return;
    if (visible.length > 0 && !visible.some(e => e.entityKey === selectedKey)) setSelectedKey(visible[0]!.entityKey);
  }, [activeType, visible, selectedKey]);

  const pickCategory = (category: BibleCategory): void => {
    setActiveType(category);
    if (category === 'all') setSelectedKey(undefined);
  };

  const submit = (form: EntityFormState): void => {
    if (dialog?.mode === 'create') {
      const body: CreateEntityBody = {
        entityKey: form.entityKey.trim(),
        type: form.type,
        name: form.name.trim(),
        significance: form.significance,
        status: form.status || undefined,
        notes: form.notes || undefined,
        motivation: form.motivation || undefined,
        body: form.body || undefined,
      };
      createEntity.mutate(body, {
        onSuccess: created => {
          toast.success(`Created “${created.name}”`);
          setDialog(null);
          setActiveType(created.type);
          setSelectedKey(created.entityKey);
        },
        onError: err => toast.danger(err.message),
      });
    } else {
      const body: UpdateEntityBody = {
        name: form.name.trim(),
        significance: form.significance,
        status: form.status || undefined,
        notes: form.notes || undefined,
        motivation: form.motivation || undefined,
        body: form.body || undefined,
      };
      updateEntity.mutate(body, {
        onSuccess: () => {
          toast.success('Entity updated');
          setDialog(null);
        },
        onError: err => toast.danger(err.message),
      });
    }
  };

  const brief = projectQuery.data?.brief?.trim();
  const bibleEmpty = !entitiesQuery.isLoading && !entitiesQuery.error && entities.length === 0;
  const audit = useAuditBibleMutation(novelId);
  const runAudit = (): void => {
    toast.success('Auditing the bible — this reads every document and can take a minute.');
    audit.mutate(undefined, {
      onSuccess: result =>
        result.findings.length === 0
          ? toast.success('Audit clean — no contradictions found.')
          : toast.success(`Audit found ${result.findings.length} issue${result.findings.length === 1 ? '' : 's'} — review the staged proposal.`),
      onError: err => toast.danger(err.message),
    });
  };
  const runSeed = (): void => {
    if (!brief) {
      toast.danger('Add a project brief in Settings before generating the bible.');
      return;
    }
    toast.success('Generating story bible — this can take a few minutes.');
    seed.mutate(
      { brief },
      {
        onSuccess: () => toast.success('Story bible generated'),
        onError: err => toast.danger(err.message),
      },
    );
  };

  return (
    <div style={splitPaneStyle}>
      <div style={railStyle}>
        <div style={{ padding: '14px 16px 12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 13 }}>
            <span style={{ fontSize: 'var(--sh-text-body)', fontWeight: 700 }}>Story Bible</span>
            <div style={{ flex: 1 }} />
            <Tooltip content="New entity">
              <IconButton
                variant="ghost"
                size="sm"
                aria-label="New entity"
                icon={<PlusIcon />}
                onClick={() => setDialog({ mode: 'create', initial: emptyForm(activeType === 'all' ? 'character' : activeType) })}
              />
            </Tooltip>
          </div>
          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--sh-text-tertiary)', marginBottom: 6 }}>Entity type</div>
          <TypePicker active={activeType} counts={counts} onPick={pickCategory} />
        </div>
        <div className="nf-scroll" style={{ flex: 1, padding: '2px 8px 8px' }}>
          {entitiesQuery.isLoading && <PaneLoader />}
          {entitiesQuery.error && <PaneError error={entitiesQuery.error} />}
          {!entitiesQuery.isLoading && visible.length === 0 && (
            <div style={{ padding: 16, fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-tertiary)' }}>
              No {activeType === 'all' ? 'entities' : TYPE_LABEL[activeType].toLowerCase()} yet.
            </div>
          )}
          {visible.map(entity => {
            const selected = entity.entityKey === selectedKey;
            const subtitle = activeType === 'all' ? TYPE_SINGULAR[entity.type] : entity.status;
            return (
              <div
                key={entity.id}
                role="button"
                tabIndex={0}
                className="nf-selrow"
                data-active={selected || undefined}
                style={{ gap: 11, padding: '9px 10px' }}
                onClick={() => setSelectedKey(entity.entityKey)}
                onKeyDown={e => e.key === 'Enter' && setSelectedKey(entity.entityKey)}
              >
                <div style={{ width: 30, height: 30, borderRadius: 8, background: coverColor(entity.id), flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    className="nf-entname"
                    style={{ fontSize: 'var(--sh-text-body-sm)', fontWeight: 600, color: 'var(--sh-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textAlign: 'left' }}
                  >
                    {entity.name}
                  </div>
                  {subtitle && <div style={{ fontSize: 11, color: 'var(--sh-text-tertiary)', textAlign: 'left' }}>{subtitle}</div>}
                </div>
                <span style={{ fontSize: 10, color: 'var(--sh-text-tertiary)', flexShrink: 0 }}>{entity.significance ?? ''}</span>
                <div className="nf-rowactions">
                  <RowAction label={`Delete ${entity.name}`} danger onClick={() => setDeleteTarget(entity)}>
                    <TrashIcon size={13} />
                  </RowAction>
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: 12, borderTop: '1px solid var(--sh-border-subtle)' }}>
          <Button variant="ghost" size="sm" fullWidth loading={audit.isPending} disabled={bibleEmpty} onClick={runAudit}>
            Run bible audit
          </Button>
        </div>
      </div>

      <div style={{ ...detailPaneStyle, position: 'relative' }}>
        {selectedKey ? (
          <EntityDetail
            novelId={novelId}
            entityKey={selectedKey}
            onEdit={entity =>
              setDialog({
                mode: 'edit',
                initial: {
                  entityKey: entity.entityKey,
                  name: entity.name,
                  type: entity.type,
                  significance: entity.significance ?? 'minor',
                  status: entity.status ?? '',
                  notes: entity.notes ?? '',
                  motivation: entity.motivation ?? '',
                  body: entity.body ?? '',
                },
              })
            }
          />
        ) : bibleEmpty ? (
          <BibleEmptyPane brief={brief} pending={seed.isPending} onGenerate={runSeed} onSettings={() => navigate({ to: '/novels/$novelId/settings', params: { novelId } })} />
        ) : activeType === 'all' ? (
          <BibleOverview entities={entities} counts={counts} onOpen={pickCategory} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--sh-text-tertiary)' }}>
            Select an entity to see its detail.
          </div>
        )}
      </div>

      {dialog && (
        <EntityDialog
          open
          onOpenChange={next => !next && setDialog(null)}
          mode={dialog.mode}
          initial={dialog.initial}
          pending={createEntity.isPending || updateEntity.isPending}
          onSubmit={submit}
        />
      )}

      <Dialog open={Boolean(deleteTarget)} onOpenChange={o => !o && setDeleteTarget(undefined)}>
        <Dialog.Content size="sm">
          <Dialog.Header title={`Delete “${deleteTarget?.name ?? 'this entity'}”?`} description="This removes the entity from the story bible. It cannot be undone." />
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="danger" loading={deleteEntity.isPending} onClick={doDelete}>
              Delete entity
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>
    </div>
  );
}
