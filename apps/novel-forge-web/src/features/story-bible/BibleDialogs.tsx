import { type ReactElement, useState } from 'react';

import { Alert, Button, Dialog, FormField, Input, Select, Textarea, toast } from '@shadow-library/ui';

import { type EntityResponse, type EntityType, useRevealFactMutation } from '@/lib/apis';
import { type FactFormState, parseChapter } from '@/lib/canon-facts';
import { ALL_TYPES, TYPE_SINGULAR } from '@/lib/story-bible';

import styles from './StoryBible.module.css';

export type FactPurpose = 'secret' | 'known';

export interface FactDialogState {
  mode: 'create' | 'edit';
  purpose: FactPurpose;
  title: string;
  initial: FactFormState;
  /** The record a new fact is about, offered first as the character who learns it. */
  subjectKey?: string;
}

export interface FactLearner {
  entityKey: string;
  chapter: number;
}

export interface FactDialogProps extends FactDialogState {
  entities: readonly Pick<EntityResponse, 'entityKey' | 'name'>[];
  onOpenChange: (open: boolean) => void;
  onSubmit: (form: FactFormState, learner: FactLearner | undefined) => void;
  pending: boolean;
}

const TEXT_FIELD: Record<FactPurpose, { label: string; helper: string }> = {
  secret: { label: 'The truth', helper: 'Never shown to the chapter writer while it is hidden. State the full spoiler plainly.' },
  known: { label: 'The fact', helper: 'The writer sees this from the chapter a character learns it. Before then it sees only the note below.' },
};

const SECRET_DESCRIPTION = 'The truth is for you and the judge — the chapter writer never sees it while it is hidden.';

const WRITER_NOTE_HELP: Record<FactPurpose, string> = {
  secret:
    'The only thing the chapter writer sees while the fact is hidden — say how to behave without naming the truth, ' +
    'e.g. “Elias deflects questions about Tuesday night.” Leave blank to withhold the fact entirely.',
  known: 'What the writer sees in chapters before anyone learns it. Leave blank to withhold it until then.',
};

export function FactDialog({ mode, purpose, title, initial, subjectKey, entities, onOpenChange, onSubmit, pending }: FactDialogProps): ReactElement {
  const [form, setForm] = useState(initial);
  const [learnerKey, setLearnerKey] = useState(subjectKey ?? entities[0]?.entityKey ?? '');
  const [learnedIn, setLearnedIn] = useState('');
  const set = <K extends keyof FactFormState>(key: K, value: FactFormState[K]): void => setForm(prev => ({ ...prev, [key]: value }));
  const collectsLearner = mode === 'create' && purpose === 'known';
  const learnedChapter = parseChapter(learnedIn);
  const chapterValid = form.revealChapter.trim() === '' || parseChapter(form.revealChapter) !== undefined;
  const learnerValid = !collectsLearner || (Boolean(learnerKey) && learnedChapter !== undefined);
  const invalid = !form.text.trim() || (mode === 'create' && !form.factKey.trim()) || !chapterValid || !learnerValid;
  const learner = collectsLearner && learnedChapter !== undefined ? { entityKey: learnerKey, chapter: learnedChapter } : undefined;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <Dialog.Content size="md">
        <Dialog.Header title={title} description={purpose === 'secret' ? SECRET_DESCRIPTION : undefined} />
        <Dialog.Body>
          <div className={styles.dialogForm}>
            {mode === 'create' && (
              <FormField label="Key" required helper="Stable id, e.g. ledger_forgery">
                <Input value={form.factKey} onValueChange={v => set('factKey', v)} autoFocus />
              </FormField>
            )}
            <FormField label={TEXT_FIELD[purpose].label} required helper={TEXT_FIELD[purpose].helper}>
              <Textarea value={form.text} onValueChange={v => set('text', v)} minRows={3} autoGrow autoFocus={mode === 'edit'} />
            </FormField>
            {collectsLearner && (
              <div className={styles.dialogGrid}>
                <FormField label="Who learns it" required>
                  <Select value={learnerKey} onValueChange={setLearnerKey} aria-label="Who learns it">
                    {entities.map(e => (
                      <Select.Item key={e.entityKey} value={e.entityKey}>
                        {e.name}
                      </Select.Item>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Learned in chapter" required>
                  <Input type="number" min={1} value={learnedIn} onValueChange={setLearnedIn} placeholder="e.g. 3" />
                </FormField>
              </div>
            )}
            <FormField label="What the writer is told" helper={WRITER_NOTE_HELP[purpose]}>
              <Textarea value={form.writerNote} onValueChange={v => set('writerNote', v)} minRows={2} autoGrow />
            </FormField>
            <FormField label="Author note" helper="For you only — never shown to the chapter writer.">
              <Textarea value={form.constraintNote} onValueChange={v => set('constraintNote', v)} minRows={2} autoGrow />
            </FormField>
            <div className={styles.dialogGrid}>
              <FormField label="Subjects" helper="Record keys this fact is about, comma-separated">
                <Input value={form.subjects} onValueChange={v => set('subjects', v)} placeholder="detective_amara, sergeant_boone" />
              </FormField>
              {!collectsLearner && (
                <FormField label="Reveal chapter" helper="The chapter the reader learns it">
                  <Input value={form.revealChapter} onValueChange={v => set('revealChapter', v)} placeholder="e.g. 12" />
                </FormField>
              )}
            </div>
            <FormField label="Never named early" helper="Words plans and drafts must not use before the reveal, comma-separated">
              <Input value={form.terms} onValueChange={v => set('terms', v)} placeholder="ledger, service corridor" />
            </FormField>
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" loading={pending} disabled={invalid} onClick={() => onSubmit(form, learner)}>
            {mode === 'create' ? 'Create' : 'Save changes'}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

export interface RevealDialogProps {
  novelId: string;
  factKey: string;
  entities: readonly Pick<EntityResponse, 'entityKey' | 'name'>[];
  defaultEntityKey?: string;
  onOpenChange: (open: boolean) => void;
}

export function RevealDialog({ novelId, factKey, entities, defaultEntityKey, onOpenChange }: RevealDialogProps): ReactElement {
  const reveal = useRevealFactMutation(novelId);
  const [entityKey, setEntityKey] = useState(defaultEntityKey ?? entities[0]?.entityKey ?? '');
  const [chapter, setChapter] = useState('');
  const [note, setNote] = useState('');
  const chapterNum = parseChapter(chapter);
  const name = entities.find(entity => entity.entityKey === entityKey)?.name ?? entityKey;

  const submit = (): void => {
    if (chapterNum === undefined) return;
    reveal.mutate(
      { factKey, entityKey, chapter: chapterNum, note: note.trim() || undefined },
      {
        onSuccess: () => {
          toast.success(`${name} learns it in chapter ${chapterNum}`);
          onOpenChange(false);
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <Dialog.Content size="sm">
        <Dialog.Header title="Who learns it" description="Records a ledger entry — the writer sees this fact for chapters at or after this one." />
        <Dialog.Body>
          <div className={styles.dialogForm}>
            <FormField label="Character" required>
              <Select value={entityKey} onValueChange={setEntityKey} aria-label="Character">
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
          <Button variant="primary" loading={reveal.isPending} disabled={!entityKey || chapterNum === undefined} onClick={submit}>
            Reveal
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

export interface EntityFormState {
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

export function emptyEntityForm(type: EntityType): EntityFormState {
  return { entityKey: '', name: '', type, significance: 'minor', status: '', notes: '', motivation: '', appearance: '', body: '' };
}

export function entityFormFrom(entity: EntityResponse): EntityFormState {
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

export interface EntityDialogState {
  mode: 'create' | 'edit';
  initial: EntityFormState;
}

export interface EntityDialogProps {
  onOpenChange: (open: boolean) => void;
  mode: 'create' | 'edit';
  initial: EntityFormState;
  onSubmit: (form: EntityFormState) => void;
  pending: boolean;
}

export function EntityDialog({ onOpenChange, mode, initial, onSubmit, pending }: EntityDialogProps): ReactElement {
  const [form, setForm] = useState(initial);
  const set = <K extends keyof EntityFormState>(key: K, value: EntityFormState[K]): void => setForm(prev => ({ ...prev, [key]: value }));
  const invalid = !form.name.trim() || (mode === 'create' && !form.entityKey.trim());

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <Dialog.Content size="md">
        <Dialog.Header title={mode === 'create' ? 'New entry' : `Edit ${initial.name}`} />
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
                <FormField label="Kind">
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
              <FormField label="Kind">
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
            <FormField label="Wants">
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
            {mode === 'create' ? 'Create entry' : 'Save changes'}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

export interface GuideEditDialogProps {
  title: string;
  initialBody: string;
  /** Set when the guide changed after the dialog opened; the author's text stays in the editor. */
  conflict: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (body: string, overwrite: boolean) => void;
  pending: boolean;
}

export function GuideEditDialog({ title, initialBody, conflict, onOpenChange, onSubmit, pending }: GuideEditDialogProps): ReactElement {
  const [body, setBody] = useState(initialBody);
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <Dialog.Content size="lg">
        <Dialog.Header title={`Edit ${title}`} description="Markdown." />
        <Dialog.Body>
          <div className={styles.dialogForm}>
            {conflict && (
              <Alert intent="warning" title="This guide changed after you opened it">
                Nothing was saved and your text is still here. Copy it, close and reopen the guide to edit the latest version — or save over the other change.
              </Alert>
            )}
            <FormField label="Guide text">
              <Textarea value={body} onValueChange={setBody} minRows={16} autoGrow autoFocus className={styles.guideEditor} />
            </FormField>
            <p className={styles.muted}>Saving re-checks every written chapter against the updated guide.</p>
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          {conflict ? (
            <Button variant="danger" loading={pending} onClick={() => onSubmit(body, true)}>
              Save over it
            </Button>
          ) : (
            <Button variant="primary" loading={pending} disabled={body === initialBody} onClick={() => onSubmit(body, false)}>
              Save guide
            </Button>
          )}
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
