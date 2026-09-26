import { Button, Dialog, toast } from '@shadow-library/ui';

import { useSaveMessageAsNotesMutation } from '@/lib/apis';

import { wordCount } from './chat-view';
import styles from './Chat.module.css';

export interface NotesChipProps {
  notes: string;
}

/** The author's notes beside the message that opened the novel's chat; the text itself stays one click away. */
export function NotesChip({ notes }: NotesChipProps): React.JSX.Element {
  return (
    <Dialog>
      <Dialog.Trigger asChild>
        <Button size="sm" variant="secondary" className={styles.chip}>
          Your notes · {wordCount(notes).toLocaleString()} words · Show
        </Button>
      </Dialog.Trigger>
      <Dialog.Content size="lg">
        <Dialog.Header title="Your notes" description="Stored exactly as you wrote them. Organising never changes them." />
        <Dialog.Body>
          <div className={styles.notesText}>{notes}</div>
        </Dialog.Body>
      </Dialog.Content>
    </Dialog>
  );
}

export interface SaveAsNotesOfferProps {
  novelId: string;
  sessionId: string;
  messageId: string;
}

export function SaveAsNotesOffer({ novelId, sessionId, messageId }: SaveAsNotesOfferProps): React.JSX.Element {
  const save = useSaveMessageAsNotesMutation(novelId);
  const onSave = (): void =>
    save.mutate(
      { sessionId, messageId },
      {
        onSuccess: result => toast.success(result.saved ? `Saved to your notes — ${result.paragraphs} paragraphs now` : 'Your notes already hold this message'),
        onError: err => toast.danger(err.message),
      },
    );
  return (
    <div className={styles.offer}>
      <span className={styles.caption}>A long message — keep it with your notes so organising can use it?</span>
      <Button size="sm" variant="secondary" loading={save.isPending} onClick={onSave}>
        Save as notes
      </Button>
    </div>
  );
}
