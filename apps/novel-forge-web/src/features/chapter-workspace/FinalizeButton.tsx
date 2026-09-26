import { useState } from 'react';
import { Button, ConfirmDialog, Popover, toast } from '@shadow-library/ui';

import { useFinalizeChapterMutation, useFinalizeReadinessQuery } from '@/lib/apis';
import { finalizeBlockerMessages } from '@/lib/chapter-workspace';

import styles from './FinalizeButton.module.css';

export interface FinalizeButtonProps {
  novelId: string;
  chapter: number;
}

export function FinalizeButton({ novelId, chapter }: FinalizeButtonProps): React.JSX.Element {
  const finalize = useFinalizeChapterMutation(novelId);
  const readiness = useFinalizeReadinessQuery(novelId, chapter);
  const blockers = finalizeBlockerMessages(readiness.data);
  const [confirming, setConfirming] = useState(false);

  const run = (): void => {
    finalize.mutate(chapter, {
      onSuccess: result => {
        setConfirming(false);
        if (result.status === 'failed') {
          toast.danger(`Chapter ${chapter} could not be finalized — the run is listed under Runs`);
          return;
        }
        toast.success(`Chapter ${chapter} is final`);
      },
      onError: error => {
        setConfirming(false);
        toast.danger(error.message);
      },
    });
  };

  if (blockers.length > 0) {
    return (
      <Popover>
        <Popover.Trigger asChild>
          <Button variant="secondary" size="sm" aria-label={`Finalize — ${blockers.length === 1 ? 'one thing' : `${blockers.length} things`} to do first`}>
            Finalize
          </Button>
        </Popover.Trigger>
        <Popover.Content align="end">
          <Popover.Header title={`Chapter ${chapter} can’t be finalized yet`} />
          <ul className={styles.reasons}>
            {blockers.map(reason => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </Popover.Content>
      </Popover>
    );
  }

  return (
    <>
      <Button variant="primary" size="sm" loading={finalize.isPending || readiness.isLoading} onClick={() => setConfirming(true)}>
        Finalize
      </Button>
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Finalize chapter ${chapter}?`}
        description="Locks the approved version. After this only Amend changes its text, and the Story Bible updates it proposes wait in the Review Queue."
        confirmLabel="Finalize"
        loading={finalize.isPending}
        onConfirm={run}
      />
    </>
  );
}
