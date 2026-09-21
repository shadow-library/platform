import { useState } from 'react';
import { Button, ConfirmDialog, toast } from '@shadow-library/ui';

import { useDraftSummaryQuery, useRegenerateChapterMutation } from '@/lib/apis';
import { regenerableChapters } from '@/lib/chapter-brief';

import styles from './RegenerateChapter.module.css';

export interface RegenerateChapterButtonProps {
  novelId: string;
  chapter: number;
  label?: string;
  variant?: 'primary' | 'secondary';
  fullWidth?: boolean;
  /** Why regenerating would be refused right now; shown beside a disabled button. */
  disabledReason?: string;
}

/** Redrafts one chapter from its current brief through the server's generation job, which owns every ordering and contradiction rule. */
export function RegenerateChapterButton({ novelId, chapter, label, variant = 'secondary', fullWidth, disabledReason }: RegenerateChapterButtonProps): React.JSX.Element {
  const regenerate = useRegenerateChapterMutation(novelId);
  const [confirming, setConfirming] = useState(false);

  const run = (): void => {
    regenerate.mutate(chapter, {
      onSuccess: () => {
        setConfirming(false);
        toast.success(`Regenerating chapter ${chapter} — it lands in Review once the judge has read it`);
      },
      onError: err => {
        setConfirming(false);
        toast.danger(err.message);
      },
    });
  };

  return (
    <>
      <Button variant={variant} size="sm" fullWidth={fullWidth} loading={regenerate.isPending} disabled={Boolean(disabledReason)} onClick={() => setConfirming(true)}>
        {label ?? `Regenerate chapter ${chapter} from the brief`}
      </Button>
      {disabledReason && <span className={styles.reason}>{disabledReason}</span>}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={`Regenerate chapter ${chapter}?`}
        description="Redrafts the chapter from its current brief with the judge, the readability check and repairs. The current prose stays in the chapter's revision history, and later chapters are marked stale once the new draft lands."
        confirmLabel="Regenerate"
        loading={regenerate.isPending}
        onConfirm={run}
      />
    </>
  );
}

export interface RegenerateAppliedBriefsProps {
  novelId: string;
  chapters: readonly number[];
  fullWidth?: boolean;
}

/** After a brief change lands, the chapters it touched that already have prose to replace — a finalized one changes only through amend. */
export function RegenerateAppliedBriefs({ novelId, chapters, fullWidth }: RegenerateAppliedBriefsProps): React.JSX.Element | null {
  const draftsQuery = useDraftSummaryQuery(novelId, chapters.length > 0);
  const offered = regenerableChapters(chapters, draftsQuery.data?.items ?? []);
  if (offered.length === 0) return null;
  return (
    <div className={styles.applied}>
      <p className={styles.note}>The brief changed but the chapter prose did not. Regenerate to write it from the updated plan.</p>
      {offered.map(chapter => (
        <RegenerateChapterButton key={chapter} novelId={novelId} chapter={chapter} label={`Regenerate chapter ${chapter}`} fullWidth={fullWidth} />
      ))}
    </div>
  );
}
