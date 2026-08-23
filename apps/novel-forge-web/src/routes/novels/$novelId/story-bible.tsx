import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { Button, Dialog, FormField, IconButton, Input, Select, Textarea, toast, Tooltip } from '@shadow-library/ui';

import { ChevronDownIcon, PlusIcon, SparkIcon, TrashIcon } from '@/components/icons';
import { Markdown, PaneError, PaneLoader, RowAction, StatusChip } from '@/components/nf';
import { ForgeBar } from '@/components/nf/ForgeBar';
import { ImageGallery } from '@/components/nf/ImageGallery';
import { ImageUpload } from '@/components/nf/ImageUpload';
import {
  type CreateEntityBody,
  type EntityResponse,
  type EntityType,
  listEntitiesQueryOptions,
  type UpdateEntityBody,
  useAddEntityImageMutation,
  useAuditBibleMutation,
  useCreateEntityMutation,
  useDeleteEntityImageByIdMutation,
  useDeleteEntityImageMutation,
  useDeleteEntityMutation,
  useEntityQuery,
  useListEntitiesQuery,
  useProjectQuery,
  useSeedFromBriefMutation,
  useUpdateEntityMutation,
  useUploadEntityImageMutation,
} from '@/lib/apis';
import { coverColor } from '@/lib/format';

import styles from './story-bible.module.css';

interface BibleSearch {
  type?: EntityType;
  entity?: string;
}

// The active category and selected entity live in the URL so a refresh reopens the same entry.
export const Route = createFileRoute('/novels/$novelId/story-bible')({
  validateSearch: (search: Record<string, unknown>): BibleSearch => {
    const type = search.type;
    const valid = type === 'character' || type === 'faction' || type === 'location' || type === 'power_rule' || type === 'item' || type === 'concept';
    return {
      type: valid ? (type as EntityType) : undefined,
      entity: typeof search.entity === 'string' && search.entity ? search.entity : undefined,
    };
  },
  loader: ({ context, params }) => context.queryClient.prefetchQuery(listEntitiesQueryOptions(params.novelId, { limit: 500 })),
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
  return { '--tile-size': `${size}px`, '--tile-radius': `${radius}px`, '--tile-bg': background, '--tile-fg': color } as React.CSSProperties;
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
    <div className={styles.picker}>
      <button type="button" className="nf-btrigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(prev => !prev)}>
        <span className={styles.iconTile} style={iconTile(34, 9, 'var(--sh-accent)', 'var(--sh-on-accent)')}>
          <TypeGlyph type={active} size={18} />
        </span>
        <span className={styles.triggerLabel}>
          <span className={styles.showingLabel}>Showing</span>
          <span className={styles.showingValue}>{active === 'all' ? 'All types' : TYPE_LABEL[active]}</span>
        </span>
        <ChevronDownIcon size={17} className={styles.iconSecondary} />
      </button>
      {open && (
        <>
          <div role="presentation" className={styles.overlay} onClick={() => setOpen(false)} />
          <div role="menu" className={styles.menu}>
            <button type="button" className="nf-menuitem" data-active={active === 'all' || undefined} onClick={() => pick('all')}>
              <span className={styles.iconTile} style={iconTile(28, 7, 'var(--sh-accent-soft)', 'var(--sh-accent)')}>
                <TypeGlyph type="all" size={15} />
              </span>
              <span className={styles.menuItemText}>
                <span className={styles.menuItemTitle}>All types</span>
                <span className={styles.menuItemSub}>Browse everything as cards</span>
              </span>
            </button>
            <div className={styles.menuDivider} />
            {TYPE_ORDER.map(type => (
              <button key={type} type="button" className="nf-menuitem" data-active={active === type || undefined} onClick={() => pick(type)}>
                <span className={styles.iconTile} style={iconTile(28, 7, 'var(--sh-surface-well)', 'var(--sh-text-secondary)')}>
                  <TypeGlyph type={type} size={15} />
                </span>
                <span className={styles.menuItemLabel}>{TYPE_LABEL[type]}</span>
                <span className={styles.menuCount}>{counts.get(type) ?? 0}</span>
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
      <div className={styles.overviewHead}>
        <h2 className={styles.overviewTitle}>Story Bible</h2>
        <span className={styles.overviewMeta}>All types · {entities.length} entities</span>
      </div>
      <div className={`nf-scroll ${styles.paneScroll}`}>
        <div className={styles.overviewInner}>
          <p className={styles.overviewHint}>Pick a category to browse its entries — or use the type selector on the left.</p>
          <div className={styles.catGrid}>
            {TYPE_ORDER.map(type => {
              const sample = entities
                .filter(e => e.type === type)
                .slice(0, 3)
                .map(e => e.name)
                .join(' · ');
              return (
                <button key={type} type="button" className="nf-catcard" onClick={() => onOpen(type)}>
                  <div className={styles.catHead}>
                    <span className={styles.iconTile} style={iconTile(40, 11, 'var(--sh-accent-soft)', 'var(--sh-accent)')}>
                      <TypeGlyph type={type} size={20} />
                    </span>
                    <div className={styles.catInfo}>
                      <div className={styles.catTitle}>{TYPE_LABEL[type]}</div>
                      <div className={styles.catCount}>{counts.get(type) ?? 0} entries</div>
                    </div>
                  </div>
                  <div className={styles.catSample}>{sample || 'No entries yet'}</div>
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
  appearance: string;
  body: string;
}

function emptyForm(type: EntityType): EntityFormState {
  return { entityKey: '', name: '', type, significance: 'minor', status: '', notes: '', motivation: '', appearance: '', body: '' };
}

interface EntityDialogState {
  mode: 'create' | 'edit';
  initial: EntityFormState;
}

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
          <div className={styles.dialogForm}>
            <div className={styles.dialogGrid}>
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
            <div className={styles.dialogGrid}>
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
            <FormField label="Appearance" helper="The canonical visual description every generated illustration is anchored to, so re-rolls keep the same look.">
              <Textarea value={form.appearance} onValueChange={v => set('appearance', v)} minRows={2} autoGrow />
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

// Generated entity summaries lead with an `# <Name>` heading that repeats the title already shown above
// the summary. Drop a leading heading when its text is just the entity's own name, so the name isn't
// stated twice.
function stripEntityHeading(body: string, name: string): string {
  const match = /^\s*#{1,3}[ \t]+(.+?)[ \t]*(?:\r?\n|$)/.exec(body);
  if (!match?.[1]) return body;
  const headingText = match[1].replace(/[*_`]/g, '').trim().toLowerCase();
  if (headingText !== name.trim().toLowerCase()) return body;
  return body.slice(match[0].length).replace(/^\s+/, '');
}

function EntityDetail({ novelId, entityKey, onEdit }: EntityDetailProps): React.JSX.Element {
  const navigate = useNavigate();
  const entityQuery = useEntityQuery(novelId, entityKey);
  const uploadImage = useUploadEntityImageMutation(novelId, entityKey);
  const removeImage = useDeleteEntityImageMutation(novelId, entityKey);
  const addGalleryImage = useAddEntityImageMutation(novelId, entityKey);
  const removeGalleryImage = useDeleteEntityImageByIdMutation(novelId, entityKey);

  if (entityQuery.isLoading) return <PaneLoader />;
  if (entityQuery.error) return <PaneError error={entityQuery.error} />;
  const entity = entityQuery.data;
  if (!entity) return <PaneLoader />;

  return (
    <>
      <div className={styles.detailHead}>
        <div className={styles.detailTitleWrap}>
          <h2 className={styles.detailTitle}>{entity.name}</h2>
          <span className={styles.detailType}>
            {TYPE_SINGULAR[entity.type]} · {entity.significance || 'minor'}
          </span>
        </div>
        <div className={styles.spacer} />
        <Button
          variant="secondary"
          prefix={<SparkIcon />}
          onClick={() => navigate({ to: '/novels/$novelId/illustrations', params: { novelId }, search: { subject: 'entity', key: entityKey, start: true } })}
        >
          Generate portrait
        </Button>
        <Button variant="ghost" onClick={() => onEdit(entity)}>
          Edit
        </Button>
      </div>
      <div className={`nf-scroll ${styles.paneScroll}`}>
        <div className={styles.detailInner}>
          <div>
            <ImageUpload
              className={styles.cover}
              src={entity.imageUrl ?? undefined}
              alt={entity.name}
              uploading={uploadImage.isPending || removeImage.isPending}
              placeholder={<div className={styles.coverPlaceholder} style={{ background: coverColor(entity.id) }} />}
              onUpload={body => uploadImage.mutate(body, { onSuccess: () => toast.success(`Updated ${entity.name}’s image`), onError: e => toast.danger(e.message) })}
              onRemove={() => removeImage.mutate(undefined, { onSuccess: () => toast.success('Image removed'), onError: e => toast.danger(e.message) })}
            />
          </div>
          <div>
            {entity.body && (
              <>
                <div className={styles.sectionLabel}>Summary</div>
                <Markdown content={stripEntityHeading(entity.body, entity.name)} className={styles.para} />
              </>
            )}
            {entity.motivation && (
              <>
                <div className={styles.sectionLabel}>Motivation</div>
                <Markdown content={entity.motivation} className={`${styles.para} ${styles.paraMuted}`} />
              </>
            )}
            {entity.notes && (
              <>
                <div className={styles.sectionLabel}>Notes</div>
                <Markdown content={entity.notes} className={`${styles.para} ${styles.paraMuted}`} />
              </>
            )}
            <div className={styles.chips}>
              {entity.status && <StatusChip intent="neutral">{entity.status}</StatusChip>}
              {entity.origin && <StatusChip intent="info">{entity.origin}</StatusChip>}
              {entity.firstSeenChapter != null && <StatusChip intent="neutral">first seen · ch. {entity.firstSeenChapter}</StatusChip>}
            </div>

            <div className={styles.gallerySection}>
              <div className={styles.sectionLabel}>Gallery</div>
              <ImageGallery
                images={(entity.images ?? []).map(img => ({ id: img.id, url: img.imageUrl, caption: img.caption }))}
                busy={addGalleryImage.isPending || removeGalleryImage.isPending}
                addLabel="Add image"
                onAdd={body => addGalleryImage.mutate(body, { onSuccess: () => toast.success('Image added'), onError: e => toast.danger(e.message) })}
                onRemove={id => removeGalleryImage.mutate(id, { onSuccess: () => toast.success('Image removed'), onError: e => toast.danger(e.message) })}
              />
            </div>
          </div>
        </div>
      </div>

      <div className={styles.forgeDock}>
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
    <div className={styles.emptyPane}>
      <div className={styles.emptyIcon}>
        <SparkIcon size={24} className={styles.accentIcon} />
      </div>
      <h2 className={styles.emptyTitle}>Draft the story bible</h2>
      <p className={styles.emptyText}>
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
  const { type: typeParam, entity: entityParam } = Route.useSearch();
  const goSearch = Route.useNavigate();
  const entitiesQuery = useListEntitiesQuery(novelId, { limit: 500 });
  const entities = useMemo(() => entitiesQuery.data?.items ?? [], [entitiesQuery.data]);
  const createEntity = useCreateEntityMutation(novelId);
  const projectQuery = useProjectQuery(novelId);
  const seed = useSeedFromBriefMutation(novelId);
  const activeType: BibleCategory = typeParam ?? 'all';
  const [dialog, setDialog] = useState<EntityDialogState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EntityResponse | undefined>();

  const selectEntity = (key?: string): Promise<void> => goSearch({ search: { type: typeParam, entity: key } });

  const updateEntity = useUpdateEntityMutation(novelId, dialog?.mode === 'edit' ? dialog.initial.entityKey : '');
  const deleteEntity = useDeleteEntityMutation(novelId);

  const doDelete = (): void => {
    if (!deleteTarget) return;
    deleteEntity.mutate(deleteTarget.entityKey, {
      onSuccess: () => {
        toast.success(`Deleted “${deleteTarget.name}”`);
        setDeleteTarget(undefined);
        if (deleteTarget.entityKey === entityParam) selectEntity(undefined);
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

  // The selection is derived, not stored: the URL wins when it names a visible entity, otherwise a
  // specific category auto-focuses its first entry while "all" shows the category overview.
  const selectedKey = entityParam && visible.some(e => e.entityKey === entityParam) ? entityParam : activeType === 'all' ? undefined : visible[0]?.entityKey;

  const pickCategory = (category: BibleCategory): Promise<void> => goSearch({ search: { type: category === 'all' ? undefined : category } });

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
        appearance: form.appearance || undefined,
        body: form.body || undefined,
      };
      createEntity.mutate(body, {
        onSuccess: created => {
          toast.success(`Created “${created.name}”`);
          setDialog(null);
          goSearch({ search: { type: created.type, entity: created.entityKey } });
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
        appearance: form.appearance || undefined,
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
    <div className="nf-splitpane">
      <div className="nf-rail">
        <div className={styles.railHead}>
          <div className={styles.railTitleRow}>
            <span className={styles.railTitle}>Story Bible</span>
            <div className={styles.spacer} />
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
          <div className={styles.railEyebrow}>Entity type</div>
          <TypePicker active={activeType} counts={counts} onPick={pickCategory} />
        </div>
        <div className={`nf-scroll ${styles.railList}`}>
          {entitiesQuery.isLoading && <PaneLoader />}
          {entitiesQuery.error && <PaneError error={entitiesQuery.error} />}
          {!entitiesQuery.isLoading && visible.length === 0 && (
            <div className="nf-emptynote">No {activeType === 'all' ? 'entities' : TYPE_LABEL[activeType].toLowerCase()} yet.</div>
          )}
          {visible.map(entity => {
            const selected = entity.entityKey === selectedKey;
            const subtitle = activeType === 'all' ? TYPE_SINGULAR[entity.type] : entity.status;
            return (
              <div
                key={entity.id}
                role="button"
                tabIndex={0}
                className={`nf-selrow ${styles.entityRow}`}
                data-active={selected || undefined}
                onClick={() => selectEntity(entity.entityKey)}
                onKeyDown={e => e.key === 'Enter' && selectEntity(entity.entityKey)}
              >
                {entity.imageUrl ? (
                  <img src={entity.imageUrl} alt="" className={styles.entityThumb} />
                ) : (
                  <div className={styles.entityAvatar} style={{ '--nf-dot': coverColor(entity.id) } as React.CSSProperties} />
                )}
                <div className={styles.entityBody}>
                  <div className={`nf-entname ${styles.entityName}`}>{entity.name}</div>
                  {subtitle && <div className={styles.entitySub}>{subtitle}</div>}
                </div>
                <span className={styles.entitySig}>{entity.significance ?? ''}</span>
                <div className="nf-rowactions">
                  <RowAction label={`Delete ${entity.name}`} danger onClick={() => setDeleteTarget(entity)}>
                    <TrashIcon size={13} />
                  </RowAction>
                </div>
              </div>
            );
          })}
        </div>
        <div className={styles.railFooter}>
          <Button variant="ghost" size="sm" fullWidth loading={audit.isPending} disabled={bibleEmpty} onClick={runAudit}>
            Run bible audit
          </Button>
        </div>
      </div>

      <div className={`nf-detail ${styles.detailRelative}`}>
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
                  appearance: entity.appearance ?? '',
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
          <div className="nf-pane-empty">Select an entity to see its detail.</div>
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
