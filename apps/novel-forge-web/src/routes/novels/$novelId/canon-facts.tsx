import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { Button, Dialog, FormField, Input, Select, Textarea, toast, Tooltip } from '@shadow-library/ui';

import { EyeIcon, EyeOffIcon, PlusIcon, TrashIcon } from '@/components/icons';
import { PaneError, PaneLoader, RowAction, StatusChip } from '@/components/nf';
import {
  type FactResponse,
  type ListEntityResponse,
  listFactsQueryOptions,
  useDeleteFactMutation,
  useFactQuery,
  useListEntitiesQuery,
  useListFactsQuery,
  useRetractKnowledgeMutation,
  useRevealFactMutation,
  useUpsertFactMutation,
} from '@/lib/apis';
import { relativeTime } from '@/lib/format';

import styles from './canon-facts.module.css';

interface FactsSearch {
  fact?: string;
}

export const Route = createFileRoute('/novels/$novelId/canon-facts')({
  validateSearch: (search: Record<string, unknown>): FactsSearch => ({
    fact: typeof search.fact === 'string' && search.fact ? search.fact : undefined,
  }),
  loader: ({ context, params }) => context.queryClient.prefetchQuery(listFactsQueryOptions(params.novelId)),
  component: CanonFactsScreen,
});

function isRevealed(fact: Pick<FactResponse, 'knowledge'>): boolean {
  return fact.knowledge.length > 0;
}

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
  terms: string;
  revealChapter: string;
}

function emptyForm(): FactFormState {
  return { factKey: '', text: '', subjects: '', constraintNote: '', terms: '', revealChapter: '' };
}

function formFromFact(fact: FactResponse): FactFormState {
  return {
    factKey: fact.factKey,
    text: fact.text,
    subjects: listToText(fact.subjects),
    constraintNote: fact.constraintNote ?? '',
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
  useEffect(() => {
    if (open) setForm(initial);
  }, [open, initial]);
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
            <FormField label="Behavioral constraint" helper="POV-safe behavior injected while the fact is still hidden, e.g. “Elias deflects questions about Tuesday night.”">
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

  useEffect(() => {
    if (open) {
      setEntityKey(entities[0]?.entityKey ?? '');
      setChapter('');
      setNote('');
    }
  }, [open, entities]);

  const chapterNum = Number(chapter);
  const invalid = !entityKey || !Number.isInteger(chapterNum) || chapterNum < 1;

  const submit = (): void => {
    reveal.mutate(
      { entityKey, chapter: chapterNum, note: note.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(`Revealed to ${entityKey} at chapter ${chapterNum}`);
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
              <Select value={entityKey} onValueChange={setEntityKey}>
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

interface FactDetailProps {
  novelId: string;
  factKey: string;
  onEdit: (fact: FactResponse) => void;
}

function FactDetail({ novelId, factKey, onEdit }: FactDetailProps): React.JSX.Element {
  const factQuery = useFactQuery(novelId, factKey);
  const entitiesQuery = useListEntitiesQuery(novelId, { limit: 500 });
  const retract = useRetractKnowledgeMutation(novelId, factKey);
  const [spoilerShown, setSpoilerShown] = useState(false);
  const [revealOpen, setRevealOpen] = useState(false);

  useEffect(() => setSpoilerShown(false), [factKey]);

  if (factQuery.isLoading) return <PaneLoader />;
  if (factQuery.error) return <PaneError error={factQuery.error} />;
  const fact = factQuery.data;
  if (!fact) return <PaneLoader />;

  const revealed = isRevealed(fact);
  const entities = entitiesQuery.data?.items ?? [];

  const doRetract = (entityKey: string): void => {
    retract.mutate(entityKey, {
      onSuccess: () => toast.success(`Retracted ${entityKey}’s knowledge of “${fact.factKey}”`),
      onError: err => toast.danger(err.message),
    });
  };

  return (
    <>
      <div className={styles.detailHead}>
        <div className={styles.detailTitleWrap}>
          <h2 className={styles.detailTitle}>{fact.factKey}</h2>
          <StatusChip intent={revealed ? 'success' : 'warning'} dot>
            {revealed ? `revealed to ${fact.knowledge.length}` : 'hidden'}
          </StatusChip>
        </div>
        <div className={styles.spacer} />
        <Button variant="ghost" onClick={() => onEdit(fact)}>
          Edit
        </Button>
      </div>
      <div className={`nf-scroll ${styles.paneScroll}`}>
        <div className={styles.detailInner}>
          <div className={styles.spoilerBlock}>
            <div className={styles.sectionLabel}>Truth · judge-only — never shown to the chapter writer</div>
            {spoilerShown ? (
              <div className={styles.spoilerRevealed}>
                <p className={styles.spoilerText}>{fact.text}</p>
                <Button variant="ghost" size="sm" prefix={<EyeOffIcon size={14} />} onClick={() => setSpoilerShown(false)}>
                  Hide spoiler
                </Button>
              </div>
            ) : (
              <button type="button" className={styles.spoilerHidden} onClick={() => setSpoilerShown(true)}>
                <span className={styles.spoilerBlur}>{fact.text}</span>
                <span className={styles.spoilerCta}>
                  <EyeIcon size={14} /> Click to reveal spoiler
                </span>
              </button>
            )}
          </div>

          {fact.constraintNote && (
            <div>
              <div className={styles.sectionLabel}>Behavioral constraint while hidden</div>
              <p className={styles.para}>{fact.constraintNote}</p>
            </div>
          )}

          <div className={styles.chips}>
            {(fact.subjects ?? []).map(s => (
              <StatusChip key={s} intent="neutral">
                {s}
              </StatusChip>
            ))}
            {fact.revealChapter != null && <StatusChip intent="info">planned reveal · ch. {fact.revealChapter}</StatusChip>}
          </div>

          {(fact.terms ?? []).length > 0 && (
            <div>
              <div className={styles.sectionLabel}>Leak-scan terms</div>
              <div className={styles.chips}>
                {(fact.terms ?? []).map(t => (
                  <StatusChip key={t} intent="neutral">
                    {t}
                  </StatusChip>
                ))}
              </div>
            </div>
          )}

          <div className={styles.sectionHeadRow}>
            <div className={styles.sectionLabel}>Reveal ledger</div>
            <div className={styles.spacer} />
            <Button variant="secondary" size="sm" prefix={<EyeIcon size={14} />} onClick={() => setRevealOpen(true)}>
              Reveal to character
            </Button>
          </div>
          {fact.knowledge.length === 0 ? (
            <p className={styles.emptyLedger}>No character knows this yet — it stays out of every drafting pack until revealed.</p>
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
                  <RowAction label={`Retract ${entry.entityName}’s knowledge`} danger onClick={() => doRetract(entry.entityKey)}>
                    <TrashIcon size={13} />
                  </RowAction>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <RevealDialog novelId={novelId} factKey={factKey} entities={entities} open={revealOpen} onOpenChange={setRevealOpen} />
    </>
  );
}

function CanonFactsScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const { fact: factParam } = Route.useSearch();
  const goSearch = Route.useNavigate();
  const factsQuery = useListFactsQuery(novelId);
  const facts = useMemo(() => [...(factsQuery.data?.facts ?? [])].sort((a, b) => a.factKey.localeCompare(b.factKey)), [factsQuery.data]);
  const [dialog, setDialog] = useState<FactDialogState | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<FactResponse | undefined>();

  const selectFact = (key?: string): Promise<void> => goSearch({ search: { fact: key } });
  const selectedKey = factParam && facts.some(f => f.factKey === factParam) ? factParam : facts[0]?.factKey;

  const upsertFact = useUpsertFactMutation(novelId);
  const deleteFact = useDeleteFactMutation(novelId);

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

  const submit = (form: FactFormState): void => {
    const body = {
      factKey: dialog?.mode === 'create' ? form.factKey.trim() : (dialog?.initial.factKey ?? ''),
      text: form.text.trim(),
      subjects: textToList(form.subjects),
      constraintNote: form.constraintNote.trim() || undefined,
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

  return (
    <div className="nf-splitpane">
      <div className="nf-rail">
        <div className={styles.railHead}>
          <div className={styles.railTitleRow}>
            <span className={styles.railTitle}>Canon Facts</span>
            <div className={styles.spacer} />
            <Tooltip content="New fact">
              <Button variant="ghost" size="sm" prefix={<PlusIcon />} onClick={() => setDialog({ mode: 'create', initial: emptyForm() })}>
                New
              </Button>
            </Tooltip>
          </div>
          <p className={styles.railHint}>The spoiler ledger — truths only the judge sees until a character earns them on-page.</p>
        </div>
        <div className={`nf-scroll ${styles.railList}`}>
          {factsQuery.isLoading && <PaneLoader />}
          {factsQuery.error && <PaneError error={factsQuery.error} />}
          {!factsQuery.isLoading && facts.length === 0 && <div className="nf-emptynote">No canon facts yet.</div>}
          {facts.map(fact => {
            const selected = fact.factKey === selectedKey;
            const revealed = isRevealed(fact);
            return (
              <div
                key={fact.id}
                role="button"
                tabIndex={0}
                className={`nf-selrow ${styles.factRow}`}
                data-active={selected || undefined}
                onClick={() => selectFact(fact.factKey)}
                onKeyDown={e => e.key === 'Enter' && selectFact(fact.factKey)}
              >
                <div className={styles.factBody}>
                  <div className={styles.factName}>{fact.factKey}</div>
                  <div className={styles.factSub}>{revealed ? `revealed to ${fact.knowledge.length}` : 'hidden'}</div>
                </div>
                <StatusChip intent={revealed ? 'success' : 'warning'} dot>
                  {revealed ? 'revealed' : 'hidden'}
                </StatusChip>
                <div className="nf-rowactions">
                  <RowAction label={`Delete ${fact.factKey}`} danger onClick={() => setDeleteTarget(fact)}>
                    <TrashIcon size={13} />
                  </RowAction>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="nf-detail">
        {selectedKey ? (
          <FactDetail novelId={novelId} factKey={selectedKey} onEdit={fact => setDialog({ mode: 'edit', initial: formFromFact(fact) })} />
        ) : (
          <div className="nf-pane-empty">Select a fact to see its detail, or create one.</div>
        )}
      </div>

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
    </div>
  );
}
