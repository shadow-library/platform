import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Dialog, FormField, Kbd, Textarea, toast, Tooltip } from '@shadow-library/ui';

import { CheckIcon, WarningIcon } from '@/components/icons';
import { useCollectionJump } from '@/components/Layout';
import { type ChipIntent, CollectionPage, DetailPage, EmptyState, ItemPager, type ItemPagerJump, PaneError, PaneLoader, StatusChip } from '@/components/nf';
import {
  type DraftResponse,
  type FeedbackBody,
  reviewQueueQueryOptions,
  useApproveDraftMutation,
  useDraftFeedbackMutation,
  useListDraftsQuery,
  useReviewQueueQuery,
  useReviseDraftMutation,
} from '@/lib/apis';
import {
  backLabel,
  chapterBadge,
  chapterKey,
  chapterTitle,
  isEditableElement,
  nextAfterApproval,
  parseChapterParam,
  queueIds,
  queueMeta,
  queueReason,
  reviewCounts,
  reviewHotkey,
  wordCount,
} from '@/lib/review-queue';

import styles from './review.module.css';

interface ReviewSearch {
  chapter?: number;
}

export const Route = createFileRoute('/novels/$novelId/review')({
  validateSearch: (search: Record<string, unknown>): ReviewSearch => ({ chapter: parseChapterParam(search.chapter) }),
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

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  disposition: 'revision_requested' | 'rejected';
  pending: boolean;
  onSubmit: (note: string) => void;
}

function FeedbackDialog({ open, onOpenChange, disposition, pending, onSubmit }: FeedbackDialogProps): React.JSX.Element {
  const [note, setNote] = useState('');
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setNote('');
  }
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
  total: number | undefined;
  ids: readonly string[] | undefined;
  jump?: ItemPagerJump;
  onSelect: (chapter: number | undefined) => void;
}

function ReviewDetail({ novelId, draft, total, ids, jump, onSelect }: ReviewDetailProps): React.JSX.Element {
  const approveDraft = useApproveDraftMutation(novelId);
  const feedback = useDraftFeedbackMutation(novelId, draft.chapter);
  const revise = useReviseDraftMutation(novelId, draft.chapter);
  const [dialog, setDialog] = useState<'revision_requested' | 'rejected' | null>(null);

  const intent = REVIEW_INTENT[draft.reviewStatus] ?? 'neutral';
  const isContradiction = draft.reviewStatus === 'contradiction';
  const nextId = nextAfterApproval(ids, chapterKey(draft.chapter));

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
    if (isContradiction || approveDraft.isPending) return;
    approveDraft.mutate(draft.chapter, {
      onSuccess: () => {
        toast.success(`Chapter ${draft.chapter} approved`);
        onSelect(nextId === undefined ? undefined : Number(nextId));
      },
      onError: err => toast.danger(err.message),
    });
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (dialog !== null) return;
      const target = event.target as HTMLElement | null;
      const editableTarget = target != null && isEditableElement(target.tagName, target.isContentEditable);
      const hotkey = reviewHotkey({ key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey, editableTarget });
      if (!hotkey) return;
      event.preventDefault();
      if (hotkey === 'approve') approve();
      else setDialog(hotkey === 'revise' ? 'revision_requested' : 'rejected');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const excerpt = draft.body ?? draft.summary ?? 'No prose available for this draft yet.';

  return (
    <>
      <DetailPage
        back={
          <Link to="/novels/$novelId/review" params={{ novelId }}>
            {backLabel(total)}
          </Link>
        }
        identity={
          <DetailPage.Identity avatar={<span className={styles.chapNum}>{chapterBadge(draft.chapter)}</span>} title={chapterTitle(draft)}>
            <StatusChip intent={intent} dot>
              {draft.reviewStatus}
            </StatusChip>
          </DetailPage.Identity>
        }
        pager={<ItemPager ids={ids} currentId={chapterKey(draft.chapter)} onSelect={id => onSelect(Number(id))} itemNoun="chapter" jump={jump} />}
        actions={
          <Button variant="secondary" size="sm" asChild>
            <Link to="/novels/$novelId/chapters" params={{ novelId }}>
              Open in chapters
            </Link>
          </Button>
        }
        asideLabel={`Chapter ${draft.chapter} review decision`}
        aside={
          <>
            <section className={styles.verdict} data-contradiction={isContradiction}>
              <div className={styles.verdictHead}>
                <WarningIcon size={16} className={styles.verdictIcon} />
                <h2 className={styles.verdictTitle}>Judge verdict: {draft.judge ?? draft.reviewStatus}</h2>
              </div>
              <p className={styles.verdictNote}>{draft.judgeNote ?? 'Awaiting reviewer sign-off. Read the draft and approve, request a revision, or reject.'}</p>
            </section>

            <div className={styles.decision}>
              <Tooltip content={isContradiction ? 'Resolve the contradiction before approving' : 'Approve this draft'}>
                <Button variant="primary" fullWidth disabled={isContradiction} loading={approveDraft.isPending} onClick={approve}>
                  Approve draft
                </Button>
              </Tooltip>
              <Button variant="secondary" fullWidth onClick={() => setDialog('revision_requested')}>
                Request revision
              </Button>
              <Button variant="danger" fullWidth onClick={() => setDialog('rejected')}>
                Reject
              </Button>
              <p className={styles.hotkeys}>
                <Kbd keys="A" /> approve <Kbd keys="R" /> revise <Kbd keys="X" /> reject
              </p>
            </div>
          </>
        }
      >
        <div className={`nf-eyebrow ${styles.excerptLabel}`}>Draft excerpt · {wordCount(draft.body).toLocaleString()} words</div>
        <DetailPage.Prose className={styles.excerpt}>
          {excerpt.slice(0, 900)}
          {excerpt.length > 900 ? '…' : ''}
        </DetailPage.Prose>
      </DetailPage>

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
  const { chapter: chapterParam } = Route.useSearch();
  const goSearch = Route.useNavigate();
  const queueQuery = useReviewQueueQuery(novelId);
  const drafts = useMemo(() => queueQuery.data?.drafts ?? [], [queueQuery.data]);
  const proposals = queueQuery.data?.proposals ?? [];

  const resolved = !queueQuery.isLoading && !queueQuery.error;
  const total = resolved ? drafts.length : undefined;
  const ids = useMemo(() => (resolved ? queueIds(drafts) : undefined), [resolved, drafts]);

  // The counts strip has no endpoint of its own; it reads the drafts list the chapters screen already
  // caches, and only once the queue is known to be empty — the one state that renders it.
  const draftsQuery = useListDraftsQuery(novelId, resolved && drafts.length === 0);
  const counts = draftsQuery.data ? reviewCounts(draftsQuery.data.items) : undefined;

  const selected = chapterParam === undefined ? undefined : drafts.find(draft => draft.chapter === chapterParam);
  const selectChapter = (chapter: number | undefined): void => void goSearch({ search: { chapter } });

  const jumpItems = useMemo(
    () => drafts.map(draft => ({ id: chapterKey(draft.chapter), label: `${chapterBadge(draft.chapter)} · ${chapterTitle(draft)}`, caption: queueReason(draft) })),
    [drafts],
  );
  const jump = useCollectionJump(
    resolved
      ? {
          collection: 'queued chapters',
          items: jumpItems,
          currentId: chapterParam === undefined ? undefined : chapterKey(chapterParam),
          onSelect: id => selectChapter(Number(id)),
        }
      : null,
  );

  if (selected) return <ReviewDetail novelId={novelId} draft={selected} total={total} ids={ids} jump={jump} onSelect={selectChapter} />;

  return (
    <CollectionPage
      title="Review Queue"
      subtitle="Chapters the judge flagged, and finished drafts waiting on a human read."
      total={total}
      notice={
        resolved &&
        chapterParam !== undefined && (
          <Alert intent="warning" title={`Chapter ${chapterParam} is no longer in the queue.`} action={{ label: 'Back to the queue', onClick: () => selectChapter(undefined) }}>
            It was approved, its draft was replaced, or the link was typed by hand.
          </Alert>
        )
      }
      empty={
        <EmptyState
          icon={<CheckIcon size={24} />}
          title="Nothing is waiting on you"
          description="A chapter lands here when the judge flags a contradiction in it, or when a draft finishes generating and asks for a human read."
          actions={
            <>
              <Button variant="primary" asChild>
                <Link to="/novels/$novelId/chapters" params={{ novelId }}>
                  Go to chapters
                </Link>
              </Button>
              {proposals.length > 0 && (
                <Button variant="secondary" asChild>
                  <Link to="/novels/$novelId/proposals" params={{ novelId }}>
                    {proposals.length === 1 ? 'Review 1 continuity proposal' : `Review ${proposals.length} continuity proposals`}
                  </Link>
                </Button>
              )}
            </>
          }
          counts={counts}
        />
      }
    >
      {queueQuery.isLoading ? (
        <PaneLoader />
      ) : queueQuery.error ? (
        <PaneError error={queueQuery.error} />
      ) : (
        <CollectionPage.Rows>
          {drafts.map(draft => (
            <CollectionPage.Row
              key={draft.id}
              link={<Link to="/novels/$novelId/review" params={{ novelId }} search={{ chapter: draft.chapter }} />}
              leading={<span className={styles.chapNum}>{chapterBadge(draft.chapter)}</span>}
              title={chapterTitle(draft)}
              caption={queueReason(draft)}
              trailing={
                <StatusChip intent={REVIEW_INTENT[draft.reviewStatus] ?? 'neutral'} dot>
                  {draft.reviewStatus}
                </StatusChip>
              }
              meta={queueMeta(draft)}
            />
          ))}
        </CollectionPage.Rows>
      )}
    </CollectionPage>
  );
}
