import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { type ReactNode, useId, useMemo, useState } from 'react';
import { Alert, Button, Dialog, Input, Select, Tabs, toast, useMediaQuery } from '@shadow-library/ui';

import { LockIcon, SearchIcon, SparkIcon } from '@/components/icons';
import { useCollectionJump } from '@/components/Layout';
import { BibleHealth, BibleReadiness, EmptyState, PaneLoader } from '@/components/nf';
import { BibleTidyDialog } from '@/components/nf/BibleTidyDialog';
import {
  emptyEntityForm,
  EntityDialog,
  type EntityDialogState,
  entityFormFrom,
  type EntityFormState,
  EntityPane,
  EntryGroups,
  FactDialog,
  type FactDialogState,
  type FactLearner,
  type FactPurpose,
  GuidePane,
  ListHead,
  SecretDetail,
  SecretRow,
  SecretsList,
  TopicList,
  useTabsFit,
} from '@/features/story-bible';
import styles from '@/features/story-bible/StoryBible.module.css';
import {
  type CreateEntityBody,
  type EntityResponse,
  type FactResponse,
  listEntitiesQueryOptions,
  listFactsQueryOptions,
  type UpdateEntityBody,
  useAuditBibleMutation,
  useBibleReadinessQuery,
  useCreateEntityMutation,
  useDeleteEntityMutation,
  useDeleteFactMutation,
  useListBibleDocsQuery,
  useListEntitiesQuery,
  useListFactsQuery,
  useProjectQuery,
  useRevealFactMutation,
  useSeedFromBriefMutation,
  useUpdateEntityMutation,
  useUpsertFactMutation,
} from '@/lib/apis';
import { bibleHealth, docAddress, topicsByDocument } from '@/lib/bible-documents';
import {
  type BibleEntry,
  buildCatalogue,
  countByTopic,
  defaultTopic,
  type EntryKindFilter,
  entryMeta,
  entryTarget,
  filterEntries,
  groupByTopic,
  groupWithinTopic,
  guideId,
  parseGuideAddress,
  recentEntries,
  recordId,
  visibleTopics,
} from '@/lib/bible-entries';
import { readinessDisplay } from '@/lib/bible-readiness';
import { type BibleSearch, type BibleView, parseBibleSearch } from '@/lib/bible-search';
import { groupSecrets, isSecret, secretCountsBySubject, secretTitle } from '@/lib/bible-secrets';
import { type BibleTopic, newEntryType, parseBibleTopic, stagesByDocument, TOPIC_LABEL } from '@/lib/bible-topics';
import { emptyFactForm, factFormFromFact, type FactFormState, filterFacts, parseChapter, textToList } from '@/lib/canon-facts';
import { relativeTime } from '@/lib/format';

export const Route = createFileRoute('/novels/$novelId/story-bible')({
  validateSearch: parseBibleSearch,
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.prefetchQuery(listEntitiesQueryOptions(params.novelId, { limit: 500 })),
      context.queryClient.prefetchQuery(listFactsQueryOptions(params.novelId)),
    ]),
  component: StoryBibleScreen,
});

const VIEW_LABEL: Record<BibleView, string> = { secrets: 'Secrets', recent: 'Recently changed' };

const PHONE_QUERY = '(max-width: 760px)';

const SEED_DESCRIPTION =
  'Forge reads your brief and drafts the world, cast, factions, locations, and plot — the canon every chapter is checked against. ' +
  'This runs the full bible builder and can take a few minutes.';

const VIEWS: readonly BibleView[] = ['secrets', 'recent'];

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong.';
}

function StoryBibleScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const goSearch = Route.useNavigate();
  const searchId = useId();
  const pickerId = useId();

  const entitiesQuery = useListEntitiesQuery(novelId, { limit: 500 });
  const docsQuery = useListBibleDocsQuery(novelId);
  const factsQuery = useListFactsQuery(novelId);
  const readiness = useBibleReadinessQuery(novelId);
  const projectQuery = useProjectQuery(novelId);
  const audit = useAuditBibleMutation(novelId);
  const seed = useSeedFromBriefMutation(novelId);
  const createEntity = useCreateEntityMutation(novelId);
  const deleteEntity = useDeleteEntityMutation(novelId);
  const upsertFact = useUpsertFactMutation(novelId);
  const revealFact = useRevealFactMutation(novelId);
  const phone = useMediaQuery(PHONE_QUERY);
  const deleteFact = useDeleteFactMutation(novelId);

  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<EntryKindFilter>('all');
  const [tidying, setTidying] = useState(false);
  const [entityDialog, setEntityDialog] = useState<EntityDialogState | null>(null);
  const [deleteEntityTarget, setDeleteEntityTarget] = useState<EntityResponse | undefined>();
  const [factDialog, setFactDialog] = useState<FactDialogState | null>(null);
  const [deleteFactTarget, setDeleteFactTarget] = useState<FactResponse | undefined>();
  const updateEntity = useUpdateEntityMutation(novelId, entityDialog?.mode === 'edit' ? entityDialog.initial.entityKey : '');

  const entities = useMemo(() => entitiesQuery.data?.items ?? [], [entitiesQuery.data]);
  const docs = useMemo(() => docsQuery.data?.docs ?? [], [docsQuery.data]);
  const facts = useMemo(() => factsQuery.data?.facts ?? [], [factsQuery.data]);
  const readinessSettled = readiness.data !== undefined || readiness.error !== null;
  const resolved = Boolean(entitiesQuery.data && docsQuery.data && factsQuery.data) && readinessSettled;
  const failure = entitiesQuery.error ?? docsQuery.error ?? factsQuery.error;

  const catalogue = useMemo(() => buildCatalogue(entities, docs, stagesByDocument(readiness.data?.roles)), [entities, docs, readiness.data]);
  const entries = catalogue.entries;
  const counts = useMemo(() => countByTopic(entries), [entries]);
  const secretGroups = useMemo(() => groupSecrets(facts), [facts]);
  const secretCounts = useMemo(() => secretCountsBySubject(facts), [facts]);
  const secretTotal = secretGroups.planned.length + secretGroups.unplanned.length;
  const entityByKey = useMemo(() => new Map(entities.map(entity => [entity.entityKey, entity])), [entities]);
  const names = useMemo(() => new Map(entities.map(entity => [entity.entityKey, entity.name])), [entities]);
  const entryById = useMemo(() => new Map(entries.map(entry => [entry.id, entry])), [entries]);
  const factByKey = useMemo(() => new Map(facts.map(fact => [fact.factKey, fact])), [facts]);
  const covers = useMemo(() => topicsByDocument(readiness.data?.roles), [readiness.data]);
  const recent = useMemo(() => recentEntries(entries, new Date()), [entries]);
  const readinessView = useMemo(() => readinessDisplay(readiness.data), [readiness.data]);

  const guideAddress = parseGuideAddress(search.guide);
  const selectedEntry = search.entity ? entryById.get(recordId(search.entity)) : guideAddress ? entryById.get(guideId(guideAddress)) : undefined;
  const view = search.view;
  const activeTopic = search.topic ?? selectedEntry?.topic ?? defaultTopic(counts);
  const tabValue: BibleTopic | BibleView = view ?? activeTopic;
  const topics = visibleTopics(counts, activeTopic);
  const searching = query.trim() !== '';
  const explicitSelection = Boolean(search.entity || search.guide || search.fact);

  const searchForEntry = (entry: BibleEntry): BibleSearch => {
    const target = entryTarget(entry);
    if (searching) return { topic: entry.topic, ...target };
    if (view) return { view, ...target };
    return { topic: activeTopic, ...target };
  };
  const searchForFact = (fact: FactResponse): BibleSearch => ({ view: 'secrets', fact: fact.factKey });
  const backSearch: BibleSearch = view ? { view } : { topic: activeTopic };

  const pickTab = (value: string): void => {
    setQuery('');
    const topic = parseBibleTopic(value);
    void goSearch({ search: topic ? { topic } : { view: value === 'recent' ? 'recent' : 'secrets' } });
  };

  const jumpItems = useMemo(() => entries.map(entry => ({ id: entry.id, label: entry.name, caption: entryMeta(entry, true) })), [entries]);
  useCollectionJump(
    resolved
      ? {
          collection: 'story bible entries',
          items: jumpItems,
          currentId: selectedEntry?.id,
          onSelect: id => {
            const entry = entryById.get(id);
            if (entry) void goSearch({ search: { topic: entry.topic, ...entryTarget(entry) } });
          },
        }
      : null,
  );

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

  const submitEntity = (form: EntityFormState): void => {
    if (entityDialog?.mode === 'create') {
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
          setEntityDialog(null);
          void goSearch({ search: { entity: created.entityKey } });
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
        toast.success('Entry updated');
        setEntityDialog(null);
      },
      onError: err => toast.danger(err.message),
    });
  };

  const doDeleteEntity = (): void => {
    if (!deleteEntityTarget) return;
    deleteEntity.mutate(deleteEntityTarget.entityKey, {
      onSuccess: () => {
        toast.success(`Deleted “${deleteEntityTarget.name}”`);
        setDeleteEntityTarget(undefined);
        if (deleteEntityTarget.entityKey === search.entity) void goSearch({ search: backSearch });
      },
      onError: err => toast.danger(err.message),
    });
  };

  const openNewFact = (entityKey: string, purpose: FactPurpose): void => {
    const name = names.get(entityKey) ?? entityKey;
    setFactDialog({
      mode: 'create',
      purpose,
      title: purpose === 'secret' ? `New secret about ${name}` : `New fact about ${name}`,
      initial: { ...emptyFactForm(), subjects: entityKey },
      subjectKey: entityKey,
    });
  };
  const openEditFact = (fact: FactResponse): void =>
    setFactDialog({ mode: 'edit', purpose: isSecret(fact) ? 'secret' : 'known', title: `Edit ${secretTitle(fact.factKey)}`, initial: factFormFromFact(fact) });

  const submitFact = async (form: FactFormState, learner: FactLearner | undefined): Promise<void> => {
    if (!factDialog) return;
    const { mode, initial } = factDialog;
    const body = {
      factKey: mode === 'create' ? form.factKey.trim() : initial.factKey,
      text: form.text.trim(),
      subjects: textToList(form.subjects),
      constraintNote: form.constraintNote.trim() || undefined,
      writerNote: form.writerNote.trim(),
      terms: textToList(form.terms),
      revealChapter: parseChapter(form.revealChapter),
    };
    let saved: FactResponse;
    try {
      saved = await upsertFact.mutateAsync(body);
    } catch (err) {
      toast.danger(errorMessage(err));
      return;
    }
    const title = secretTitle(saved.factKey);
    setFactDialog(null);
    if (!learner) {
      toast.success(mode === 'create' ? `Created “${title}”` : 'Saved');
      return;
    }
    try {
      await revealFact.mutateAsync({ factKey: saved.factKey, entityKey: learner.entityKey, chapter: learner.chapter });
      toast.success(`Created “${title}” — ${names.get(learner.entityKey) ?? learner.entityKey} learns it in chapter ${learner.chapter}`);
    } catch (err) {
      toast.danger(`Saved “${title}” as a secret — nobody has learned it yet. Recording who learns it failed: ${errorMessage(err)}`);
    }
  };

  const doDeleteFact = (): void => {
    if (!deleteFactTarget) return;
    deleteFact.mutate(deleteFactTarget.factKey, {
      onSuccess: () => {
        toast.success(`Deleted “${secretTitle(deleteFactTarget.factKey)}”`);
        setDeleteFactTarget(undefined);
        if (deleteFactTarget.factKey === search.fact) void goSearch({ search: { view: 'secrets' } });
      },
      onError: err => toast.danger(err.message),
    });
  };

  const allSecrets = [...secretGroups.planned, ...secretGroups.unplanned];
  const topicGroups = groupWithinTopic(
    filterEntries(
      entries.filter(entry => entry.topic === activeTopic),
      kind,
      secretCounts,
    ),
    activeTopic,
  );
  const searchGroups = searching ? groupByTopic(filterEntries(entries, 'all', secretCounts, query)) : [];
  const secretMatches = searching ? filterFacts(allSecrets, 'all', query) : [];
  const recentGroups = [
    { key: 'week', label: 'Last 7 days', entries: recent.thisWeek },
    { key: 'earlier', label: 'Earlier', entries: recent.earlier },
  ].filter(group => group.entries.length > 0);

  let list: ReactNode;
  let fallback: { entry?: BibleEntry; fact?: FactResponse };
  if (searching) {
    list = (
      <>
        <ListHead title="Search" description={`Everything matching “${query.trim()}”, by topic.`} />
        {searchGroups.length === 0 && secretMatches.length === 0 && <p className={styles.listEmpty}>Nothing matches. Try a name, a guide title or a secret’s key.</p>}
        <EntryGroups novelId={novelId} groups={searchGroups} selectedId={selectedEntry?.id} secretCounts={secretCounts} searchFor={searchForEntry} withKind />
        {secretMatches.length > 0 && (
          <section aria-label="Secrets">
            <h3 className={styles.groupHead}>Secrets · {secretMatches.length}</h3>
            <ul className={styles.rows}>
              {secretMatches.map(fact => (
                <SecretRow
                  key={fact.factKey}
                  novelId={novelId}
                  fact={fact}
                  subjectNames={(fact.subjects ?? []).map(key => names.get(key) ?? key)}
                  search={searchForFact(fact)}
                  selected={fact.factKey === search.fact}
                />
              ))}
            </ul>
          </section>
        )}
      </>
    );
    fallback = { entry: searchGroups[0]?.entries[0], fact: searchGroups.length === 0 ? secretMatches[0] : undefined };
  } else if (view === 'secrets') {
    list = <SecretsList novelId={novelId} groups={secretGroups} names={names} selectedKey={search.fact} searchFor={searchForFact} />;
    fallback = { fact: secretGroups.planned[0] ?? secretGroups.unplanned[0] };
  } else if (view === 'recent') {
    list = (
      <>
        <ListHead title="Recently changed" description="Every record and guide, newest change first." />
        <EntryGroups
          novelId={novelId}
          groups={recentGroups}
          selectedId={selectedEntry?.id}
          secretCounts={secretCounts}
          searchFor={searchForEntry}
          withKind
          metaFor={entry => `${entryMeta(entry, true)} · ${relativeTime(entry.updatedAt)}`}
        />
      </>
    );
    fallback = { entry: recentGroups[0]?.entries[0] };
  } else {
    list = (
      <TopicList
        novelId={novelId}
        topic={activeTopic}
        groups={topicGroups}
        kind={kind}
        onKindChange={setKind}
        emptyPlaceholders={catalogue.emptyDocs.filter(item => item.topic === activeTopic).length}
        onTidy={() => setTidying(true)}
        selectedId={selectedEntry?.id}
        secretCounts={secretCounts}
        searchFor={searchForEntry}
      />
    );
    fallback = { entry: topicGroups[0]?.entries[0] };
  }

  const showFallback = !explicitSelection && !phone;
  const paneFact = search.fact ? factByKey.get(search.fact) : showFallback ? fallback.fact : undefined;
  const paneEntry = search.fact ? undefined : explicitSelection ? selectedEntry : showFallback ? fallback.entry : undefined;
  const placeholder = guideAddress && !selectedEntry ? catalogue.emptyDocs.find(item => docAddress(item.doc) === docAddress(guideAddress)) : undefined;
  const missing = resolved && explicitSelection && !paneFact && !paneEntry;
  const entryTopic = (entityKey: string): BibleTopic | undefined => entryById.get(recordId(entityKey))?.topic;

  let pane: ReactNode;
  if (placeholder) {
    pane = (
      <section className={styles.pane}>
        <Alert intent="info" title={`“${placeholder.doc.title}” is an empty placeholder page`} action={{ label: 'Tidy up', onClick: () => setTidying(true) }}>
          Nothing has been written in it yet, so it is not listed as a guide. Tidy up removes placeholders like this one.
        </Alert>
      </section>
    );
  } else if (missing) {
    pane = (
      <section className={styles.pane}>
        <Alert intent="warning" title="That entry is no longer in the story bible." action={{ label: 'Back to the list', onClick: () => void goSearch({ search: backSearch }) }}>
          It was deleted, renamed, or the link was typed by hand.
        </Alert>
      </section>
    );
  } else if (paneFact) {
    pane = (
      <SecretDetail
        key={paneFact.factKey}
        novelId={novelId}
        fact={paneFact}
        entities={entities}
        names={names}
        backSearch={backSearch}
        onEdit={openEditFact}
        onDelete={setDeleteFactTarget}
      />
    );
  } else if (paneEntry?.kind === 'record') {
    const entity = entityByKey.get(paneEntry.entity.entityKey);
    pane = entity && (
      <EntityPane
        key={entity.entityKey}
        novelId={novelId}
        entity={entity}
        topic={paneEntry.topic}
        facts={facts}
        docs={docs}
        backSearch={backSearch}
        onEdit={target => setEntityDialog({ mode: 'edit', initial: entityFormFrom(target) })}
        onDelete={setDeleteEntityTarget}
        onAddSecret={entityKey => openNewFact(entityKey, 'secret')}
        onAddFact={entityKey => openNewFact(entityKey, 'known')}
        onEditFact={openEditFact}
      />
    );
  } else if (paneEntry?.kind === 'guide') {
    const topicSecrets = allSecrets.filter(fact => (fact.subjects ?? []).some(key => entryTopic(key) === paneEntry.topic)).length;
    pane = (
      <GuidePane
        key={paneEntry.id}
        novelId={novelId}
        doc={paneEntry.doc}
        topic={paneEntry.topic}
        covers={covers.get(docAddress(paneEntry.doc)) ?? []}
        entities={entities}
        topicSecrets={topicSecrets}
        backSearch={backSearch}
      />
    );
  } else if (!phone) {
    pane = (
      <section className={styles.pane}>
        <p className={styles.muted}>{view === 'secrets' ? 'Pick a secret to see its truth and who learns it.' : 'Pick an entry to read it here.'}</p>
      </section>
    );
  }

  const health = resolved
    ? bibleHealth({
        records: entities.length,
        guides: entries.length - entities.length,
        secrets: secretTotal,
        emptyPages: catalogue.emptyDocs.length,
        roles: readinessView.alert ? undefined : readiness.data?.roles,
      })
    : undefined;

  const tabValues: (BibleTopic | BibleView)[] = [...topics, 'secrets', 'recent'];
  const tabCount = (value: BibleTopic | BibleView): number => (value === 'secrets' ? secretTotal : value === 'recent' ? recent.thisWeek.length : counts[value]);
  const tabLabel = (value: BibleTopic | BibleView): string => (value === 'secrets' || value === 'recent' ? VIEW_LABEL[value] : TOPIC_LABEL[value]);
  const tabsKey = tabValues.map(value => `${value}:${tabCount(value)}`).join('|');
  const { observeContainer, measureList, fits: tabsFit } = useTabsFit(tabsKey);

  let body: ReactNode;
  if (failure) {
    body = (
      <Alert intent="danger" title="Couldn’t load the story bible" action={{ label: 'Retry', onClick: () => window.location.reload() }}>
        {failure.message}
      </Alert>
    );
  } else if (!resolved) {
    body = <PaneLoader />;
  } else if (entities.length === 0 && docs.length === 0) {
    body = (
      <EmptyState
        icon={<SparkIcon size={24} />}
        title="Draft the story bible"
        description={SEED_DESCRIPTION}
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
    );
  } else {
    const split = (
      <div className={styles.split} data-has-selection={explicitSelection || undefined}>
        <nav className={styles.listCol} aria-label={searching ? 'Search results' : tabLabel(tabValue)}>
          {list}
        </nav>
        {pane}
      </div>
    );
    body = (
      <>
        <div className={styles.notices}>
          {health && <BibleHealth health={health} suggestions={readinessView.suggestions} onTidy={() => setTidying(true)} />}
          {readinessView.alert && readiness.data && <BibleReadiness report={readiness.data} onAudit={runAudit} auditPending={audit.isPending} />}
        </div>
        <div ref={observeContainer} className={styles.tabs}>
          {tabsFit ? (
            <Tabs value={tabValue} onValueChange={pickTab} className={styles.tabs}>
              <Tabs.List key={tabsKey} ref={measureList} aria-label="Story Bible topics" className={styles.tabList}>
                {tabValues.map(value => (
                  <Tabs.Tab
                    key={value}
                    value={value}
                    count={tabCount(value)}
                    icon={value === 'secrets' ? <LockIcon size={14} /> : undefined}
                    className={value === 'secrets' ? styles.viewTabStart : undefined}
                  >
                    {tabLabel(value)}
                  </Tabs.Tab>
                ))}
              </Tabs.List>
              {tabValues.map(value => (
                <Tabs.Panel key={value} value={value}>
                  {split}
                </Tabs.Panel>
              ))}
            </Tabs>
          ) : (
            <>
              <div className={styles.picker}>
                <label className={styles.pickerLabel} htmlFor={pickerId}>
                  Showing
                </label>
                <Select triggerId={pickerId} size="sm" value={tabValue} onValueChange={pickTab} className={styles.pickerSelect}>
                  <Select.Group label="Topics">
                    {topics.map(value => (
                      <Select.Item key={value} value={value}>
                        {`${tabLabel(value)} · ${tabCount(value)}`}
                      </Select.Item>
                    ))}
                  </Select.Group>
                  <Select.Separator />
                  <Select.Group label="Views">
                    {VIEWS.map(value => (
                      <Select.Item key={value} value={value}>
                        {`${tabLabel(value)} · ${tabCount(value)}`}
                      </Select.Item>
                    ))}
                  </Select.Group>
                </Select>
              </div>
              {split}
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <div className={`nf-page ${styles.page}`} data-has-selection={explicitSelection || undefined}>
      <header className={styles.header}>
        <div className={styles.titleBlock}>
          <h1 className={styles.title}>Story Bible</h1>
          <p className={styles.subtitle}>Everything the writer checks each chapter against — people, places, rules, and the secrets it must keep.</p>
        </div>
        <div className={styles.headerActions}>
          <label className="sr-only" htmlFor={searchId}>
            Search the bible
          </label>
          <Input
            id={searchId}
            className={styles.search}
            type="search"
            size="sm"
            clearable
            prefix={<SearchIcon size={14} />}
            placeholder="Search names, guides, secrets…"
            value={query}
            onValueChange={setQuery}
          />
          <Button variant="secondary" loading={audit.isPending} onClick={runAudit} className={styles.auditButton}>
            Run bible audit
          </Button>
          <Button variant="primary" className={styles.newButton} onClick={() => setEntityDialog({ mode: 'create', initial: emptyEntityForm(newEntryType(activeTopic)) })}>
            New entry
          </Button>
        </div>
      </header>

      {body}

      {entityDialog && (
        <EntityDialog
          onOpenChange={next => !next && setEntityDialog(null)}
          mode={entityDialog.mode}
          initial={entityDialog.initial}
          pending={createEntity.isPending || updateEntity.isPending}
          onSubmit={submitEntity}
        />
      )}

      {factDialog && (
        <FactDialog
          {...factDialog}
          entities={entities}
          onOpenChange={next => !next && setFactDialog(null)}
          pending={upsertFact.isPending || revealFact.isPending}
          onSubmit={(form, learner) => void submitFact(form, learner)}
        />
      )}

      <Dialog open={Boolean(deleteEntityTarget)} onOpenChange={open => !open && setDeleteEntityTarget(undefined)}>
        <Dialog.Content size="sm">
          <Dialog.Header title={`Delete “${deleteEntityTarget?.name ?? 'this entry'}”?`} description="This removes the record from the story bible. It cannot be undone." />
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="danger" loading={deleteEntity.isPending} onClick={doDeleteEntity}>
              Delete entry
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>

      <Dialog open={Boolean(deleteFactTarget)} onOpenChange={open => !open && setDeleteFactTarget(undefined)}>
        <Dialog.Content size="sm">
          <Dialog.Header
            title={`Delete “${deleteFactTarget ? secretTitle(deleteFactTarget.factKey) : 'this fact'}”?`}
            description="This removes the fact and everything recorded about who learns it. It cannot be undone."
          />
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="danger" loading={deleteFact.isPending} onClick={doDeleteFact}>
              Delete
            </Button>
          </Dialog.Footer>
        </Dialog.Content>
      </Dialog>

      <BibleTidyDialog novelId={novelId} open={tidying} onOpenChange={setTidying} />
    </div>
  );
}
