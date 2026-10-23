import { useState } from 'react';
import { Button, Dialog, FormField, Input, SegmentedControl, Textarea, toast } from '@shadow-library/ui';

import { type InsertChapterBody, useInsertChapterMutation } from '@/lib/apis';

import styles from './chapters.module.css';

interface InsertChapterDialogProps {
  novelId: string;
  afterChapter: number;
  downstream: number[];
  onOpenChange: (open: boolean) => void;
}

// The consequences are spelled out before the call, not after: the insert is one transaction that
// renumbers every downstream chapter, and there is no undo to review afterwards.
export function InsertChapterDialog({ novelId, afterChapter, downstream, onOpenChange }: InsertChapterDialogProps): React.JSX.Element {
  const insert = useInsertChapterMutation(novelId);
  const [origin, setOrigin] = useState<'hand' | 'planner'>('hand');
  const [briefBody, setBriefBody] = useState('');
  const [intent, setIntent] = useState('');
  const newChapter = afterChapter + 1;
  const shifted = downstream.filter(n => n > afterChapter).sort((a, b) => a - b);
  const invalid = origin === 'hand' ? !briefBody.trim() : !intent.trim();

  const submit = (): void => {
    const body: InsertChapterBody = origin === 'hand' ? { briefOrigin: 'hand', briefBody: briefBody.trim() } : { briefOrigin: 'planner', intent: intent.trim() };
    insert.mutate(
      { afterChapter, body },
      {
        onSuccess: result => {
          toast.success(`Chapter ${result.newChapter} inserted — ${result.shiftedChapters} renumbered`);
          onOpenChange(false);
        },
        onError: error => toast.danger(error.message),
      },
    );
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <Dialog.Content size="lg">
        <Dialog.Header
          title={`Insert chapter ${newChapter}`}
          description={afterChapter === 0 ? 'The new chapter goes ahead of chapter 1.' : `The new chapter goes immediately after chapter ${afterChapter}.`}
        />
        <Dialog.Body>
          <div className={styles.dialogForm}>
            <div className={styles.consequences}>
              <div className={styles.consequencesTitle}>What this changes</div>
              <ul className={styles.consequencesList}>
                <li>
                  {shifted.length === 0
                    ? 'Nothing downstream to renumber — the new chapter lands at the end of the plan.'
                    : `Chapters ${shifted[0]}–${shifted[shifted.length - 1]} move up by one: ${shifted.length} briefs are renumbered and re-rendered.`}
                </li>
                <li>The new chapter is placed in the volume of the chapter it follows.</li>
                <li>Every draft after the insert point is marked stale.</li>
                <li>Finalized chapters never move, so the insert is refused below the write frontier.</li>
              </ul>
            </div>
            <FormField label="Where the brief comes from">
              <SegmentedControl value={origin} onValueChange={value => setOrigin(value as 'hand' | 'planner')}>
                <SegmentedControl.Item value="hand">Write the brief</SegmentedControl.Item>
                <SegmentedControl.Item value="planner">Plan it from an intent</SegmentedControl.Item>
              </SegmentedControl>
            </FormField>
            {origin === 'hand' ? (
              <FormField label="Brief" required helper="Stored verbatim as the new chapter's brief.">
                <Textarea
                  value={briefBody}
                  onValueChange={setBriefBody}
                  minRows={6}
                  autoGrow
                  autoFocus
                  placeholder="What happens in this chapter, who is present, what changes by the end…"
                />
              </FormField>
            ) : (
              <FormField label="Intent" required helper="One line. The planner drafts the brief from it plus the surrounding chapters and the volume objective.">
                <Input value={intent} onValueChange={setIntent} autoFocus placeholder="Kael finally tells Amara what happened in the vault." />
              </FormField>
            )}
          </div>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant="primary" disabled={invalid} loading={insert.isPending} onClick={submit}>
            Insert chapter {newChapter}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}
