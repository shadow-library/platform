import { createFileRoute, Link, redirect } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { Button, Dialog, FormField, IconButton, Input, Select, Textarea, toast, Tooltip } from '@shadow-library/ui';

import { EyeIcon, EyeOffIcon, TrashIcon } from '@/components/icons';
import { DetailPage, ItemPager, type ItemPagerJump, RowAction, StatusChip } from '@/components/nf';
import { type FactResponse, type ListEntityResponse, useListEntitiesQuery, useRetractKnowledgeMutation, useRevealFactMutation } from '@/lib/apis';
import {
  backLabel,
  factAttachments,
  type FactFormState,
  factState,
  type FactState,
  initialSpoilerState,
  parseFactState,
  type SpoilerState,
  spoilerToggleLabel,
} from '@/lib/canon-facts';
import { relativeTime } from '@/lib/format';

import styles from './canon-facts.module.css';

// The Canon Facts directory merged into Story Bible's "All facts" tab (routes/novels/$novelId/story-bible.tsx)
// — a fact's home is the same canon its subjects live in. This route survives only to bounce old links there;
// `FactDialog`/`RevealDialog`/`FactDetail` below are what the merged tab reuses for the list, edit and detail UI.
export const Route = createFileRoute('/novels/$novelId/canon-facts')({
  validateSearch: (search: Record<string, unknown>): { state?: FactState; fact?: string } => ({
    state: parseFactState(search.state),
    fact: typeof search.fact === 'string' && search.fact ? search.fact : undefined,
  }),
  beforeLoad: ({ params, search }) => {
    throw redirect({ to: '/novels/$novelId/story-bible', params, search: { view: 'facts', state: search.state, fact: search.fact }, replace: true });
  },
});

export interface FactDialogState {
  mode: 'create' | 'edit';
  initial: FactFormState;
}

export interface FactDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  initial: FactFormState;
  onSubmit: (form: FactFormState) => void;
  pending: boolean;
}

export function FactDialog({ open, onOpenChange, mode, initial, onSubmit, pending }: FactDialogProps): React.JSX.Element {
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

export interface FactDetailProps {
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

export function FactDetail({ novelId, fact, total, filterState, ids, jump, onSelect, onEdit, onDelete }: FactDetailProps): React.JSX.Element {
  const entitiesQuery = useListEntitiesQuery(novelId, { limit: 500 });
  const entities = useMemo(() => entitiesQuery.data?.items ?? [], [entitiesQuery.data]);
  const names = useMemo(() => new Map(entities.map(entity => [entity.entityKey, entity.name])), [entities]);
  const [revealOpen, setRevealOpen] = useState(false);
  const state = factState(fact);

  return (
    <>
      <DetailPage
        back={
          <Link to="/novels/$novelId/story-bible" params={{ novelId }} search={{ view: 'facts', state: filterState }}>
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
