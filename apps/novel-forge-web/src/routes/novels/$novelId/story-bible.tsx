import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { Alert, Button, Dialog, FormField, IconButton, Input, Select, Tabs, Textarea, toast, Tooltip } from '@shadow-library/ui';

import { LockIcon, SearchIcon, SparkIcon, TrashIcon } from '@/components/icons';
import { useCollectionJump } from '@/components/Layout';
import {
  BibleDocumentList,
  BibleHealth,
  BibleReadiness,
  CollectionPage,
  DetailPage,
  EmptyState,
  ItemPager,
  type ItemPagerJump,
  Markdown,
  PaneError,
  PaneLoader,
  RowAction,
  StatusChip,
} from '@/components/nf';
import { ForgeBar } from '@/components/nf/ForgeBar';
import { ImageGallery } from '@/components/nf/ImageGallery';
import { ImageUpload } from '@/components/nf/ImageUpload';
import {
  type CreateEntityBody,
  type EntityResponse,
  type EntityType,
  type FactResponse,
  listEntitiesQueryOptions,
  listFactsQueryOptions,
  type UpdateEntityBody,
  useAddEntityImageMutation,
  useAuditBibleMutation,
  useBibleReadinessQuery,
  useCreateEntityMutation,
  useDeleteEntityImageByIdMutation,
  useDeleteEntityImageMutation,
  useDeleteEntityMutation,
  useDeleteFactMutation,
  useEntityQuery,
  useListBibleDocsQuery,
  useListEntitiesQuery,
  useListFactsQuery,
  useProjectQuery,
  useSeedFromBriefMutation,
  useUpdateEntityMutation,
  useUploadEntityImageMutation,
  useUpsertFactMutation,
} from '@/lib/apis';
import { bibleHealth } from '@/lib/bible-documents';
import { readinessDisplay } from '@/lib/bible-readiness';
import {
  countByState,
  emptyFactForm,
  factCaption,
  type FactCategory,
  factFormFromFact,
  type FactFormState,
  factHiddenFromWriter,
  factReveal,
  factRevealLabel,
  factState,
  type FactState,
  filterFacts,
  parseFactState,
  sortFactsByKey,
  STATE_LABEL,
  textToList,
} from '@/lib/canon-facts';
import { coverColor } from '@/lib/format';
import {
  ALL_TYPES,
  ASIDE_FACT_LIMIT,
  backLabel,
  type BibleCategory,
  type BibleEntity,
  type BibleView,
  countByType,
  entityCaption,
  entityExcerpt,
  factCountLabel,
  factCountsBySubject,
  filterEntities,
  groupByType,
  orderTypesByCount,
  parseBibleView,
  parseEntityType,
  relatedEntities,
  sectionSlice,
  stripEntityHeading,
  subjectFacts,
  TYPE_LABEL,
  TYPE_SINGULAR,
} from '@/lib/story-bible';

import { FactDetail, FactDialog, type FactDialogState } from './canon-facts';
import factsStyles from './canon-facts.module.css';
import styles from './story-bible.module.css';

interface BibleSearch {
  type?: EntityType;
  entity?: string;
  view?: BibleView;
  state?: FactState;
  fact?: string;
}

// The active type/view and the open entity or fact live in the URL so a refresh reopens the same entry.
export const Route = createFileRoute('/novels/$novelId/story-bible')({
  validateSearch: (search: Record<string, unknown>): BibleSearch => ({
    type: parseEntityType(search.type),
    entity: typeof search.entity === 'string' && search.entity ? search.entity : undefined,
    view: parseBibleView(search.view),
    state: parseFactState(search.state),
    fact: typeof search.fact === 'string' && search.fact ? search.fact : undefined,
  }),
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.prefetchQuery(listEntitiesQueryOptions(params.novelId, { limit: 500 })),
      context.queryClient.prefetchQuery(listFactsQueryOptions(params.novelId)),
    ]),
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
  factCount: number | undefined;
}

function EntityCard({ novelId, entity, type, factCount }: EntityCardProps): React.JSX.Element {
  const excerpt = entityExcerpt(entity);
  return (
    <Link to="/novels/$novelId/story-bible" params={{ novelId }} search={{ type, entity: entity.entityKey }} className={styles.card}>
      <EntityAvatar entity={entity} size={36} />
      <span className={styles.cardBody}>
        <span className={styles.cardName}>{entity.name}</span>
        <span className={styles.cardCaption} data-major={entity.significance === 'major' || undefined}>
          {entityCaption(entity)}
        </span>
        {excerpt && <span className={styles.cardExcerpt}>{excerpt}</span>}
        {(factCount !== undefined || entity.firstSeenChapter != null) && (
          <span className={styles.cardMeta}>
            {factCount !== undefined && <StatusChip intent="neutral">{factCountLabel(factCount)}</StatusChip>}
            {entity.firstSeenChapter != null && <StatusChip intent="accent">First seen ch. {entity.firstSeenChapter}</StatusChip>}
          </span>
        )}
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
  const ownFacts = useMemo(() => subjectFacts(facts, entityKey), [facts, entityKey]);

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
        <h2 className={styles.asideTitle}>Facts</h2>
        {ownFacts.length === 0 ? (
          <p className={styles.asideNote}>Nothing in the spoiler ledger names this entity as a subject.</p>
        ) : (
          <div className={styles.factList}>
            {ownFacts.slice(0, ASIDE_FACT_LIMIT).map(fact => {
              const reveal = factReveal(fact);
              return (
                <div key={fact.factKey} className={styles.factRow}>
                  <p className={styles.factText}>{fact.text}</p>
                  <div className={styles.factMeta}>
                    <StatusChip intent={reveal.kind === 'revealed' ? 'success' : 'neutral'}>{factRevealLabel(reveal)}</StatusChip>
                    {factHiddenFromWriter(fact) && <StatusChip intent="warning">Hidden from writer</StatusChip>}
                    <Link
                      to="/novels/$novelId/story-bible"
                      params={{ novelId }}
                      search={{ view: 'facts', fact: fact.factKey }}
                      className={styles.factEdit}
                      aria-label={`Edit ${fact.factKey}`}
                    >
                      Edit
                    </Link>
                  </div>
                </div>
              );
            })}
            {ownFacts.length > ASIDE_FACT_LIMIT && (
              <Link to="/novels/$novelId/story-bible" params={{ novelId }} search={{ view: 'facts' }} className={styles.asideLink}>
                See all {ownFacts.length} in All facts
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
        <DetailPage.Identity avatar={<EntityAvatar entity={entity} size={32} />} title={entity.name}>
          <StatusChip intent="neutral">{TYPE_SINGULAR[entity.type]}</StatusChip>
          <StatusChip intent={entity.significance === 'major' ? 'accent' : 'neutral'}>{entity.significance ?? 'minor'}</StatusChip>
        </DetailPage.Identity>
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
  const { type: typeParam, entity: entityParam, view: viewParam, state: factStateParam, fact: factParam } = Route.useSearch();
  const goSearch = Route.useNavigate();
  const view: BibleView = viewParam ?? 'entities';

  const entitiesQuery = useListEntitiesQuery(novelId, { limit: 500 });
  const entities = useMemo(() => entitiesQuery.data?.items ?? [], [entitiesQuery.data]);
  const projectQuery = useProjectQuery(novelId);
  const createEntity = useCreateEntityMutation(novelId);
  const seed = useSeedFromBriefMutation(novelId);
  const audit = useAuditBibleMutation(novelId);
  const readiness = useBibleReadinessQuery(novelId);
  const bibleDocs = useListBibleDocsQuery(novelId);
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
    view === 'entities' && resolved
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
    seed.mutate(
      { brief },
      {
        onSuccess: result =>
          toast.success(result.skippedStages?.length ? `Story bible generated · skipped ${result.skippedStages.join(', ')}, which already had content` : 'Story bible generated'),
        onError: err => toast.danger(err.message),
      },
    );
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

  // Facts — the merged Canon Facts directory, reusing FactDialog/FactDetail from ./canon-facts.
  const factsQuery = useListFactsQuery(novelId);
  const facts = useMemo(() => sortFactsByKey(factsQuery.data?.facts ?? []), [factsQuery.data]);
  const [factQuery, setFactQuery] = useState('');
  const [factDialog, setFactDialog] = useState<FactDialogState | null>(null);
  const [deleteFactTarget, setDeleteFactTarget] = useState<FactResponse | undefined>();

  const upsertFact = useUpsertFactMutation(novelId);
  const deleteFact = useDeleteFactMutation(novelId);

  const activeState: FactCategory = factStateParam ?? 'all';
  const factsResolved = !factsQuery.isLoading && !factsQuery.error;
  const factsTotal = factsResolved ? facts.length : undefined;

  const factCounts = useMemo(() => countByState(facts), [facts]);
  const factCountByEntity = useMemo(() => factCountsBySubject(facts), [facts]);
  const readinessView = useMemo(() => readinessDisplay(readiness.data), [readiness.data]);
  const health = useMemo(
    () =>
      resolved && factsResolved && bibleDocs.data
        ? bibleHealth({ docs: bibleDocs.data.docs, entities: entities.length, facts: facts.length, roles: readinessView.alert ? undefined : readiness.data?.roles })
        : undefined,
    [resolved, factsResolved, bibleDocs.data, entities.length, facts.length, readiness.data, readinessView.alert],
  );
  const visibleFacts = useMemo(() => filterFacts(facts, activeState, factQuery), [facts, activeState, factQuery]);
  const factsByKey = useMemo(() => new Map(facts.map(fact => [fact.factKey, fact])), [facts]);
  const visibleFactIds = useMemo(() => (factsResolved ? visibleFacts.map(fact => fact.factKey) : undefined), [factsResolved, visibleFacts]);

  const selectedFact = factParam ? factsByKey.get(factParam) : undefined;
  const selectFact = (factKey?: string): Promise<void> => goSearch({ search: { view: 'facts', state: factStateParam, fact: factKey } });
  const pickFactState = (value: string): Promise<void> => goSearch({ search: { view: 'facts', state: parseFactState(value) } });
  const clearFactFilters = (): void => {
    setFactQuery('');
    void goSearch({ search: { view: 'facts' } });
  };

  const factFiltering = factStateParam !== undefined || factQuery.trim() !== '';
  const factJumpItems = useMemo(() => visibleFacts.map(fact => ({ id: fact.factKey, label: fact.factKey, caption: factCaption(fact) })), [visibleFacts]);
  const factAllJumpItems = useMemo(
    () => (factFiltering ? facts.map(fact => ({ id: fact.factKey, label: fact.factKey, caption: factCaption(fact) })) : undefined),
    [factFiltering, facts],
  );
  const factJump = useCollectionJump(
    view === 'facts' && factsResolved
      ? {
          collection: 'canon facts',
          items: factJumpItems,
          filterLabel: factStateParam ? STATE_LABEL[factStateParam] : undefined,
          allItems: factAllJumpItems,
          currentId: factParam,
          onSelect: key => void selectFact(key),
        }
      : null,
  );

  const submitFact = (form: FactFormState): void => {
    const body = {
      factKey: factDialog?.mode === 'create' ? form.factKey.trim() : (factDialog?.initial.factKey ?? ''),
      text: form.text.trim(),
      subjects: textToList(form.subjects),
      constraintNote: form.constraintNote.trim() || undefined,
      writerNote: form.writerNote.trim(),
      terms: textToList(form.terms),
      revealChapter: form.revealChapter.trim() ? Number(form.revealChapter) : undefined,
    };
    upsertFact.mutate(body, {
      onSuccess: created => {
        toast.success(factDialog?.mode === 'create' ? `Created fact “${created.factKey}”` : 'Fact updated');
        setFactDialog(null);
        if (factDialog?.mode === 'create') selectFact(created.factKey);
      },
      onError: err => toast.danger(err.message),
    });
  };

  const doDeleteFact = (): void => {
    if (!deleteFactTarget) return;
    deleteFact.mutate(deleteFactTarget.factKey, {
      onSuccess: () => {
        toast.success(`Deleted fact “${deleteFactTarget.factKey}”`);
        setDeleteFactTarget(undefined);
        if (deleteFactTarget.factKey === factParam) selectFact(undefined);
      },
      onError: err => toast.danger(err.message),
    });
  };

  const pickView = (value: string): void => void goSearch({ search: { view: value === 'facts' ? 'facts' : undefined } });

  const factDialogs = (
    <>
      {factDialog && (
        <FactDialog
          open
          onOpenChange={next => !next && setFactDialog(null)}
          mode={factDialog.mode}
          initial={factDialog.initial}
          pending={upsertFact.isPending}
          onSubmit={submitFact}
        />
      )}

      <Dialog open={Boolean(deleteFactTarget)} onOpenChange={o => !o && setDeleteFactTarget(undefined)}>
        <Dialog.Content size="sm">
          <Dialog.Header title={`Delete “${deleteFactTarget?.factKey ?? 'this fact'}”?`} description="This removes the fact and its entire reveal ledger. It cannot be undone." />
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="danger" loading={deleteFact.isPending} onClick={doDeleteFact}>
              Delete fact
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

  if (selectedFact)
    return (
      <>
        <FactDetail
          novelId={novelId}
          fact={selectedFact}
          total={factsTotal}
          filterState={factStateParam}
          ids={visibleFactIds}
          jump={factJump}
          onSelect={key => void selectFact(key)}
          onEdit={fact => setFactDialog({ mode: 'edit', initial: factFormFromFact(fact) })}
          onDelete={setDeleteFactTarget}
        />
        {factDialogs}
      </>
    );

  return (
    <>
      <Tabs value={view} onValueChange={pickView} className={styles.viewTabs}>
        <Tabs.List>
          <Tabs.Tab value="entities" count={resolved ? entities.length : undefined}>
            Entities
          </Tabs.Tab>
          <Tabs.Tab value="facts" count={factsResolved ? facts.length : undefined}>
            All facts
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="entities">
          <CollectionPage
            title="Story Bible"
            subtitle="The canon every chapter is checked against — cast, factions, places, rules."
            total={total}
            actions={
              <>
                <Button variant="secondary" loading={audit.isPending} onClick={runAudit}>
                  Run bible audit
                </Button>
                <Button variant="primary" onClick={() => setDialog({ mode: 'create', initial: emptyForm(typeParam ?? 'character') })}>
                  New entity
                </Button>
              </>
            }
            filter={{ label: 'Filter entities', placeholder: 'Filter by name or key…', value: query, onValueChange: setQuery }}
            notice={
              (health || readinessView.alert || (resolved && entityParam)) && (
                <div className={styles.notices}>
                  {health && <BibleHealth health={health} suggestions={readinessView.suggestions} />}
                  {readinessView.alert && readiness.data && <BibleReadiness report={readiness.data} onAudit={runAudit} auditPending={audit.isPending} />}
                  {resolved && entityParam && (
                    <Alert
                      intent="warning"
                      title="That entity is no longer in the story bible."
                      action={{ label: 'Back to the directory', onClick: () => void selectEntity(undefined) }}
                    >
                      It was deleted, renamed, or the link was typed by hand.
                    </Alert>
                  )}
                </div>
              )
            }
            segments={{
              label: 'Entity type',
              value: activeType,
              onValueChange: pickType,
              items: [{ value: 'all', label: 'All', count: entities.length }, ...order.map(type => ({ value: type, label: TYPE_LABEL[type], count: counts.get(type) ?? 0 }))],
            }}
            empty={
              <>
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
                <BibleDocumentList novelId={novelId} />
              </>
            }
          >
            {entitiesQuery.isLoading ? (
              <PaneLoader />
            ) : entitiesQuery.error ? (
              <PaneError error={entitiesQuery.error} />
            ) : (
              <>
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
                      seeAll={sectionTotal => (
                        <Link to="/novels/$novelId/story-bible" params={{ novelId }} search={{ type: section.type }}>
                          See all {sectionTotal}
                        </Link>
                      )}
                    >
                      <div className={styles.grid}>
                        {section.items.map(entity => (
                          <EntityCard
                            key={entity.id}
                            novelId={novelId}
                            entity={entity}
                            type={typeParam}
                            factCount={factsResolved ? (factCountByEntity.get(entity.entityKey) ?? 0) : undefined}
                          />
                        ))}
                      </div>
                    </CollectionPage.Section>
                  ))
                )}
                <CollectionPage.Section label="Documents" total={bibleDocs.data?.docs.length ?? 0}>
                  <BibleDocumentList novelId={novelId} />
                </CollectionPage.Section>
              </>
            )}
          </CollectionPage>
        </Tabs.Panel>

        <Tabs.Panel value="facts">
          <CollectionPage
            title="All facts"
            subtitle="The spoiler ledger — truths only the judge sees until a character earns them on-page."
            total={factsTotal}
            actions={
              <Button variant="primary" onClick={() => setFactDialog({ mode: 'create', initial: emptyFactForm() })}>
                New fact
              </Button>
            }
            filter={{ label: 'Filter canon facts', placeholder: 'Filter by key, subject or term…', value: factQuery, onValueChange: setFactQuery }}
            notice={
              factsResolved &&
              factParam && (
                <Alert intent="warning" title="That canon fact is no longer in the ledger." action={{ label: 'Back to the directory', onClick: () => void selectFact(undefined) }}>
                  It was deleted, its key was changed, or the link was typed by hand.
                </Alert>
              )
            }
            segments={{
              label: 'Reveal state',
              value: activeState,
              onValueChange: pickFactState,
              items: [
                { value: 'all', label: STATE_LABEL.all, count: facts.length },
                { value: 'hidden', label: STATE_LABEL.hidden, count: factCounts.hidden },
                { value: 'revealed', label: STATE_LABEL.revealed, count: factCounts.revealed },
              ],
            }}
            empty={
              <EmptyState
                icon={<LockIcon size={24} />}
                title="No canon facts yet"
                description="A canon fact is a truth the judge holds back — the drafting model never sees it until a character earns it on-page. Write the first one and the leak scan starts guarding it."
                actions={
                  <Button variant="primary" onClick={() => setFactDialog({ mode: 'create', initial: emptyFactForm() })}>
                    New fact
                  </Button>
                }
              />
            }
          >
            {factsQuery.isLoading ? (
              <PaneLoader />
            ) : factsQuery.error ? (
              <PaneError error={factsQuery.error} />
            ) : visibleFacts.length === 0 ? (
              <EmptyState
                icon={<SearchIcon size={24} />}
                title="Nothing matches"
                description={`No ${activeState === 'all' ? '' : `${activeState} `}canon fact matches this filter.`}
                actions={
                  <Button variant="secondary" onClick={clearFactFilters}>
                    Clear the filter
                  </Button>
                }
              />
            ) : (
              <CollectionPage.Rows>
                {visibleFacts.map(fact => (
                  <CollectionPage.Row
                    key={fact.id}
                    link={<Link to="/novels/$novelId/story-bible" params={{ novelId }} search={{ view: 'facts', state: factStateParam, fact: fact.factKey }} />}
                    title={<span className={factsStyles.rowKey}>{fact.factKey}</span>}
                    trailing={
                      <StatusChip intent={factState(fact) === 'revealed' ? 'success' : 'warning'} dot>
                        {factCaption(fact)}
                      </StatusChip>
                    }
                    actions={
                      <RowAction label={`Delete ${fact.factKey}`} danger onClick={() => setDeleteFactTarget(fact)}>
                        <TrashIcon size={13} />
                      </RowAction>
                    }
                  />
                ))}
              </CollectionPage.Rows>
            )}
          </CollectionPage>
        </Tabs.Panel>
      </Tabs>
      {dialogs}
      {factDialogs}
    </>
  );
}
