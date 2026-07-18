/**
 * Importing npm packages
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { Button, Dialog, FormField, IconButton, Kbd, Textarea, toast, Tooltip } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { WarningIcon } from '@/components/icons';
import { type ChipIntent, PaneError, PaneLoader, StatusChip } from '@/components/nf';
import {
  type DraftResponse,
  type FeedbackBody,
  reviewQueueQueryOptions,
  useApproveDraftMutation,
  useDraftFeedbackMutation,
  useReviewQueueQuery,
  useReviseDraftMutation,
} from '@/lib/apis';

import styles from './review.module.css';

export const Route = createFileRoute('/novels/$novelId/review')({
  // The review queue is this screen's only data — prefetch it so it renders server-side.
  loader: ({ context, params }) => context.queryClient.prefetchQuery(reviewQueueQueryOptions(params.novelId)),
  component: ReviewScreen,
});

const REVIEW_INTENT: Record<string, ChipIntent> = {
  needs_review: 'warning',
  contradiction: 'danger',
  generating: 'info',
  approved: 'success',
  final: 'success',
};

function wordCount(body?: string | null): number {
  return body ? body.trim().split(/\s+/).filter(Boolean).length : 0;
}

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  disposition: 'revision_requested' | 'rejected';
  pending: boolean;
  onSubmit: (note: string) => void;
}

function FeedbackDialog({ open, onOpenChange, disposition, pending, onSubmit }: FeedbackDialogProps): React.JSX.Element {
  const [note, setNote] = useState('');
  useEffect(() => {
    if (open) setNote('');
  }, [open]);
  const title = disposition === 'rejected' ? 'Reject draft' : 'Request revision';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Dialog.Content size="sm">
        <Dialog.Header title={title} description="Your note is recorded on the draft and guides the next generation." />
        <Dialog.Body>
          <FormField label="Note" required>
            <Textarea value={note} onValueChange={setNote} minRows={3} autoGrow autoFocus placeholder="What needs to change?" />
          </FormField>
        </Dialog.Body>
        <Dialog.Footer>
          <Dialog.Close asChild>
            <Button variant="ghost">Cancel</Button>
          </Dialog.Close>
          <Button variant={disposition === 'rejected' ? 'danger' : 'primary'} loading={pending} disabled={!note.trim()} onClick={() => onSubmit(note.trim())}>
            {title}
          </Button>
        </Dialog.Footer>
      </Dialog.Content>
    </Dialog>
  );
}

interface ReviewDetailProps {
  novelId: string;
  draft: DraftResponse;
}

function ReviewDetail({ novelId, draft }: ReviewDetailProps): React.JSX.Element {
  const navigate = useNavigate();
  const approveDraft = useApproveDraftMutation(novelId);
  const feedback = useDraftFeedbackMutation(novelId, draft.chapter);
  const revise = useReviseDraftMutation(novelId, draft.chapter);
  const [dialog, setDialog] = useState<'revision_requested' | 'rejected' | null>(null);

  const intent = REVIEW_INTENT[draft.reviewStatus] ?? 'neutral';
  const isContradiction = draft.reviewStatus === 'contradiction';

  // A revision request actually runs the AI revision pass against the note; a rejection only records
  // the disposition. Both leave an audit row on the draft.
  const sendFeedback = (disposition: FeedbackBody['disposition'], note: string): void => {
    if (disposition === 'revision_requested') {
      revise.mutate(
        { note },
        {
          onSuccess: () => {
            toast.success(`Chapter ${draft.chapter} revised — re-review the new draft`);
            setDialog(null);
          },
          onError: err => toast.danger(err.message),
        },
      );
      return;
    }
    feedback.mutate(
      { note, disposition },
      {
        onSuccess: () => {
          toast.success('Feedback recorded');
          setDialog(null);
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  const approve = (): void => {
    approveDraft.mutate(draft.chapter, { onSuccess: () => toast.success(`Chapter ${draft.chapter} approved`), onError: err => toast.danger(err.message) });
  };

  return (
    <>
      <div className={styles.head}>
        <span className={styles.chapNum}>CH.{String(draft.chapter).padStart(2, '0')}</span>
        <span className={styles.chapTitle}>{draft.title ?? 'Untitled chapter'}</span>
        <StatusChip intent={intent}>{draft.reviewStatus}</StatusChip>
        <div className={styles.spacer} />
        <Tooltip content="Open in chapters">
          <IconButton
            variant="secondary"
            size="sm"
            aria-label="Open in chapters"
            icon={<span className={styles.glyph}>↗</span>}
            onClick={() => navigate({ to: '/novels/$novelId/chapters', params: { novelId } })}
          />
        </Tooltip>
      </div>

      <div className={`nf-scroll ${styles.detailScroll}`}>
        <div className={styles.detailInner}>
          <div className={styles.verdict} data-contradiction={isContradiction}>
            <div className={styles.verdictHead}>
              <WarningIcon size={16} className={styles.verdictIcon} />
              <span className={styles.verdictTitle}>Judge verdict: {draft.judge ?? draft.reviewStatus}</span>
            </div>
            <p className={styles.verdictNote}>{draft.judgeNote ?? 'Awaiting reviewer sign-off. Read the draft and approve, request a revision, or reject.'}</p>
          </div>

          <div className={`nf-eyebrow ${styles.excerptLabel}`}>Draft excerpt</div>
          <div className={styles.excerpt}>
            {(draft.body ?? draft.summary ?? 'No prose available for this draft yet.').slice(0, 900)}
            {(draft.body?.length ?? 0) > 900 ? '…' : ''}
          </div>
        </div>
      </div>

      <div className={styles.footer}>
        <div className={styles.hotkeys}>
          <Kbd keys="A" /> approve <Kbd keys="R" /> revise <Kbd keys="X" /> reject
        </div>
        <Button variant="danger" onClick={() => setDialog('rejected')}>
          Reject
        </Button>
        <Button variant="secondary" onClick={() => setDialog('revision_requested')}>
          Request revision
        </Button>
        <Tooltip content={isContradiction ? 'Resolve the contradiction before approving' : 'Approve this draft'}>
          <Button variant="primary" disabled={isContradiction} loading={approveDraft.isPending} onClick={approve}>
            Approve draft
          </Button>
        </Tooltip>
      </div>

      <FeedbackDialog
        open={dialog !== null}
        onOpenChange={o => !o && setDialog(null)}
        disposition={dialog ?? 'revision_requested'}
        pending={feedback.isPending || revise.isPending}
        onSubmit={note => dialog && sendFeedback(dialog, note)}
      />
    </>
  );
}

function ReviewScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const queueQuery = useReviewQueueQuery(novelId);
  const drafts = queueQuery.data?.drafts ?? [];
  const [selectedChapter, setSelectedChapter] = useState<number | undefined>();

  useEffect(() => {
    const first = drafts[0];
    if (selectedChapter == null && first) setSelectedChapter(first.chapter);
  }, [drafts, selectedChapter]);

  const selected = drafts.find(d => d.chapter === selectedChapter);

  return (
    <div className="nf-splitpane">
      <div className="nf-rail">
        <div className={`nf-railhead ${styles.railHeadFlex}`}>
          <span className={styles.railTitle}>Review Queue</span>
          {drafts.length > 0 && <StatusChip intent="warning">{drafts.length} open</StatusChip>}
        </div>
        <div className="nf-scroll nf-raillist">
          {queueQuery.isLoading && <PaneLoader />}
          {queueQuery.error && <PaneError error={queueQuery.error} />}
          {!queueQuery.isLoading && drafts.length === 0 && <div className="nf-emptynote">Nothing awaiting review. 🎉</div>}
          {drafts.map(draft => {
            const intent = REVIEW_INTENT[draft.reviewStatus] ?? 'neutral';
            return (
              <button key={draft.id} className="nf-selrow nf-selrow-stack" data-active={draft.chapter === selectedChapter} onClick={() => setSelectedChapter(draft.chapter)}>
                <div className={styles.rowTopRow}>
                  <div className={styles.spacer} />
                  <StatusChip intent={intent}>{draft.reviewStatus}</StatusChip>
                </div>
                <div className={styles.rowTitle}>
                  Ch. {draft.chapter} · {draft.title ?? 'Untitled'}
                </div>
                <div className={styles.rowWords}>{wordCount(draft.body).toLocaleString()} words</div>
              </button>
            );
          })}
        </div>
      </div>
      <div className="nf-detail">{selected ? <ReviewDetail novelId={novelId} draft={selected} /> : <div className="nf-pane-empty">Select a chapter to review.</div>}</div>
    </div>
  );
}
