import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { Alert, Button, Dialog, FormField, IconButton, Input, Select, Textarea, toast, Tooltip } from '@shadow-library/ui';

import { EyeIcon, EyeOffIcon, LockIcon, SearchIcon, TrashIcon } from '@/components/icons';
import { useCollectionJump } from '@/components/Layout';
import { CollectionPage, DetailPage, EmptyState, ItemPager, type ItemPagerJump, PaneError, PaneLoader, RowAction, StatusChip } from '@/components/nf';
import {
  type FactResponse,
  type ListEntityResponse,
  listFactsQueryOptions,
  useDeleteFactMutation,
  useListEntitiesQuery,
  useListFactsQuery,
  useRetractKnowledgeMutation,
  useRevealFactMutation,
  useUpsertFactMutation,
} from '@/lib/apis';
import {
  backLabel,
  countByState,
  factAttachments,
  factCaption,
  type FactCategory,
  type FactState,
  factState,
  filterFacts,
  initialSpoilerState,
  parseFactState,
  sortFactsByKey,
  type SpoilerState,
  spoilerToggleLabel,
  STATE_LABEL,
} from '@/lib/canon-facts';
import { relativeTime } from '@/lib/format';

import styles from './canon-facts.module.css';

interface FactsSearch {
  state?: FactState;
  fact?: string;
}

export const Route = createFileRoute('/novels/$novelId/canon-facts')({
  validateSearch: (search: Record<string, unknown>): FactsSearch => ({
    state: parseFactState(search.state),
    fact: typeof search.fact === 'string' && search.fact ? search.fact : undefined,
  }),
  loader: ({ context, params }) => context.queryClient.prefetchQuery(listFactsQueryOptions(params.novelId)),
  component: CanonFactsScreen,
});

function listToText(values?: string[] | null): string {
  return (values ?? []).join(', ');
}

function textToList(value: string): string[] | undefined {
  const items = value
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

interface FactFormState {
  factKey: string;
  text: string;
  subjects: string;
  constraintNote: string;
  writerNote: string;
  terms: string;
  revealChapter: string;
}

function emptyForm(): FactFormState {
  return { factKey: '', text: '', subjects: '', constraintNote: '', writerNote: '', terms: '', revealChapter: '' };
}

function formFromFact(fact: FactResponse): FactFormState {
  return {
    factKey: fact.factKey,
    text: fact.text,
    subjects: listToText(fact.subjects),
    constraintNote: fact.constraintNote ?? '',
    writerNote: fact.writerNote ?? '',
    terms: listToText(fact.terms),
    revealChapter: fact.revealChapter != null ? String(fact.revealChapter) : '',
  };
}

interface FactDialogState {
  mode: 'create' | 'edit';
  initial: FactFormState;
}

interface FactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  initial: FactFormState;
  onSubmit: (form: FactFormState) => void;
  pending: boolean;
}

function FactDialog({ open, onOpenChange, mode, initial, onSubmit, pending }: FactDialogProps): React.JSX.Element {
  const [form, setForm] = useState(initial);
  const set = <K extends keyof FactFormState>(key: K, value: FactFormState[K]): void => setForm(prev => ({ ...prev, [key]: value }));
  const chapterValid = form.revealChapter.trim() === '' || (/^\d+$/.test(form.revealChapter.trim()) && Number(form.revealChapter) >= 1);
  const invalid = !form.text.trim() || (mode === 'create' && !form.factKey.trim()) || !chapterValid;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="md">
        <Dialog.Header
          title={mode === 'create' ? 'New canon fact' : 'Edit canon fact'}
          description="The truth text is judge-only — it is never shown to the chapter-drafting model."
        />
        <Dialog.Body>
          <div className={styles.dialogForm}>
            {mode === 'create' && (
              <FormField label="Key" required helper="Stable id, e.g. ledger_forgery">
                <Input value={form.factKey} onValueChange={v => set('factKey', v)} autoFocus />
              </FormField>
            )}
            <FormField label="Truth" required helper="Judge-only — never shown to the chapter writer. State the full spoiler plainly.">
              <Textarea value={form.text} onValueChange={v => set('text', v)} minRows={3} autoGrow autoFocus={mode === 'edit'} />
            </FormField>
            <FormField
              label="Note for the writer"
              helper="The only thing the chapter writer sees while the fact is hidden — say how to behave without naming the truth, e.g. “Elias deflects questions about Tuesday night.” Leave blank to withhold the fact entirely."
            >
              <Textarea value={form.writerNote} onValueChange={v => set('writerNote', v)} minRows={2} autoGrow />
            </FormField>
            <FormField label="Author note" helper="For you only — never shown to the chapter writer.">
              <Textarea value={form.constraintNote} onValueChange={v => set('constraintNote', v)} minRows={2} autoGrow />
            </FormField>
            <div className={styles.dialogGrid}>
              <FormField label="Subjects" helper="Entity keys this fact concerns, comma-separated">
                <Input value={form.subjects} onValueChange={v => set('subjects', v)} placeholder="detective_amara, sergeant_boone" />
              </FormField>
              <FormField label="Planned reveal chapter" helper="Authoring aid only — the ledger is truth">
                <Input value={form.revealChapter} onValueChange={v => set('revealChapter', v)} placeholder="e.g. 12" />
              </FormField>
            </div>
            <FormField label="Leak-scan terms" helper="Lexical terms the pre-scan checks drafts against, comma-separated">
              <Input value={form.terms} onValueChange={v => set('terms', v)} placeholder="ledger, service corridor" />
            </FormField>
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" loading={pending} disabled={invalid} onClick={() => onSubmit(form)}>
            {mode === 'create' ? 'Create fact' : 'Save changes'}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

interface RevealDialogProps {
  novelId: string;
  factKey: string;
  entities: ListEntityResponse['items'];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function RevealDialog({ novelId, factKey, entities, open, onOpenChange }: RevealDialogProps): React.JSX.Element {
  const reveal = useRevealFactMutation(novelId, factKey);
  const [entityKey, setEntityKey] = useState('');
  const [chapter, setChapter] = useState('');
  const [note, setNote] = useState('');

  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) {
      setEntityKey('');
      setChapter('');
      setNote('');
    }
  }

  const resolvedEntityKey = entityKey || (entities[0]?.entityKey ?? '');
  const chapterNum = Number(chapter);
  const invalid = !resolvedEntityKey || !Number.isInteger(chapterNum) || chapterNum < 1;

  const submit = (): void => {
    reveal.mutate(
      { entityKey: resolvedEntityKey, chapter: chapterNum, note: note.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(`Revealed to ${resolvedEntityKey} at chapter ${chapterNum}`);
          onOpenChange(false);
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="sm">
        <Dialog.Header title="Reveal fact to a character" description="Records a ledger entry — the drafter sees this fact for chapters at or after this one." />
        <Dialog.Body>
          <div className={styles.dialogForm}>
            <FormField label="Character" required>
              <Select value={resolvedEntityKey} onValueChange={setEntityKey}>
                {entities.map(e => (
                  <Select.Item key={e.entityKey} value={e.entityKey}>
                    {e.name}
                  </Select.Item>
                ))}
              </Select>
            </FormField>
            <FormField label="Learned in chapter" required>
              <Input type="number" min={1} value={chapter} onValueChange={setChapter} />
            </FormField>
            <FormField label="Note">
              <Input value={note} onValueChange={setNote} placeholder="Optional context for this reveal" />
            </FormField>
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" loading={reveal.isPending} disabled={invalid} onClick={submit}>
            Reveal
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

interface SpoilerBlockProps {
  factKey: string;
  text: string;
  state: FactState;
}

/** The concealed text is `aria-hidden`: a blur a screen reader reads straight through is decoration, not a spoiler guard. */
function SpoilerBlock({ factKey, text, state }: SpoilerBlockProps): React.JSX.Element {
  const [spoiler, setSpoiler] = useState<SpoilerState>(() => initialSpoilerState(state));
  const label = spoilerToggleLabel(spoiler, factKey);

  return (
    <section className={styles.spoilerBlock}>
      <div className={styles.sectionLabel}>Truth · judge-only — never shown to the chapter writer</div>
      {spoiler === 'shown' ? (
        <div className={styles.spoilerRevealed}>
          <p className={styles.spoilerText}>{text}</p>
          <Button variant="ghost" size="sm" prefix={<EyeOffIcon size={14} />} aria-label={label} onClick={() => setSpoiler('concealed')}>
            Hide spoiler
          </Button>
        </div>
      ) : (
        <button type="button" className={styles.spoilerHidden} aria-label={label} onClick={() => setSpoiler('shown')}>
          <span className={styles.spoilerBlur} aria-hidden="true">
            {text}
          </span>
          <span className={styles.spoilerCta} aria-hidden="true">
            <EyeIcon size={14} /> Click to reveal spoiler
          </span>
        </button>
      )}
    </section>
  );
}

interface FactAsideProps {
  novelId: string;
  fact: FactResponse;
  names: ReadonlyMap<string, string>;
  onReveal: () => void;
}

function FactAside({ novelId, fact, names, onReveal }: FactAsideProps): React.JSX.Element {
  const retract = useRetractKnowledgeMutation(novelId, fact.factKey);
  const attachments = useMemo(() => factAttachments(fact, names), [fact, names]);

  const doRetract = (entityKey: string, entityName: string): void => {
    retract.mutate(entityKey, {
      onSuccess: () => toast.success(`Retracted ${entityName}’s knowledge of “${fact.factKey}”`),
      onError: err => toast.danger(err.message),
    });
  };

  return (
    <>
      <section className={styles.asideBlock}>
        <h2 className={styles.asideTitle}>Reveal ledger</h2>
        <p className={styles.asideMeta}>{fact.revealChapter != null ? `Planned reveal · chapter ${fact.revealChapter}` : 'No planned reveal chapter'}</p>
        {fact.knowledge.length === 0 ? (
          <p className={styles.asideNote}>No character knows this yet — it stays out of every drafting pack until revealed.</p>
        ) : (
          <div className={styles.ledger}>
            {fact.knowledge.map(entry => (
              <div key={entry.entityKey} className={styles.ledgerRow}>
                <div className={styles.ledgerMain}>
                  <span className={styles.ledgerName}>{entry.entityName}</span>
                  <span className={styles.ledgerMeta}>
                    ch. {entry.learnedInChapter} · {entry.source} · {relativeTime(entry.createdAt)}
                  </span>
                  {entry.note && <span className={styles.ledgerNote}>{entry.note}</span>}
                </div>
                <RowAction label={`Retract ${entry.entityName}’s knowledge`} danger onClick={() => doRetract(entry.entityKey, entry.entityName)}>
                  <TrashIcon size={13} />
                </RowAction>
              </div>
            ))}
          </div>
        )}
        <Button variant="secondary" size="sm" className={styles.asideAction} prefix={<EyeIcon size={14} />} onClick={onReveal}>
          Reveal to character
        </Button>
      </section>

      <section className={styles.asideBlock}>
        <h2 className={styles.asideTitle}>Attached to</h2>
        {attachments.length === 0 ? (
          <p className={styles.asideNote}>This fact names no entity yet — add subjects so the leak scan knows who it belongs to.</p>
        ) : (
          <ul className={styles.attachments}>
            {attachments.map(attachment => (
              <li key={attachment.entityKey}>
                {attachment.kind === 'linked' ? (
                  <Link to="/novels/$novelId/story-bible" params={{ novelId }} search={{ entity: attachment.entityKey }} className={styles.attachment}>
                    <span className={styles.attachmentName}>{attachment.name}</span>
                    <span className={styles.attachmentKey}>{attachment.entityKey}</span>
                  </Link>
                ) : (
                  <span className={styles.attachment} data-missing="true">
                    <span className={styles.attachmentKey}>{attachment.entityKey}</span>
                    <span className={styles.attachmentNote}>no longer in the story bible</span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

interface FactDetailProps {
  novelId: string;
  fact: FactResponse;
  total: number | undefined;
  filterState: FactState | undefined;
  ids: readonly string[] | undefined;
  jump?: ItemPagerJump;
  onSelect: (factKey: string) => void;
  onEdit: (fact: FactResponse) => void;
  onDelete: (fact: FactResponse) => void;
}

function FactDetail({ novelId, fact, total, filterState, ids, jump, onSelect, onEdit, onDelete }: FactDetailProps): React.JSX.Element {
  const entitiesQuery = useListEntitiesQuery(novelId, { limit: 500 });
  const entities = useMemo(() => entitiesQuery.data?.items ?? [], [entitiesQuery.data]);
  const names = useMemo(() => new Map(entities.map(entity => [entity.entityKey, entity.name])), [entities]);
  const [revealOpen, setRevealOpen] = useState(false);
  const state = factState(fact);

  return (
    <>
      <DetailPage
        back={
          <Link to="/novels/$novelId/canon-facts" params={{ novelId }} search={{ state: filterState }}>
            {backLabel(total)}
          </Link>
        }
        identity={
          <DetailPage.Identity title={<span className={styles.identityKey}>{fact.factKey}</span>}>
            <StatusChip intent={state === 'revealed' ? 'success' : 'warning'} dot>
              {state}
            </StatusChip>
          </DetailPage.Identity>
        }
        pager={<ItemPager ids={ids} currentId={fact.factKey} onSelect={onSelect} itemNoun="fact" jump={jump} />}
        actions={
          <>
            <Button variant="ghost" onClick={() => onEdit(fact)}>
              Edit
            </Button>
            <Tooltip content={`Delete ${fact.factKey}`}>
              <IconButton variant="ghost" size="sm" aria-label={`Delete ${fact.factKey}`} icon={<TrashIcon size={15} />} onClick={() => onDelete(fact)} />
            </Tooltip>
          </>
        }
        aside={<FactAside novelId={novelId} fact={fact} names={names} onReveal={() => setRevealOpen(true)} />}
        asideLabel={`${fact.factKey} reveal context`}
      >
        <SpoilerBlock key={fact.factKey} factKey={fact.factKey} text={fact.text} state={state} />

        <DetailPage.Prose className={styles.constraint}>
          <div className={styles.sectionLabel}>Note for the writer while hidden</div>
          <p className={styles.para}>{fact.writerNote ?? 'None — the chapter writer sees nothing of this fact until it is revealed.'}</p>
        </DetailPage.Prose>

        {fact.constraintNote && (
          <DetailPage.Prose className={styles.constraint}>
            <div className={styles.sectionLabel}>Author note</div>
            <p className={styles.para}>{fact.constraintNote}</p>
          </DetailPage.Prose>
        )}

        {(fact.terms ?? []).length > 0 && (
          <div className={styles.termsSection}>
            <div className={styles.sectionLabel}>Leak-scan terms</div>
            <div className={styles.chips}>
              {(fact.terms ?? []).map(term => (
                <StatusChip key={term} intent="neutral">
                  {term}
                </StatusChip>
              ))}
            </div>
          </div>
        )}
      </DetailPage>

      <RevealDialog novelId={novelId} factKey={fact.factKey} entities={entities} open={revealOpen} onOpenChange={setRevealOpen} />
    </>
  );
}

function CanonFactsScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const { state: stateParam, fact: factParam } = Route.useSearch();
  const goSearch = Route.useNavigate();
  const factsQuery = useListFactsQuery(novelId);
  const facts = useMemo(() => sortFactsByKey(factsQuery.data?.facts ?? []), [factsQuery.data]);
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<FactDialogState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FactResponse | undefined>();

  const upsertFact = useUpsertFactMutation(novelId);
  const deleteFact = useDeleteFactMutation(novelId);

  const activeState: FactCategory = stateParam ?? 'all';
  const resolved = !factsQuery.isLoading && !factsQuery.error;
  const total = resolved ? facts.length : undefined;

  const counts = useMemo(() => countByState(facts), [facts]);
  const visible = useMemo(() => filterFacts(facts, activeState, query), [facts, activeState, query]);
  const byKey = useMemo(() => new Map(facts.map(fact => [fact.factKey, fact])), [facts]);
  const visibleIds = useMemo(() => (resolved ? visible.map(fact => fact.factKey) : undefined), [resolved, visible]);

  const selected = factParam ? byKey.get(factParam) : undefined;
  const selectFact = (factKey?: string): Promise<void> => goSearch({ search: { state: stateParam, fact: factKey } });
  const pickState = (value: string): Promise<void> => goSearch({ search: { state: parseFactState(value) } });
  const clearFilters = (): void => {
    setQuery('');
    void goSearch({ search: {} });
  };

  const filtering = stateParam !== undefined || query.trim() !== '';
  const jumpItems = useMemo(() => visible.map(fact => ({ id: fact.factKey, label: fact.factKey, caption: factCaption(fact) })), [visible]);
  const allJumpItems = useMemo(() => (filtering ? facts.map(fact => ({ id: fact.factKey, label: fact.factKey, caption: factCaption(fact) })) : undefined), [filtering, facts]);
  const jump = useCollectionJump(
    resolved
      ? {
          collection: 'canon facts',
          items: jumpItems,
          filterLabel: stateParam ? STATE_LABEL[stateParam] : undefined,
          allItems: allJumpItems,
          currentId: factParam,
          onSelect: key => void selectFact(key),
        }
      : null,
  );

  const submit = (form: FactFormState): void => {
    const body = {
      factKey: dialog?.mode === 'create' ? form.factKey.trim() : (dialog?.initial.factKey ?? ''),
      text: form.text.trim(),
      subjects: textToList(form.subjects),
      constraintNote: form.constraintNote.trim() || undefined,
      writerNote: form.writerNote.trim(),
      terms: textToList(form.terms),
      revealChapter: form.revealChapter.trim() ? Number(form.revealChapter) : undefined,
    };
    upsertFact.mutate(body, {
      onSuccess: created => {
        toast.success(dialog?.mode === 'create' ? `Created fact “${created.factKey}”` : 'Fact updated');
        setDialog(null);
        if (dialog?.mode === 'create') selectFact(created.factKey);
      },
      onError: err => toast.danger(err.message),
    });
  };

  const doDelete = (): void => {
    if (!deleteTarget) return;
    deleteFact.mutate(deleteTarget.factKey, {
      onSuccess: () => {
        toast.success(`Deleted fact “${deleteTarget.factKey}”`);
        setDeleteTarget(undefined);
        if (deleteTarget.factKey === factParam) selectFact(undefined);
      },
      onError: err => toast.danger(err.message),
    });
  };

  const dialogs = (
    <>
      {dialog && <FactDialog open onOpenChange={next => !next && setDialog(null)} mode={dialog.mode} initial={dialog.initial} pending={upsertFact.isPending} onSubmit={submit} />}

      <Dialog open={Boolean(deleteTarget)} onOpenChange={o => !o && setDeleteTarget(undefined)}>
        <Dialog.Content size="sm">
          <Dialog.Header title={`Delete “${deleteTarget?.factKey ?? 'this fact'}”?`} description="This removes the fact and its entire reveal ledger. It cannot be undone." />
          <Dialog.Footer>
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="danger" loading={deleteFact.isPending} onClick={doDelete}>
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
        <FactDetail
          novelId={novelId}
          fact={selected}
          total={total}
          filterState={stateParam}
          ids={visibleIds}
          jump={jump}
          onSelect={key => void selectFact(key)}
          onEdit={fact => setDialog({ mode: 'edit', initial: formFromFact(fact) })}
          onDelete={setDeleteTarget}
        />
        {dialogs}
      </>
    );

  return (
    <>
      <CollectionPage
        title="Canon Facts"
        subtitle="The spoiler ledger — truths only the judge sees until a character earns them on-page."
        total={total}
        actions={
          <Button variant="primary" onClick={() => setDialog({ mode: 'create', initial: emptyForm() })}>
            New fact
          </Button>
        }
        filter={{ label: 'Filter canon facts', placeholder: 'Filter by key, subject or term…', value: query, onValueChange: setQuery }}
        notice={
          resolved &&
          factParam && (
            <Alert intent="warning" title="That canon fact is no longer in the ledger." action={{ label: 'Back to the directory', onClick: () => void selectFact(undefined) }}>
              It was deleted, its key was changed, or the link was typed by hand.
            </Alert>
          )
        }
        segments={{
          label: 'Reveal state',
          value: activeState,
          onValueChange: pickState,
          items: [
            { value: 'all', label: STATE_LABEL.all, count: facts.length },
            { value: 'hidden', label: STATE_LABEL.hidden, count: counts.hidden },
            { value: 'revealed', label: STATE_LABEL.revealed, count: counts.revealed },
          ],
        }}
        empty={
          <EmptyState
            icon={<LockIcon size={24} />}
            title="No canon facts yet"
            description="A canon fact is a truth the judge holds back — the drafting model never sees it until a character earns it on-page. Write the first one and the leak scan starts guarding it."
            actions={
              <Button variant="primary" onClick={() => setDialog({ mode: 'create', initial: emptyForm() })}>
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
        ) : visible.length === 0 ? (
          <EmptyState
            icon={<SearchIcon size={24} />}
            title="Nothing matches"
            description={`No ${activeState === 'all' ? '' : `${activeState} `}canon fact matches this filter.`}
            actions={
              <Button variant="secondary" onClick={clearFilters}>
                Clear the filter
              </Button>
            }
          />
        ) : (
          <CollectionPage.Rows>
            {visible.map(fact => (
              <CollectionPage.Row
                key={fact.id}
                link={<Link to="/novels/$novelId/canon-facts" params={{ novelId }} search={{ state: stateParam, fact: fact.factKey }} />}
                title={<span className={styles.rowKey}>{fact.factKey}</span>}
                trailing={
                  <StatusChip intent={factState(fact) === 'revealed' ? 'success' : 'warning'} dot>
                    {factCaption(fact)}
                  </StatusChip>
                }
                actions={
                  <RowAction label={`Delete ${fact.factKey}`} danger onClick={() => setDeleteTarget(fact)}>
                    <TrashIcon size={13} />
                  </RowAction>
                }
              />
            ))}
          </CollectionPage.Rows>
        )}
      </CollectionPage>
      {dialogs}
    </>
  );
}
