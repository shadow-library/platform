import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { Alert, Button, Dialog, FormField, IconButton, Input, Select, Textarea, toast, Tooltip } from '@shadow-library/ui';

import { SearchIcon, SparkIcon, TrashIcon } from '@/components/icons';
import { useCollectionJump } from '@/components/Layout';
import { CollectionPage, DetailPage, EmptyState, FieldCard, ItemPager, type ItemPagerJump, Markdown, PaneError, PaneLoader, StatusChip } from '@/components/nf';
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
  useListFactsQuery,
  useProjectQuery,
  useSeedFromBriefMutation,
  useUpdateEntityMutation,
  useUploadEntityImageMutation,
} from '@/lib/apis';
import { coverColor } from '@/lib/format';
import {
  ALL_TYPES,
  ASIDE_FACT_LIMIT,
  backLabel,
  type BibleCategory,
  type BibleEntity,
  countByType,
  entityCaption,
  entityFacts,
  filterEntities,
  groupByType,
  orderTypesByCount,
  parseEntityType,
  relatedEntities,
  sectionSlice,
  stripEntityHeading,
  TYPE_LABEL,
  TYPE_SINGULAR,
} from '@/lib/story-bible';

import styles from './story-bible.module.css';

interface BibleSearch {
  type?: EntityType;
  entity?: string;
}

// The active type and the open entity live in the URL so a refresh reopens the same entry.
export const Route = createFileRoute('/novels/$novelId/story-bible')({
  validateSearch: (search: Record<string, unknown>): BibleSearch => ({
    type: parseEntityType(search.type),
    entity: typeof search.entity === 'string' && search.entity ? search.entity : undefined,
  }),
  loader: ({ context, params }) => context.queryClient.prefetchQuery(listEntitiesQueryOptions(params.novelId, { limit: 500 })),
  component: StoryBibleScreen,
});

interface EntityAvatarProps {
  entity: BibleEntity;
  size: number;
}

function EntityAvatar({ entity, size }: EntityAvatarProps): React.JSX.Element {
  const style = { '--avatar-size': `${size}px`, '--avatar-fill': coverColor(entity.id) } as React.CSSProperties;
  if (entity.imageUrl) return <img src={entity.imageUrl} alt="" className={styles.avatar} style={style} />;
  return <span className={styles.avatar} style={style} aria-hidden="true" />;
}

interface EntityCardProps {
  novelId: string;
  entity: BibleEntity;
  type?: EntityType;
}

function EntityCard({ novelId, entity, type }: EntityCardProps): React.JSX.Element {
  return (
    <Link to="/novels/$novelId/story-bible" params={{ novelId }} search={{ type, entity: entity.entityKey }} className={styles.card}>
      <EntityAvatar entity={entity} size={36} />
      <span className={styles.cardBody}>
        <span className={styles.cardName}>{entity.name}</span>
        <span className={styles.cardCaption} data-major={entity.significance === 'major' || undefined}>
          {entityCaption(entity)}
        </span>
      </span>
    </Link>
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

function editForm(entity: EntityResponse): EntityFormState {
  return {
    entityKey: entity.entityKey,
    name: entity.name,
    type: entity.type,
    significance: entity.significance ?? 'minor',
    status: entity.status ?? '',
    notes: entity.notes ?? '',
    motivation: entity.motivation ?? '',
    appearance: entity.appearance ?? '',
    body: entity.body ?? '',
  };
}

interface EntityDialogState {
  mode: 'create' | 'edit';
  initial: EntityFormState;
}

interface EntityDialogProps {
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  initial: EntityFormState;
  onSubmit: (form: EntityFormState) => void;
  pending: boolean;
}

function EntityDialog({ onOpenChange, mode, initial, onSubmit, pending }: EntityDialogProps): React.JSX.Element {
  const [form, setForm] = useState(initial);
  const set = <K extends keyof EntityFormState>(key: K, value: EntityFormState[K]): void => setForm(prev => ({ ...prev, [key]: value }));
  const invalid = !form.name.trim() || (mode === 'create' && !form.entityKey.trim());

  return (
    <Dialog open onOpenChange={onOpenChange}>
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
                    {ALL_TYPES.map(t => (
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
                  {ALL_TYPES.map(t => (
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

interface EntityAsideProps {
  novelId: string;
  entityKey: string;
  byKey: ReadonlyMap<string, BibleEntity>;
  type?: EntityType;
}

function EntityAside({ novelId, entityKey, byKey, type }: EntityAsideProps): React.JSX.Element {
  const factsQuery = useListFactsQuery(novelId);
  const facts = useMemo(() => factsQuery.data?.facts ?? [], [factsQuery.data]);
  const related = useMemo(() => relatedEntities(facts, entityKey), [facts, entityKey]);
  const mentions = useMemo(() => entityFacts(facts, entityKey), [facts, entityKey]);

  return (
    <>
      <section className={styles.asideBlock}>
        <h2 className={styles.asideTitle}>Relationships</h2>
        {related.length === 0 ? (
          <p className={styles.asideNote}>No canon fact names this entity beside another one yet.</p>
        ) : (
          <ul className={styles.relations}>
            {related.map(relation => {
              const other = byKey.get(relation.entityKey);
              return (
                <li key={relation.entityKey}>
                  <Link to="/novels/$novelId/story-bible" params={{ novelId }} search={{ type, entity: relation.entityKey }} className={styles.relation}>
                    <span className={styles.relationName}>{other?.name ?? relation.entityKey}</span>
                    <span className={styles.relationCount}>
                      {relation.shared} fact{relation.shared === 1 ? '' : 's'}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className={styles.asideBlock}>
        <h2 className={styles.asideTitle}>Canon facts</h2>
        {mentions.length === 0 ? (
          <p className={styles.asideNote}>Nothing in the spoiler ledger mentions this entity.</p>
        ) : (
          <div className={styles.factList}>
            {mentions.slice(0, ASIDE_FACT_LIMIT).map(fact => (
              <FieldCard
                key={fact.factKey}
                label={fact.factKey}
                value={fact.text}
                provenance={fact.revealChapter != null && <StatusChip intent="info">reveals ch. {fact.revealChapter}</StatusChip>}
              />
            ))}
            {mentions.length > ASIDE_FACT_LIMIT && (
              <Link to="/novels/$novelId/canon-facts" params={{ novelId }} className={styles.asideLink}>
                See all {mentions.length} in Canon Facts
              </Link>
            )}
          </div>
        )}
      </section>
    </>
  );
}

interface EntityDetailProps {
  novelId: string;
  entity: BibleEntity;
  total: number | undefined;
  type?: EntityType;
  ids: readonly string[] | undefined;
  jump?: ItemPagerJump;
  byKey: ReadonlyMap<string, BibleEntity>;
  onSelect: (entityKey: string) => void;
  onEdit: (entity: EntityResponse) => void;
  onDelete: (entity: EntityResponse) => void;
}

function EntityDetail({ novelId, entity, total, type, ids, jump, byKey, onSelect, onEdit, onDelete }: EntityDetailProps): React.JSX.Element {
  const navigate = useNavigate();
  const entityKey = entity.entityKey;
  const entityQuery = useEntityQuery(novelId, entityKey);
  const uploadImage = useUploadEntityImageMutation(novelId, entityKey);
  const removeImage = useDeleteEntityImageMutation(novelId, entityKey);
  const addGalleryImage = useAddEntityImageMutation(novelId, entityKey);
  const removeGalleryImage = useDeleteEntityImageByIdMutation(novelId, entityKey);
  const full = entityQuery.data;

  return (
    <DetailPage
      back={
        <Link to="/novels/$novelId/story-bible" params={{ novelId }} search={{ type }}>
          {backLabel(total)}
        </Link>
      }
      identity={
        <>
          <EntityAvatar entity={entity} size={32} />
          <h1 className={styles.detailName}>{entity.name}</h1>
          <StatusChip intent="neutral">{TYPE_SINGULAR[entity.type]}</StatusChip>
          <StatusChip intent={entity.significance === 'major' ? 'accent' : 'neutral'}>{entity.significance ?? 'minor'}</StatusChip>
        </>
      }
      pager={<ItemPager ids={ids} currentId={entityKey} onSelect={onSelect} itemNoun="entity" jump={jump} />}
      actions={
        <>
          <Button
            variant="secondary"
            prefix={<SparkIcon />}
            onClick={() => navigate({ to: '/novels/$novelId/illustrations', params: { novelId }, search: { subject: 'entity', key: entityKey, start: true } })}
          >
            Generate portrait
          </Button>
          <Button variant="ghost" disabled={!full} onClick={() => full && onEdit(full)}>
            Edit
          </Button>
          <Tooltip content={`Delete ${entity.name}`}>
            <IconButton variant="ghost" size="sm" aria-label={`Delete ${entity.name}`} icon={<TrashIcon size={15} />} disabled={!full} onClick={() => full && onDelete(full)} />
          </Tooltip>
        </>
      }
      aside={<EntityAside novelId={novelId} entityKey={entityKey} byKey={byKey} type={type} />}
      asideLabel={`${entity.name} context`}
    >
      {entityQuery.error ? (
        <PaneError error={entityQuery.error} />
      ) : !full ? (
        <PaneLoader />
      ) : (
        <>
          <div className={styles.detailTop}>
            <ImageUpload
              className={styles.cover}
              src={full.imageUrl ?? undefined}
              alt={full.name}
              uploading={uploadImage.isPending || removeImage.isPending}
              placeholder={<div className={styles.coverPlaceholder} style={{ background: coverColor(full.id) }} />}
              onUpload={body => uploadImage.mutate(body, { onSuccess: () => toast.success(`Updated ${full.name}’s image`), onError: e => toast.danger(e.message) })}
              onRemove={() => removeImage.mutate(undefined, { onSuccess: () => toast.success('Image removed'), onError: e => toast.danger(e.message) })}
            />
            <DetailPage.Prose>
              {full.body && (
                <>
                  <div className={styles.sectionLabel}>Summary</div>
                  <Markdown content={stripEntityHeading(full.body, full.name)} className={styles.para} />
                </>
              )}
              {full.motivation && (
                <>
                  <div className={styles.sectionLabel}>Motivation</div>
                  <Markdown content={full.motivation} className={`${styles.para} ${styles.paraMuted}`} />
                </>
              )}
              {full.notes && (
                <>
                  <div className={styles.sectionLabel}>Notes</div>
                  <Markdown content={full.notes} className={`${styles.para} ${styles.paraMuted}`} />
                </>
              )}
              <div className={styles.chips}>
                {full.status && <StatusChip intent="neutral">{full.status}</StatusChip>}
                {full.origin && <StatusChip intent="info">{full.origin}</StatusChip>}
                {full.firstSeenChapter != null && <StatusChip intent="neutral">first seen · ch. {full.firstSeenChapter}</StatusChip>}
              </div>
            </DetailPage.Prose>
          </div>

          <div className={styles.gallerySection}>
            <div className={styles.sectionLabel}>Gallery</div>
            <ImageGallery
              images={(full.images ?? []).map(img => ({ id: img.id, url: img.imageUrl, caption: img.caption }))}
              busy={addGalleryImage.isPending || removeGalleryImage.isPending}
              addLabel="Add image"
              onAdd={body => addGalleryImage.mutate(body, { onSuccess: () => toast.success('Image added'), onError: e => toast.danger(e.message) })}
              onRemove={id => removeGalleryImage.mutate(id, { onSuccess: () => toast.success('Image removed'), onError: e => toast.danger(e.message) })}
            />
          </div>

          <div className={styles.forgeRow}>
            <ForgeBar
              novelId={novelId}
              scope={{ type: 'novel', title: full.name }}
              placeholder={`Ask Forge to update ${full.name} — add a detail, change a trait, note a new relationship…`}
            />
          </div>
        </>
      )}
    </DetailPage>
  );
}

function StoryBibleScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const navigate = useNavigate();
  const { type: typeParam, entity: entityParam } = Route.useSearch();
  const goSearch = Route.useNavigate();
  const entitiesQuery = useListEntitiesQuery(novelId, { limit: 500 });
  const entities = useMemo(() => entitiesQuery.data?.items ?? [], [entitiesQuery.data]);
  const projectQuery = useProjectQuery(novelId);
  const createEntity = useCreateEntityMutation(novelId);
  const seed = useSeedFromBriefMutation(novelId);
  const audit = useAuditBibleMutation(novelId);
  const deleteEntity = useDeleteEntityMutation(novelId);
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<EntityDialogState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<EntityResponse | undefined>();
  const updateEntity = useUpdateEntityMutation(novelId, dialog?.mode === 'edit' ? dialog.initial.entityKey : '');

  const activeType: BibleCategory = typeParam ?? 'all';
  const resolved = !entitiesQuery.isLoading && !entitiesQuery.error;
  const total = resolved ? entities.length : undefined;

  const counts = useMemo(() => countByType(entities), [entities]);
  const order = useMemo(() => orderTypesByCount(counts, typeParam), [counts, typeParam]);
  const visible = useMemo(() => filterEntities(entities, activeType, query), [entities, activeType, query]);
  const expanded = activeType !== 'all';
  const sections = useMemo(
    () => groupByType(visible, order).map(section => ({ type: section.type, total: section.items.length, items: sectionSlice(section.items, expanded) })),
    [visible, order, expanded],
  );
  const byKey = useMemo(() => new Map(entities.map(entity => [entity.entityKey, entity])), [entities]);
  const visibleIds = useMemo(() => (resolved ? visible.map(entity => entity.entityKey) : undefined), [resolved, visible]);

  const selected = entityParam ? byKey.get(entityParam) : undefined;
  const selectEntity = (entityKey?: string): Promise<void> => goSearch({ search: { type: typeParam, entity: entityKey } });
  const pickType = (value: string): Promise<void> => goSearch({ search: { type: parseEntityType(value) } });
  const clearFilters = (): void => {
    setQuery('');
    void goSearch({ search: {} });
  };

  const jumpItems = useMemo(() => visible.map(entity => ({ id: entity.entityKey, label: entity.name, caption: entityCaption(entity) })), [visible]);
  const allJumpItems = useMemo(
    () => (typeParam ? entities.map(entity => ({ id: entity.entityKey, label: entity.name, caption: entityCaption(entity) })) : undefined),
    [entities, typeParam],
  );
  const jump = useCollectionJump(
    resolved
      ? {
          collection: 'entities',
          items: jumpItems,
          filterLabel: typeParam ? TYPE_LABEL[typeParam] : undefined,
          allItems: allJumpItems,
          currentId: entityParam,
          onSelect: key => void selectEntity(key),
        }
      : null,
  );

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
      return;
    }
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
  };

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

  const brief = projectQuery.data?.brief?.trim();
  const runSeed = (): void => {
    if (!brief) {
      toast.danger('Add a project brief in Settings before generating the bible.');
      return;
    }
    toast.success('Generating story bible — this can take a few minutes.');
    seed.mutate({ brief }, { onSuccess: () => toast.success('Story bible generated'), onError: err => toast.danger(err.message) });
  };

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

  const dialogs = (
    <>
      {dialog && (
        <EntityDialog
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
    </>
  );

  if (selected)
    return (
      <>
        <EntityDetail
          novelId={novelId}
          entity={selected}
          total={total}
          type={typeParam}
          ids={visibleIds}
          jump={jump}
          byKey={byKey}
          onSelect={key => void selectEntity(key)}
          onEdit={entity => setDialog({ mode: 'edit', initial: editForm(entity) })}
          onDelete={setDeleteTarget}
        />
        {dialogs}
      </>
    );

  return (
    <>
      <CollectionPage
        title="Story Bible"
        subtitle="The canon every chapter is checked against — cast, factions, places, rules."
        total={total}
        actions={
          <>
            <Button variant="secondary" loading={audit.isPending} disabled={entities.length === 0} onClick={runAudit}>
              Run bible audit
            </Button>
            <Button variant="primary" onClick={() => setDialog({ mode: 'create', initial: emptyForm(typeParam ?? 'character') })}>
              New entity
            </Button>
          </>
        }
        filter={{ label: 'Filter entities', placeholder: 'Filter by name or key…', value: query, onValueChange: setQuery }}
        segments={{
          label: 'Entity type',
          value: activeType,
          onValueChange: pickType,
          items: [{ value: 'all', label: 'All', count: entities.length }, ...order.map(type => ({ value: type, label: TYPE_LABEL[type], count: counts.get(type) ?? 0 }))],
        }}
        empty={
          <EmptyState
            icon={<SparkIcon size={24} />}
            title="Draft the story bible"
            description="Forge reads your brief and drafts the world, cast, factions, locations, and plot — the canon every chapter is checked against. This runs the full bible builder and can take a few minutes."
            actions={
              brief ? (
                <Button variant="primary" prefix={<SparkIcon />} loading={seed.isPending} onClick={runSeed}>
                  Generate story bible
                </Button>
              ) : (
                <Button variant="secondary" onClick={() => navigate({ to: '/novels/$novelId/settings', params: { novelId } })}>
                  Add a brief in Settings
                </Button>
              )
            }
          />
        }
      >
        {entitiesQuery.isLoading ? (
          <PaneLoader />
        ) : entitiesQuery.error ? (
          <PaneError error={entitiesQuery.error} />
        ) : (
          <>
            {entityParam && (
              <Alert intent="warning" title="That entity is no longer in the story bible." action={{ label: 'Back to the directory', onClick: () => void selectEntity(undefined) }}>
                It was deleted, renamed, or the link was typed by hand.
              </Alert>
            )}
            {visible.length === 0 ? (
              <EmptyState
                icon={<SearchIcon size={24} />}
                title="Nothing matches"
                description={`No ${activeType === 'all' ? 'entity' : TYPE_SINGULAR[activeType].toLowerCase()} matches this filter.`}
                actions={
                  <Button variant="secondary" onClick={clearFilters}>
                    Clear the filter
                  </Button>
                }
              />
            ) : (
              sections.map(section => (
                <CollectionPage.Section
                  key={section.type}
                  label={TYPE_LABEL[section.type]}
                  total={section.total}
                  shown={section.items.length}
                  seeAll={count => (
                    <Link to="/novels/$novelId/story-bible" params={{ novelId }} search={{ type: section.type }}>
                      See all {count}
                    </Link>
                  )}
                >
                  <div className={styles.grid}>
                    {section.items.map(entity => (
                      <EntityCard key={entity.id} novelId={novelId} entity={entity} type={typeParam} />
                    ))}
                  </div>
                </CollectionPage.Section>
              ))
            )}
          </>
        )}
      </CollectionPage>
      {dialogs}
    </>
  );
}
