import { useNavigate } from '@tanstack/react-router';
import { useEffect, useId, useRef, useState } from 'react';
import { Alert, Button, Dialog, FormField, Input, SegmentedControl, Textarea } from '@shadow-library/ui';

import { AiTag } from '@/components/nf';
import { type CreateNovelWithNotesBody, useCreateNovelWithNotesMutation } from '@/lib/apis';
import { queuePendingFirstTurn } from '@/lib/pending-first-turn';
import {
  completeStart,
  countNoteWords,
  isStartBlocked,
  isSubmitShortcut,
  NOTES_MAX_WORDS,
  NOTES_OVER_WORDS,
  notesCharError,
  notesWordLabel,
  type StartErrors,
  startErrorsFrom,
  TITLE_MAX_CHARS,
  titleError,
  titleToSubmit,
  UNTITLED_NOVEL,
} from '@/lib/start-novel';

import styles from './NewNovelModal.module.css';

export type ContentMode = NonNullable<CreateNovelWithNotesBody['contentMode']>;

export interface StartNovelFormProps {
  formId: string;
  title: string;
  notes: string;
  notesWords: number;
  contentMode: ContentMode;
  errors: StartErrors;
  pending: boolean;
  onTitleChange: (title: string) => void;
  onNotesChange: (notes: string) => void;
  onContentModeChange: (mode: ContentMode) => void;
  onSubmit: () => void;
}

export function StartNovelForm(props: StartNovelFormProps): React.JSX.Element {
  const { formId, title, notes, notesWords, contentMode, errors, pending } = props;
  const contentModeLabelId = `${formId}-content-mode`;
  const overWords = notesWords > NOTES_MAX_WORDS;
  const formErrorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (errors.form) formErrorRef.current?.focus();
  }, [errors.form]);

  return (
    <form
      id={formId}
      className={styles.form}
      noValidate
      onSubmit={event => {
        event.preventDefault();
        props.onSubmit();
      }}
    >
      {errors.form && (
        <div ref={formErrorRef} tabIndex={-1} className={styles.formError}>
          <Alert intent="danger" title="Couldn’t start the novel">
            {errors.form}
          </Alert>
        </div>
      )}
      <FormField label="Working name" error={errors.title} helper="Optional — you can rename it any time.">
        <Input placeholder={UNTITLED_NOVEL} value={title} onValueChange={props.onTitleChange} maxLength={TITLE_MAX_CHARS} readOnly={pending} autoFocus />
      </FormField>
      <FormField
        label="Your notes"
        optional
        invalid={overWords || Boolean(errors.notes)}
        error={errors.notes}
        helper={
          <>
            {notesWordLabel(notesWords)}
            {/* Only the static sentence is live: the count beside it changes on every keystroke and must not be re-announced. */}
            {overWords && (
              <span role="alert" className={styles.overLimit}>
                {` ${NOTES_OVER_WORDS}`}
              </span>
            )}
          </>
        }
      >
        <Textarea
          minRows={6}
          readOnly={pending}
          placeholder="Characters, the world, the first scene, the ending, books you love — anything. Nothing you write here is changed; it stays as your source."
          value={notes}
          onValueChange={props.onNotesChange}
          onKeyDown={event => {
            const { key, metaKey, ctrlKey, keyCode, nativeEvent } = event;
            if (!isSubmitShortcut({ key, metaKey, ctrlKey, keyCode, isComposing: nativeEvent.isComposing })) return;
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }}
        />
      </FormField>
      <FormField label={<span id={contentModeLabelId}>Content mode</span>} helper="The starting choice for each chapter. You can switch it per chapter on its plan.">
        <SegmentedControl
          aria-labelledby={contentModeLabelId}
          value={contentMode}
          onValueChange={value => props.onContentModeChange(value as ContentMode)}
          disabled={pending}
          fullWidth
        >
          <SegmentedControl.Item value="standard">Standard</SegmentedControl.Item>
          <SegmentedControl.Item value="unrestricted">Unrestricted</SegmentedControl.Item>
        </SegmentedControl>
      </FormField>
      <div className={styles.hint}>
        <div className={styles.hintRow}>
          <AiTag>AI</AiTag>
          <span className={styles.hintText}>Opens the chat for your novel. Nothing is decided for you — ideas arrive as suggestions you add or skip.</span>
        </div>
      </div>
    </form>
  );
}

export interface NewNovelModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Start a novel: creates a `new_novel` project with the author's notes and opens its chat with the opening message queued. */
export function NewNovelModal({ open, onOpenChange }: NewNovelModalProps): React.JSX.Element {
  const formId = useId();
  const navigate = useNavigate();
  const createNovel = useCreateNovelWithNotesMutation();
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [contentMode, setContentMode] = useState<ContentMode>('standard');
  const [serverErrors, setServerErrors] = useState<StartErrors>({});
  // Bumped on every close, so a request that settles after the dialog was closed neither navigates nor shows its error.
  const attemptRef = useRef(0);

  const notesWords = countNoteWords(notes);
  const errors: StartErrors = {
    title: titleError(title) ?? serverErrors.title,
    notes: notesCharError(notes) ?? serverErrors.notes,
    form: serverErrors.form,
  };

  const close = (): void => {
    attemptRef.current += 1;
    setTitle('');
    setNotes('');
    setContentMode('standard');
    setServerErrors({});
    onOpenChange(false);
  };

  const submit = (): void => {
    if (createNovel.isPending) return;
    setServerErrors({});
    if (isStartBlocked(title, notes, notesWords)) return;
    const attempt = attemptRef.current;
    createNovel.mutate(
      { title: titleToSubmit(title), notes: notes.trim() || undefined, contentMode },
      {
        onSuccess: created => {
          if (attemptRef.current !== attempt) return;
          completeStart(created, notes, { queue: queuePendingFirstTurn, close, navigate: target => void navigate(target) });
        },
        onError: error => {
          if (attemptRef.current === attempt) setServerErrors(startErrorsFrom(error));
        },
      },
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        if (next) return onOpenChange(true);
        if (!createNovel.isPending) close();
      }}
    >
      <Dialog.Content size="md">
        <Dialog.Header
          title="Start a new novel"
          description="Give it a working title. If you already know things about your story, paste them — the chat will organise them into your Story Bible and ask about the rest."
        />
        <Dialog.Body>
          <StartNovelForm
            formId={formId}
            title={title}
            notes={notes}
            notesWords={notesWords}
            contentMode={contentMode}
            errors={errors}
            pending={createNovel.isPending}
            onTitleChange={value => {
              setTitle(value);
              setServerErrors(current => ({ ...current, title: undefined }));
            }}
            onNotesChange={value => {
              setNotes(value);
              setServerErrors(current => ({ ...current, notes: undefined }));
            }}
            onContentModeChange={setContentMode}
            onSubmit={submit}
          />
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost" disabled={createNovel.isPending}>
              Cancel
            </Button>
          </Dialog.Close>
          <Button variant="primary" type="submit" form={formId} loading={createNovel.isPending}>
            Create and open chat
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
