/**
 * Importing npm packages
 */
import { Button, Dialog, FormField, IconButton, Kbd, Textarea, Tooltip, toast } from '@shadow-library/ui';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';

/**
 * Importing user defined modules
 */
import { WarningIcon } from '@/components/icons';
import { PaneError, PaneLoader, StatusChip, type ChipIntent } from '@/components/nf';
import { type DraftResponse, type FeedbackBody, useApproveDraftMutation, useDraftFeedbackMutation, useReviewQueueQuery, useReviseDraftMutation } from '@/lib/apis';

export const Route = createFileRoute('/novels/$novelId/review')({
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
      <div
        style={{
          flexShrink: 0,
          padding: '14px 24px',
          borderBottom: '1px solid var(--sh-border-subtle)',
          background: 'var(--sh-surface-card)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <span style={{ fontFamily: 'var(--sh-font-mono)', fontSize: 12, color: 'var(--sh-text-tertiary)' }}>CH.{String(draft.chapter).padStart(2, '0')}</span>
        <span style={{ fontSize: 'var(--sh-text-h3)', fontWeight: 700 }}>{draft.title ?? 'Untitled chapter'}</span>
        <StatusChip intent={intent}>{draft.reviewStatus}</StatusChip>
        <div style={{ flex: 1 }} />
        <Tooltip content="Open in chapters">
          <IconButton
            variant="secondary"
            size="sm"
            aria-label="Open in chapters"
            icon={<span style={{ fontSize: 15 }}>↗</span>}
            onClick={() => navigate({ to: '/novels/$novelId/chapters', params: { novelId } })}
          />
        </Tooltip>
      </div>

      <div className="nf-scroll" style={{ flex: 1, minHeight: 0, padding: '22px 24px' }}>
        <div style={{ maxWidth: 680, margin: '0 auto' }}>
          <div
            style={{
              border: `1px solid ${isContradiction ? 'var(--sh-danger-border)' : 'var(--sh-border-subtle)'}`,
              background: isContradiction ? 'var(--sh-danger-bg-subtle)' : 'var(--sh-surface-card)',
              borderRadius: 'var(--sh-radius-lg)',
              padding: '14px 16px',
              marginBottom: 18,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <WarningIcon size={16} style={{ color: isContradiction ? 'var(--sh-danger-solid)' : 'var(--sh-warning-solid)' }} />
              <span style={{ fontSize: 'var(--sh-text-body-sm)', fontWeight: 700, color: isContradiction ? 'var(--sh-danger-text-on-subtle)' : 'var(--sh-text-primary)' }}>
                Judge verdict: {draft.judge ?? draft.reviewStatus}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-secondary)', lineHeight: 1.55 }}>
              {draft.judgeNote ?? 'Awaiting reviewer sign-off. Read the draft and approve, request a revision, or reject.'}
            </p>
          </div>

          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--sh-text-tertiary)', marginBottom: 8 }}>Draft excerpt</div>
          <div
            style={{
              border: '1px solid var(--sh-border-subtle)',
              borderRadius: 'var(--sh-radius-lg)',
              padding: '16px 18px',
              fontSize: 15,
              lineHeight: 1.7,
              color: 'var(--sh-text-secondary)',
            }}
          >
            {(draft.body ?? draft.summary ?? 'No prose available for this draft yet.').slice(0, 900)}
            {(draft.body?.length ?? 0) > 900 ? '…' : ''}
          </div>
        </div>
      </div>

      <div
        style={{
          flexShrink: 0,
          padding: '14px 24px',
          borderTop: '1px solid var(--sh-border-subtle)',
          background: 'var(--sh-surface-card)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginRight: 'auto', fontSize: 11, color: 'var(--sh-text-tertiary)' }}>
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
    if (selectedChapter == null && drafts.length > 0) setSelectedChapter(drafts[0]!.chapter);
  }, [drafts, selectedChapter]);

  const selected = drafts.find(d => d.chapter === selectedChapter);

  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', overflowX: 'auto', overflowY: 'hidden', background: 'var(--sh-surface-app)' }}>
      <div style={{ width: 372, flexShrink: 0, borderRight: '1px solid var(--sh-border-subtle)', background: 'var(--sh-surface-card)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--sh-border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 'var(--sh-text-body)', fontWeight: 700 }}>Review Queue</span>
          {drafts.length > 0 && <StatusChip intent="warning">{drafts.length} open</StatusChip>}
        </div>
        <div className="nf-scroll" style={{ flex: 1, padding: 8 }}>
          {queueQuery.isLoading && <PaneLoader />}
          {queueQuery.error && <PaneError error={queueQuery.error} />}
          {!queueQuery.isLoading && drafts.length === 0 && (
            <div style={{ padding: 16, fontSize: 'var(--sh-text-body-sm)', color: 'var(--sh-text-tertiary)' }}>Nothing awaiting review. 🎉</div>
          )}
          {drafts.map(draft => {
            const selectedRow = draft.chapter === selectedChapter;
            const intent = REVIEW_INTENT[draft.reviewStatus] ?? 'neutral';
            return (
              <button
                key={draft.id}
                className="nf-selrow"
                onClick={() => setSelectedChapter(draft.chapter)}
                style={{
                  flexDirection: 'column',
                  alignItems: 'stretch',
                  gap: 5,
                  padding: 12,
                  marginBottom: 4,
                  background: selectedRow ? 'var(--sh-accent-soft)' : undefined,
                  boxShadow: selectedRow ? 'inset 2px 0 0 var(--sh-accent)' : undefined,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <div style={{ flex: 1 }} />
                  <StatusChip intent={intent}>{draft.reviewStatus}</StatusChip>
                </div>
                <div style={{ fontSize: 'var(--sh-text-body-sm)', fontWeight: 600, color: selectedRow ? 'var(--sh-accent)' : 'var(--sh-text-primary)', textAlign: 'left' }}>
                  Ch. {draft.chapter} · {draft.title ?? 'Untitled'}
                </div>
                <div style={{ fontSize: 11, color: 'var(--sh-text-secondary)', textAlign: 'left' }}>{wordCount(draft.body).toLocaleString()} words</div>
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ flex: 1, minWidth: 460, display: 'flex', flexDirection: 'column', background: 'var(--sh-surface-app)' }}>
        {selected ? (
          <ReviewDetail novelId={novelId} draft={selected} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--sh-text-tertiary)' }}>Select a chapter to review.</div>
        )}
      </div>
    </div>
  );
}
