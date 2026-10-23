import { type ContentRating, normalizeContentRating } from '@shadow-library/sdk';
import { useState } from 'react';
import { Alert, Button, Dialog, FormField, Input, Textarea, toast } from '@shadow-library/ui';

import { ContentRatingPicker } from '@/components/nf';
import { type AmendChapterResponse, type DraftResponse, useAmendChapterMutation } from '@/lib/apis';

import { sanitizeSource } from './sanitize-source';
import styles from './chapters.module.css';

interface AmendDialogProps {
  novelId: string;
  chapter: number;
  draft: DraftResponse;
  onOpenChange: (open: boolean) => void;
  onAmended: (result: AmendChapterResponse) => void;
}

// Amend is the only writer allowed past the immutability lock. It replaces prose and nothing else —
// the bible keeps whatever this chapter already put there, hence the re-derive follow-up afterwards.
export function AmendDialog({ novelId, chapter, draft, onOpenChange, onAmended }: AmendDialogProps): React.JSX.Element {
  const amend = useAmendChapterMutation(novelId, chapter);
  const [content, setContent] = useState(draft.body ?? '');
  const [title, setTitle] = useState(draft.title ?? '');
  const [note, setNote] = useState('');
  const [rating, setRating] = useState<ContentRating>(draft.contentRating ?? {});

  const submit = (): void => {
    amend.mutate(
      { content: sanitizeSource(content), title: title.trim() || undefined, note: note.trim() || undefined, contentRating: normalizeContentRating(rating) },
      {
        onSuccess: result => {
          toast.success(`Chapter ${chapter} amended — ${result.wordCount.toLocaleString()} words${result.republished ? ', republish scheduled' : ''}`);
          onAmended(result);
          onOpenChange(false);
        },
        onError: error => toast.danger(error.message),
      },
    );
  };

  return (
    <Dialog open onOpenChange={open => !amend.isPending && onOpenChange(open)}>
      <Dialog.Content size="lg">
        <Dialog.Header title={`Amend chapter ${chapter}`} description="Rewrites finalized canon in place. The chapter stays locked and keeps its number." />
        <Dialog.Body>
          <div className={styles.dialogForm}>
            <Alert intent="warning" title="Prose only">
              The bible, continuity, and every downstream chapter are untouched. Anything this chapter already contributed to canon keeps propagating until you re-derive it.
            </Alert>
            <FormField label="Prose" required>
              <Textarea value={content} onValueChange={setContent} minRows={10} autoGrow />
            </FormField>
            <div className={styles.dialogGrid}>
              <FormField label="Title">
                <Input value={title} onValueChange={setTitle} />
              </FormField>
              <FormField label="Author's note" helper="Reaches the reader — changing it republishes the chapter.">
                <Input value={note} onValueChange={setNote} />
              </FormField>
            </div>
            <ContentRatingPicker value={rating} onValueChange={setRating} />
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="danger" disabled={!content.trim()} loading={amend.isPending} onClick={submit}>
            Amend chapter {chapter}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
