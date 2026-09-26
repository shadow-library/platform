import { type UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, ConfirmDialog, Drawer, toast } from '@shadow-library/ui';

import {
  type ApiError,
  type ChapterReviewKind,
  type CostTier,
  type DraftResponse,
  type ListChapterReviewsResponse,
  remedyBody,
  useClearRemedyMutation,
  useRegenerateChapterMutation,
  useRemedyMutation,
  useReviseDraftMutation,
} from '@/lib/apis';
import { type OpenFindingForm, repairSource, type ReviewJobState, versionLabel, visibleForm } from '@/lib/chapter-checks';
import { buildRepairNote } from '@/lib/review-queue';

import { ChecksPanel } from './ChecksPanel';
import styles from './ChecksDrawer.module.css';

export interface ChecksDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  novelId: string;
  draft: DraftResponse;
  reviews: UseQueryResult<ListChapterReviewsResponse, ApiError>;
  jobs: ReviewJobState;
  kind: ChapterReviewKind;
  onKindChange: (kind: ChapterReviewKind) => void;
  runBlockedReason?: string;
  starting?: ChapterReviewKind;
  onRun: (kind: ChapterReviewKind, costTier?: CostTier) => void;
}

export function ChecksDrawer({ open, onOpenChange, novelId, draft, reviews, ...panel }: ChecksDrawerProps): React.JSX.Element {
  const remedy = useRemedyMutation(novelId, draft.chapter);
  const clear = useClearRemedyMutation(novelId, draft.chapter);
  const [form, setForm] = useState<OpenFindingForm | undefined>();
  const shownForm = visibleForm(form, reviews.data, panel.kind, open);
  if (form && (!open || form.kind !== panel.kind)) setForm(undefined);
  const busyFinding = remedy.isPending ? remedy.variables?.findingId : clear.isPending ? clear.variables?.findingId : undefined;

  const closeFormFirst = (event: KeyboardEvent): void => {
    if (!shownForm) return;
    event.preventDefault();
    setForm(undefined);
  };

  const focusSelectedTab = (event: Event): void => {
    const tab = (event.target as HTMLElement | null)?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!tab) return;
    event.preventDefault();
    tab.focus();
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} placement="right" size="sm" onEscapeKeyDown={closeFormFirst} onOpenAutoFocus={focusSelectedTab}>
      <Drawer.Header title="Checks" meta={`Chapter ${draft.chapter} · ${versionLabel(draft.revision)}`} />
      <Drawer.Body>
        <ChecksPanel
          {...panel}
          list={reviews.data}
          loading={reviews.isLoading}
          error={reviews.error}
          onRetry={() => void reviews.refetch()}
          busyFinding={busyFinding}
          form={shownForm}
          onFormChange={setForm}
          approvedRevision={draft.reviewStatus === 'approved' ? (draft.approvedRevision ?? draft.revision) : undefined}
          onRemedy={(review, finding, action, reason, onFailed) =>
            remedy.mutate(
              { reviewId: review.id, findingId: finding.id, body: remedyBody(action, reason) },
              {
                onSuccess: () => setForm(undefined),
                onError: error => {
                  onFailed();
                  toast.danger(error.message);
                },
              },
            )
          }
          onClearRemedy={(review, finding, onFailed) =>
            clear.mutate(
              { reviewId: review.id, findingId: finding.id },
              {
                onError: error => {
                  onFailed();
                  toast.danger(error.message);
                },
              },
            )
          }
          heldActions={
            draft.status === 'final' ? undefined : (
              <HeldActions novelId={novelId} draft={draft} repairNote={repairSource(reviews.data, draft.judgeNote)} onRegenerated={() => onOpenChange(false)} />
            )
          }
        />
      </Drawer.Body>
    </Drawer>
  );
}

export interface HeldActionsProps {
  novelId: string;
  draft: DraftResponse;
  repairNote: string | null | undefined;
  /** Off where the surrounding strip already offers its own Regenerate. */
  regenerate?: boolean;
  onRegenerated?: () => void;
}

export function HeldActions({ novelId, draft, repairNote, regenerate: offerRegenerate = true, onRegenerated }: HeldActionsProps): React.JSX.Element {
  const revise = useReviseDraftMutation(novelId, draft.chapter);
  const regenerate = useRegenerateChapterMutation(novelId);
  const [confirmRegen, setConfirmRegen] = useState(false);

  const repair = (): void => {
    revise.mutate(
      { note: buildRepairNote(repairNote) },
      { onSuccess: () => toast.success('Repair applied — run the AI review again to check it'), onError: error => toast.danger(error.message) },
    );
  };

  // The server owns every rule that decides whether this chapter can be redrafted now (order, other contradictions,
  // external chapters, a running job), so its refusal is the reason shown.
  const runRegenerate = (): void => {
    regenerate.mutate(draft.chapter, {
      onSuccess: () => {
        setConfirmRegen(false);
        toast.success(`Regenerating chapter ${draft.chapter} — its current prose stays in the revision history`);
        onRegenerated?.();
      },
      onError: error => {
        setConfirmRegen(false);
        toast.danger(error.message);
      },
    });
  };

  return (
    <div className={styles.heldActions}>
      <Button variant="primary" size="sm" loading={revise.isPending} disabled={regenerate.isPending} onClick={repair}>
        Repair with AI
      </Button>
      {offerRegenerate && (
        <Button variant="secondary" size="sm" loading={regenerate.isPending} disabled={revise.isPending} onClick={() => setConfirmRegen(true)}>
          Regenerate chapter
        </Button>
      )}
      <ConfirmDialog
        open={confirmRegen}
        onOpenChange={setConfirmRegen}
        intent="danger"
        title={`Regenerate chapter ${draft.chapter}?`}
        description="Redrafts the chapter from its brief with the judge and repairs. The current prose stays in the revision history, and later chapters are marked stale once the new draft lands."
        confirmLabel="Regenerate"
        loading={regenerate.isPending}
        onConfirm={runRegenerate}
      />
    </div>
  );
}
