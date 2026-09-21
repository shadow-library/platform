import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, Button, ConfirmDialog, Dialog, FormField, Kbd, SegmentedControl, Textarea, toast, Tooltip } from '@shadow-library/ui';

import { CheckIcon, ProposalsIcon, WarningIcon } from '@/components/icons';
import { useCollectionJump } from '@/components/Layout';
import { type ChipIntent, CollectionPage, DetailPage, EmptyState, ItemPager, type ItemPagerJump, PaneError, PaneLoader, StatusChip } from '@/components/nf';
import {
  type ApiError,
  type ContinuityProposalResponse,
  type DraftResponse,
  type FeedbackBody,
  listProposalsQueryOptions,
  reviewQueueQueryOptions,
  useAiModelsQuery,
  useApplyContinuityProposalMutation,
  useApproveDraftMutation,
  useDiscardContinuityProposalMutation,
  useDraftFeedbackMutation,
  useListDraftsQuery,
  useListProposalsQuery,
  useReviewQueueQuery,
  useReviseDraftMutation,
} from '@/lib/apis';
import { relativeTime } from '@/lib/format';
import { modelLabel } from '@/lib/model-defaults';
import {
  changeSetCaption,
  countByFilter,
  FILTER_LABEL,
  filterProposals,
  nextAfterDecision,
  parseProposalFilter,
  type ProposalFilter,
  proposalIds,
  proposalMeta,
  backLabel as proposalsBackLabel,
  proposalTitle,
} from '@/lib/proposals';
import {
  backLabel,
  chapterBadge,
  chapterKey,
  chapterTitle,
  continuityCaption,
  continuityHasHeldEntries,
  continuityIds,
  continuityTitle,
  isEditableElement,
  nextAfterApproval,
  parseChapterParam,
  parseReviewView,
  queueIds,
  queueMeta,
  queueReason,
  reviewCounts,
  reviewHotkey,
  type ReviewView,
  wordCount,
} from '@/lib/review-queue';

import { ChangeOpBody, PluginSourceChip, ProposalDetail, statusIntent } from './proposals';
import styles from './review.module.css';

interface ReviewSearch {
  view?: ReviewView;
  chapter?: number;
  filter?: ProposalFilter;
  proposal?: string;
  continuity?: string;
}

export const Route = createFileRoute('/novels/$novelId/review')({
  validateSearch: (search: Record<string, unknown>): ReviewSearch => ({
    view: parseReviewView(search.view),
    chapter: parseChapterParam(search.chapter),
    filter: parseProposalFilter(search.filter),
    proposal: typeof search.proposal === 'string' && search.proposal ? search.proposal : undefined,
    continuity: typeof search.continuity === 'string' && search.continuity ? search.continuity : undefined,
  }),
  loader: ({ context, params }) =>
    Promise.all([
      context.queryClient.prefetchQuery(reviewQueueQueryOptions(params.novelId)),
      context.queryClient.prefetchQuery(listProposalsQueryOptions(params.novelId, { limit: 100 })),
    ]),
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

interface ContinuityProposalDetailProps {
  novelId: string;
  proposal: ContinuityProposalResponse;
  total: number | undefined;
  filter: ProposalFilter | undefined;
  ids: readonly string[] | undefined;
  jump?: ItemPagerJump;
  onSelect: (continuityId: string | undefined) => void;
}

function ContinuityProposalDetail({ novelId, proposal, total, filter, ids, jump, onSelect }: ContinuityProposalDetailProps): React.JSX.Element {
  const modelsQuery = useAiModelsQuery();
  const apply = useApplyContinuityProposalMutation(novelId);
  const discard = useDiscardContinuityProposalMutation(novelId);
  const heldEntries = continuityHasHeldEntries(proposal.proposal);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const doApply = (): void => {
    apply.mutate(proposal.chapter, {
      onSuccess: result => {
        if (result.status === 'pending') toast.success('Applied what it could — a few low-confidence findings are still waiting on you');
        else {
          toast.success(`Chapter ${proposal.chapter} continuity applied to canon`);
          onSelect(nextAfterDecision(ids, proposal.id));
        }
      },
      onError: err => toast.danger(err.message),
    });
  };

  const doDiscard = (): void => {
    const next = nextAfterDecision(ids, proposal.id);
    discard.mutate(proposal.chapter, {
      onSuccess: () => {
        toast.success('Continuity proposal discarded');
        setConfirmDiscard(false);
        onSelect(next);
      },
      onError: err => toast.danger(err.message),
    });
  };

  return (
    <>
      <DetailPage
        back={
          <Link to="/novels/$novelId/review" params={{ novelId }} search={{ view: 'proposals', filter }}>
            {proposalsBackLabel(total)}
          </Link>
        }
        identity={
          <DetailPage.Identity title={continuityTitle(proposal.chapter)}>
            <StatusChip intent="warning" dot>
              pending
            </StatusChip>
          </DetailPage.Identity>
        }
        pager={<ItemPager ids={ids} currentId={proposal.id} onSelect={onSelect} itemNoun="proposal" jump={jump} />}
        actions={
          <Button variant="secondary" size="sm" asChild>
            <Link to="/novels/$novelId/review" params={{ novelId }} search={{ chapter: proposal.chapter }}>
              Open chapter
            </Link>
          </Button>
        }
        asideLabel="Continuity decision"
        aside={
          <>
            <section className={styles.asideBlock}>
              <h2 className={styles.asideTitle}>Decision</h2>
              <div className={styles.decision}>
                <Button variant="primary" fullWidth loading={apply.isPending} onClick={doApply}>
                  Apply to canon
                </Button>
                <Button variant="danger" fullWidth loading={discard.isPending} onClick={() => setConfirmDiscard(true)}>
                  Discard
                </Button>
              </div>
              <p className={styles.asideNote}>
                {heldEntries
                  ? 'Confident findings apply now; entries still marked low-confidence stay open for another look.'
                  : 'Applies every finding below to the story bible, threads, mysteries and character states.'}
              </p>
            </section>

            <section className={styles.asideBlock}>
              <h2 className={styles.asideTitle}>Origin</h2>
              <dl className={styles.originGrid}>
                <dt>Chapter</dt>
                <dd>{chapterBadge(proposal.chapter)}</dd>
                <dt>Staged</dt>
                <dd>{relativeTime(proposal.createdAt)}</dd>
                {proposal.model && (
                  <>
                    <dt>Model</dt>
                    <dd className={styles.model}>{modelLabel(modelsQuery.data?.models ?? [], proposal.model)}</dd>
                  </>
                )}
              </dl>
            </section>
          </>
        }
      >
        <div className={`nf-eyebrow ${styles.findingsLabel}`}>Continuity findings · {continuityCaption(proposal.proposal)}</div>
        <div className={styles.findings}>
          <ChangeOpBody op={proposal.proposal} />
        </div>
      </DetailPage>
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={setConfirmDiscard}
        intent="danger"
        title="Discard this continuity proposal?"
        description="These findings won't be applied to canon. This cannot be undone."
        confirmLabel="Discard"
        loading={discard.isPending}
        onConfirm={doDiscard}
      />
    </>
  );
}

function ReviewScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const { view: viewParam, chapter: chapterParam, filter: filterParam, proposal: proposalParam, continuity: continuityParam } = Route.useSearch();
  const goSearch = Route.useNavigate();

  const queueQuery = useReviewQueueQuery(novelId);
  const drafts = useMemo(() => queueQuery.data?.drafts ?? [], [queueQuery.data]);
  const continuityProposals = useMemo(() => queueQuery.data?.proposals ?? [], [queueQuery.data]);

  const proposalsQuery = useListProposalsQuery(novelId, { limit: 100 });
  const refinementProposals = useMemo(() => proposalsQuery.data?.items ?? [], [proposalsQuery.data]);

  const resolved = !queueQuery.isLoading && !queueQuery.error;
  const proposalsResolved = !proposalsQuery.isLoading && !proposalsQuery.error;
  const bothResolved = resolved && proposalsResolved;
  const view: ReviewView = viewParam ?? 'chapters';
  const activeFilter: ProposalFilter = filterParam ?? 'open';

  const total = resolved ? drafts.length : undefined;
  const ids = useMemo(() => (resolved ? queueIds(drafts) : undefined), [resolved, drafts]);

  const draftsQuery = useListDraftsQuery(novelId, resolved && drafts.length === 0);
  const counts = draftsQuery.data ? reviewCounts(draftsQuery.data.items) : undefined;

  const selectedDraft = chapterParam === undefined ? undefined : drafts.find(draft => draft.chapter === chapterParam);
  const selectChapter = (chapter: number | undefined): void => void goSearch({ search: { chapter } });

  const refinementCounts = useMemo(() => countByFilter(refinementProposals), [refinementProposals]);
  const refinementVisible = useMemo(() => filterProposals(refinementProposals, activeFilter), [refinementProposals, activeFilter]);
  const refinementById = useMemo(() => new Map(refinementProposals.map(proposal => [proposal.id, proposal])), [refinementProposals]);
  const continuityById = useMemo(() => new Map(continuityProposals.map(proposal => [proposal.id, proposal])), [continuityProposals]);

  const selectedProposal = proposalParam ? refinementById.get(proposalParam) : undefined;
  const selectedContinuity = continuityParam ? continuityById.get(continuityParam) : undefined;

  const selectProposal = (proposalId?: string): void => void goSearch({ search: { view: 'proposals', filter: filterParam, proposal: proposalId } });
  const selectContinuity = (continuityId?: string): void => void goSearch({ search: { view: 'proposals', filter: filterParam, continuity: continuityId } });
  const pickView = (value: string): void => void goSearch({ search: { view: value === 'proposals' ? 'proposals' : undefined } });
  const pickFilter = (value: string): void => void goSearch({ search: { view: 'proposals', filter: parseProposalFilter(value) } });

  const combinedTotal = bothResolved ? drafts.length + continuityProposals.length + refinementProposals.length : undefined;
  const proposalsBackTotal = continuityProposals.length + refinementProposals.length;

  const refinementJumpItems = useMemo(
    () => refinementVisible.map(proposal => ({ id: proposal.id, label: proposalTitle(proposal), caption: changeSetCaption(proposal.changeSet) })),
    [refinementVisible],
  );
  const refinementAllJumpItems = useMemo(
    () =>
      activeFilter === 'all'
        ? undefined
        : refinementProposals.map(proposal => ({ id: proposal.id, label: proposalTitle(proposal), caption: changeSetCaption(proposal.changeSet) })),
    [activeFilter, refinementProposals],
  );
  const refinementJump = useCollectionJump(
    view === 'proposals' && proposalsResolved
      ? {
          collection: 'proposals',
          items: refinementJumpItems,
          filterLabel: FILTER_LABEL[activeFilter],
          allItems: refinementAllJumpItems,
          currentId: proposalParam,
          onSelect: selectProposal,
        }
      : null,
  );

  const continuityJumpItems = useMemo(
    () => continuityProposals.map(proposal => ({ id: proposal.id, label: continuityTitle(proposal.chapter), caption: continuityCaption(proposal.proposal) })),
    [continuityProposals],
  );
  const continuityJump = useCollectionJump(
    view === 'proposals' && resolved ? { collection: 'continuity findings', items: continuityJumpItems, currentId: continuityParam, onSelect: selectContinuity } : null,
  );

  const jumpItems = useMemo(
    () => drafts.map(draft => ({ id: chapterKey(draft.chapter), label: `${chapterBadge(draft.chapter)} · ${chapterTitle(draft)}`, caption: queueReason(draft) })),
    [drafts],
  );
  const jump = useCollectionJump(
    resolved && view === 'chapters'
      ? { collection: 'queued chapters', items: jumpItems, currentId: chapterParam === undefined ? undefined : chapterKey(chapterParam), onSelect: id => selectChapter(Number(id)) }
      : null,
  );

  if (selectedDraft) return <ReviewDetail novelId={novelId} draft={selectedDraft} total={total} ids={ids} jump={jump} onSelect={selectChapter} />;
  if (selectedProposal)
    return (
      <ProposalDetail
        novelId={novelId}
        proposal={selectedProposal}
        total={bothResolved ? proposalsBackTotal : undefined}
        filter={filterParam}
        ids={proposalsResolved ? proposalIds(refinementVisible) : undefined}
        jump={refinementJump}
        onSelect={selectProposal}
      />
    );
  if (selectedContinuity)
    return (
      <ContinuityProposalDetail
        novelId={novelId}
        proposal={selectedContinuity}
        total={bothResolved ? proposalsBackTotal : undefined}
        filter={filterParam}
        ids={resolved ? continuityIds(continuityProposals) : undefined}
        jump={continuityJump}
        onSelect={selectContinuity}
      />
    );

  return (
    <CollectionPage
      title="Review Queue"
      subtitle={
        view === 'chapters'
          ? 'Chapters the judge flagged, and finished drafts waiting on a human read.'
          : 'Continuity findings from finalize, and change-sets a chat turn, an analysis pass or a plugin staged against canon.'
      }
      total={combinedTotal}
      segments={{
        label: 'Review Queue section',
        value: view,
        onValueChange: pickView,
        items: [
          { value: 'chapters', label: 'Chapters', count: resolved ? drafts.length : undefined },
          { value: 'proposals', label: 'Proposals', count: bothResolved ? continuityProposals.length + refinementCounts.open : undefined },
        ],
      }}
      notice={
        view === 'chapters'
          ? resolved &&
            chapterParam !== undefined && (
              <Alert intent="warning" title={`Chapter ${chapterParam} is no longer in the queue.`} action={{ label: 'Back to the queue', onClick: () => selectChapter(undefined) }}>
                It was approved, its draft was replaced, or the link was typed by hand.
              </Alert>
            )
          : bothResolved &&
            (proposalParam !== undefined || continuityParam !== undefined) && (
              <Alert
                intent="warning"
                title="That proposal is no longer here."
                action={{ label: 'Back to the directory', onClick: () => (proposalParam !== undefined ? selectProposal(undefined) : selectContinuity(undefined)) }}
              >
                It was applied, discarded, superseded, or the link was typed by hand.
              </Alert>
            )
      }
      empty={
        <EmptyState
          icon={<CheckIcon size={24} />}
          title="Nothing is waiting on you"
          description="A chapter lands here when the judge flags a contradiction in it, a draft finishes and asks for a human read, finalize proposes a continuity update, or a refinement turn stages a change-set."
          actions={
            <>
              <Button variant="primary" asChild>
                <Link to="/novels/$novelId/chapters" params={{ novelId }}>
                  Go to chapters
                </Link>
              </Button>
              <Button variant="secondary" asChild>
                <Link to="/novels/$novelId/chat" params={{ novelId }}>
                  Open refinement chat
                </Link>
              </Button>
            </>
          }
          counts={counts}
        />
      }
    >
      {view === 'chapters' ? (
        queueQuery.isLoading ? (
          <PaneLoader />
        ) : queueQuery.error ? (
          <PaneError error={queueQuery.error} />
        ) : drafts.length === 0 ? (
          <EmptyState
            icon={<CheckIcon size={24} />}
            title="No chapters waiting on a read"
            description="A chapter lands here when the judge flags a contradiction in it, or when a draft finishes generating and asks for a human read."
          />
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
        )
      ) : queueQuery.isLoading || proposalsQuery.isLoading ? (
        <PaneLoader />
      ) : queueQuery.error || proposalsQuery.error ? (
        <PaneError error={(queueQuery.error ?? proposalsQuery.error) as ApiError} />
      ) : continuityProposals.length === 0 && refinementProposals.length === 0 ? (
        <EmptyState
          icon={<ProposalsIcon size={24} />}
          title="No proposals staged"
          description="A proposal appears here when finalize proposes a continuity update, or when a refinement chat turn, an analysis pass or a plugin drafts a change-set against this novel's canon."
          actions={
            <Button variant="primary" asChild>
              <Link to="/novels/$novelId/chat" params={{ novelId }}>
                Open refinement chat
              </Link>
            </Button>
          }
        />
      ) : (
        <>
          <CollectionPage.Section label="Continuity" total={continuityProposals.length}>
            <CollectionPage.Rows>
              {continuityProposals.map(proposal => (
                <CollectionPage.Row
                  key={proposal.id}
                  link={<Link to="/novels/$novelId/review" params={{ novelId }} search={{ view: 'proposals', filter: filterParam, continuity: proposal.id }} />}
                  leading={<span className={styles.chapNum}>{chapterBadge(proposal.chapter)}</span>}
                  title={continuityTitle(proposal.chapter)}
                  caption={continuityCaption(proposal.proposal)}
                  trailing={
                    <StatusChip intent="warning" dot>
                      pending
                    </StatusChip>
                  }
                  meta={relativeTime(proposal.createdAt)}
                />
              ))}
            </CollectionPage.Rows>
          </CollectionPage.Section>

          <CollectionPage.Section label="Refinement" total={refinementProposals.length}>
            <div className={styles.proposalGroupHead}>
              <SegmentedControl size="sm" aria-label="Refinement proposal state" value={activeFilter} onValueChange={pickFilter}>
                {(['open', 'applied', 'all'] as const).map(value => (
                  <SegmentedControl.Item key={value} value={value}>
                    {FILTER_LABEL[value]} {refinementCounts[value]}
                  </SegmentedControl.Item>
                ))}
              </SegmentedControl>
            </div>
            {refinementVisible.length === 0 ? (
              <p className={styles.asideNote}>
                {activeFilter === 'open' ? 'Every refinement proposal has been applied, discarded or superseded.' : 'No applied refinement proposal yet.'}
              </p>
            ) : (
              <CollectionPage.Rows>
                {refinementVisible.map(proposal => (
                  <CollectionPage.Row
                    key={proposal.id}
                    link={<Link to="/novels/$novelId/review" params={{ novelId }} search={{ view: 'proposals', filter: filterParam, proposal: proposal.id }} />}
                    title={proposalTitle(proposal)}
                    caption={changeSetCaption(proposal.changeSet)}
                    clampCaption
                    trailing={
                      <>
                        <StatusChip intent={statusIntent(proposal.status)} dot>
                          {proposal.status}
                        </StatusChip>
                        <PluginSourceChip proposal={proposal} />
                        {proposal.autoApplied && <StatusChip intent="info">auto</StatusChip>}
                      </>
                    }
                    meta={proposalMeta(proposal)}
                  />
                ))}
              </CollectionPage.Rows>
            )}
          </CollectionPage.Section>
        </>
      )}
    </CollectionPage>
  );
}
