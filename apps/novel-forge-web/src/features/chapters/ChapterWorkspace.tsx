import { useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, ChevronDownIcon, ChevronRightIcon, DropdownMenu, IconButton, Input, toast, Tooltip } from '@shadow-library/ui';

import { ChevronLeftIcon, DocIcon, EditIcon, SparkIcon } from '@/components/icons';
import { ChapterMarkdown, type ChipIntent, GenerationStatus, RegenerateChapterButton, StopButton } from '@/components/nf';
import { ForgeBar } from '@/components/nf/ForgeBar';
import { ImageGallery } from '@/components/nf/ImageGallery';
import {
  ChapterDetailsPanel,
  ChecksDrawer,
  editorRecovery,
  EditorStrip,
  FinalizeButton,
  HeldActions,
  type ProseTool,
  ProseToolbar,
  ProseToolbarNote,
  StoryBibleUpdatesButton,
  UnsavedChangesGuard,
  useChapterEditor,
  useOverrideConfirm,
  useProseFormatting,
  useReviewJobs,
  useSaveShortcut,
  WorkspaceStrip,
} from '@/features/chapter-workspace';
import {
  type AmendChapterResponse,
  type ApiError,
  type ChapterReviewKind,
  type CostTier,
  type DraftResponse,
  isFinalizeBlocked,
  isIsolated,
  isQueuedReview,
  useAddChapterImageMutation,
  useApproveDraftMutation,
  useChapterImagesQuery,
  useChapterReviewsQuery,
  useDeleteChapterImageMutation,
  useExtractToBibleMutation,
  useFinalizeReviewQuery,
  useRunReviewMutation,
} from '@/lib/apis';
import { approvalMessage, approvalRefusal, blockingHold, holdDetail, holdMessage, kindLabel, overrideWarning, repairSource } from '@/lib/chapter-checks';
import { hasUnsavedWork, isDirty, isSaveBlocked, leaveWarning, saveLabel, wordCount } from '@/lib/chapter-editor';
import { approvalMoved, approveAsWrittenRefused, changedSinceApproval, statusLabel, workspaceActions } from '@/lib/chapter-workspace';
import { storyBibleWritten } from '@/lib/finalize-review';
import { chapterGeneration } from '@/lib/generation-activity';
import { useGenerationActivity } from '@/lib/use-generation-activity';

import { statusMeta } from './chapter-status';
import { UnrestrictedBadge } from './UnrestrictedBadge';
import { ChapterSwitchDrawer } from './ChapterSwitchDrawer';
import { SummarizeDialog } from './SummarizeDialog';
import { AmendDialog } from './AmendDialog';
import styles from './chapters.module.css';

function toneOf(intent: ChipIntent): 'success' | 'danger' | 'warning' {
  return intent === 'success' ? 'success' : intent === 'danger' ? 'danger' : 'warning';
}

const CHAPTER_TOOLS: readonly ProseTool[] = ['bold', 'italic', 'bulleted', 'numbered', 'table'];

interface ChapterWorkspaceProps {
  novelId: string;
  draft: DraftResponse;
  deleted: boolean;
  openReviewOnLoad: boolean;
  onBack: () => void;
  onPick: (n: number) => void;
}

export function ChapterWorkspace({ novelId, draft, deleted, openReviewOnLoad, onBack, onPick }: ChapterWorkspaceProps): React.JSX.Element {
  const chapter = draft.chapter;
  const approveDraft = useApproveDraftMutation(novelId);
  const runReview = useRunReviewMutation(novelId, chapter);
  const reviews = useChapterReviewsQuery(novelId, chapter);
  const reviewJobs = useReviewJobs(novelId, chapter, reviews.data);
  const extract = useExtractToBibleMutation(novelId, chapter);
  const finalizeReview = useFinalizeReviewQuery(novelId, chapter);
  const offersAddToBible = !storyBibleWritten(finalizeReview.data);
  const navigate = useNavigate();
  const sceneImagesQuery = useChapterImagesQuery(novelId, chapter);
  const addSceneImage = useAddChapterImageMutation(novelId, chapter);
  const removeSceneImage = useDeleteChapterImageMutation(novelId, chapter);
  const { activity, stop, stopping } = useGenerationActivity(novelId);
  const generation = chapterGeneration(activity, chapter);
  const editor = useChapterEditor(novelId, draft, deleted);
  const { title, body } = editor.state;

  // A `?review=1` hand-off (e.g. from Overview's Next step card) opens straight into the drawer; this
  // is read once at mount, matching the drawer's own open state being otherwise locally controlled.
  const [reviewOpen, setReviewOpen] = useState(openReviewOnLoad);
  const [checksKind, setChecksKind] = useState<ChapterReviewKind>('judge');
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [summarizeOpen, setSummarizeOpen] = useState(false);
  const [summarizeAutoRun, setSummarizeAutoRun] = useState(true);
  const openSummarize = (autoRun: boolean): void => {
    setSummarizeAutoRun(autoRun);
    setSummarizeOpen(true);
  };
  const [amendOpen, setAmendOpen] = useState(false);
  const [amendResult, setAmendResult] = useState<AmendChapterResponse | undefined>();
  const [staleRefusal, setStaleRefusal] = useState<string | undefined>();
  // A chapter with no prose yet (a fresh "write it yourself" draft) opens straight in the editor; one with prose opens as a read.
  const [editing, setEditing] = useState(() => draft.status !== 'final' && !(draft.body ?? '').trim());
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const saveBlocked = isSaveBlocked(editor.state);
  const textLocked = editor.state.status === 'locked' || editor.state.status === 'deleted';
  const unsaved = hasUnsavedWork(editor.state);
  const inEditor = editing && (unsaved || !saveBlocked);

  useEffect(() => {
    if (inEditor && tab === 'write') editorRef.current?.focus();
  }, [inEditor, tab]);

  useEffect(() => {
    if (deleted && !unsaved) onBack();
  }, [deleted, unsaved, onBack]);

  useSaveShortcut(inEditor, editor.save);

  const meta = statusMeta(draft);
  const held = draft.status === 'final' ? 0 : blockingHold(reviews.data);
  const contradiction = draft.status !== 'final' && draft.reviewStatus === 'contradiction';
  const actions = workspaceActions(draft, Boolean(generation), held);
  const overrideConfirm = useOverrideConfirm(chapter, held);
  const approvedBefore = changedSinceApproval(draft);
  const finalizeBlocked = isFinalizeBlocked(draft);
  const runBlockedReason = generation ? 'The chapter is being written — review it once it’s done.' : !draft.body?.trim() ? 'There’s no text to review yet.' : undefined;
  const displayTitle = draft.title?.trim() || 'Untitled chapter';
  const commentable = actions.askForge && !generation && draft.reviewStatus !== 'generating';

  const format = useProseFormatting(editorRef, body, editor.setBody);

  const finishEditing = async (): Promise<void> => {
    if (await editor.save()) setEditing(false);
  };

  const recovery = editorRecovery(editor, setEditing);

  const refuseApproval = (error: ApiError): void => {
    if (approvalMoved(error)) toast.warning('The text changed since you read it — the new version is on screen now. Read it, then approve again.');
    else toast.danger(error.message);
  };

  const announceApproval = (approved: DraftResponse, asWritten?: boolean): void => {
    const message = approvalMessage(chapter, approved.overriddenFindings, asWritten);
    if (approved.overriddenFindings) toast.warning(message);
    else toast.success(message);
  };

  const approve = (): void => {
    overrideConfirm.request(() => approveDraft.mutate(draft, { onSuccess: approved => announceApproval(approved), onError: refuseApproval }));
  };

  const approveAsWritten = (): void => {
    if (!draft.staleReason) return;
    const keptStaleReason = draft.staleReason;
    overrideConfirm.request(() => {
      setStaleRefusal(undefined);
      approveDraft.mutate(
        { id: draft.id, chapter, revision: draft.revision, saveSeq: draft.saveSeq, keptStaleReason },
        {
          onSuccess: approved => announceApproval(approved, true),
          onError: err => (approveAsWrittenRefused(err) ? setStaleRefusal(err.message) : refuseApproval(err)),
        },
      );
    });
  };

  const startReview = (kind: ChapterReviewKind, costTier?: CostTier): void => {
    runReview.mutate(
      { kind, costTier },
      {
        onSuccess: started => {
          if (isQueuedReview(started)) return;
          toast.success(started.openFindings === 0 ? `${kindLabel(kind)}: no issue detected` : `${kindLabel(kind)}: ${started.openFindings} open`);
        },
        onError: err => toast.danger(err.message),
      },
    );
  };

  const openChecks = (kind: ChapterReviewKind = checksKind): void => {
    setChecksKind(kind);
    setReviewOpen(true);
  };

  const runJudge = (): void => {
    openChecks('judge');
    if (!reviewJobs.active.judge) startReview('judge');
  };

  const runExtract = (): void => {
    extract.mutate(undefined, {
      onSuccess: () => toast.success('Canon proposal drafted — it is waiting on you in the chat'),
      onError: err => toast.danger(err.message),
    });
  };

  const editorStrip = (
    <EditorStrip
      state={editor.state}
      chapter={chapter}
      onKeepMine={editor.keepMine}
      onTakeTheirs={recovery.takeTheirs}
      onCopyMine={recovery.copyMine}
      onDiscard={recovery.discardMine}
      onRetry={() => void editor.retry()}
    />
  );

  const chapterStrip = inEditor ? null : draft.status === 'final' ? (
    <WorkspaceStrip tone="success">
      Final and locked. Nothing — the chat, a plan, a rewrite — can change it. Amend is yours: it changes the text only, keeps the lock, and leaves the Story Bible as it is.
    </WorkspaceStrip>
  ) : draft.staleReason ? (
    <WorkspaceStrip
      tone="warning"
      detail={staleRefusal ?? (held > 0 ? `${holdMessage(chapter, held)} ${overrideWarning(held)}` : approvalRefusal(draft.reviewStatus, held))}
      actions={
        <>
          {contradiction && held === 0 && <HeldActions novelId={novelId} draft={draft} repairNote={repairSource(reviews.data, draft.judgeNote)} regenerate={false} />}
          <Button variant="secondary" size="sm" disabled={!actions.approveAsWritten} loading={approveDraft.isPending} onClick={approveAsWritten}>
            Approve as written
          </Button>
          <RegenerateChapterButton novelId={novelId} chapter={chapter} label="Regenerate" disabledReason={generation ? 'Already being written' : undefined} />
          <Button variant="ghost" size="sm" disabled={!actions.edit} onClick={() => setEditing(true)}>
            Edit
          </Button>
        </>
      }
    >
      {draft.staleReason}
    </WorkspaceStrip>
  ) : held > 0 || contradiction ? (
    <WorkspaceStrip
      tone="danger"
      detail={holdDetail(held, draft.judgeNote, actions.approve)}
      actions={
        <>
          <Button variant="secondary" size="sm" onClick={() => openChecks('judge')}>
            Open checks
          </Button>
          <HeldActions novelId={novelId} draft={draft} repairNote={repairSource(reviews.data, draft.judgeNote)} />
        </>
      }
    >
      {holdMessage(chapter, held)}
    </WorkspaceStrip>
  ) : approvedBefore !== undefined ? (
    <WorkspaceStrip
      tone="warning"
      actions={
        actions.approve && (
          <Button variant="primary" size="sm" loading={approveDraft.isPending} onClick={approve}>
            Approve version {draft.revision}
          </Button>
        )
      }
    >
      Changed since you approved (version {approvedBefore}). This is version {draft.revision} — your approval and the checks are out of date.
    </WorkspaceStrip>
  ) : null;

  const addToBible = (
    <Button variant="ghost" size="sm" loading={extract.isPending} disabled={!draft.body?.trim()} onClick={runExtract}>
      Add to bible
    </Button>
  );

  return (
    <div className={styles.editorScreen}>
      <div className={styles.editorHead}>
        <Tooltip content="Back to chapters">
          <IconButton variant="ghost" aria-label="Back to chapters" icon={<ChevronLeftIcon size={18} />} onClick={onBack} />
        </Tooltip>
        <button className={`nf-nav ${styles.chapterNav}`} onClick={() => setChaptersOpen(true)}>
          <span className={styles.chapterNavNum}>{String(chapter).padStart(2, '0')}</span>
          <span className={styles.chapterNavTitle}>{displayTitle}</span>
          <ChevronRightIcon size={15} className={styles.iconTertiary} />
        </button>
        <span className={styles.headStatus}>
          {isIsolated(draft) && <UnrestrictedBadge />}
          {generation ? (
            <>
              <GenerationStatus generation={generation} label="Regenerating" />
              {generation.phase === 'writing' && <StopButton onStop={stop} stopping={stopping} />}
            </>
          ) : (
            <button onClick={() => openChecks()} className={styles.statusPill} data-tone={toneOf(meta.intent)}>
              {statusLabel(draft) ?? meta.label}
            </button>
          )}
        </span>
        {inEditor ? (
          <Button variant="primary" size="sm" disabled={saveBlocked} onClick={() => void finishEditing()}>
            Done
          </Button>
        ) : (
          <>
            <span className={styles.wideActions}>
              {actions.edit && (
                <Tooltip content="Edit prose">
                  <IconButton variant="ghost" aria-label="Edit prose" icon={<EditIcon size={17} />} onClick={() => setEditing(true)} />
                </Tooltip>
              )}
              <Tooltip content="View or edit this chapter's summary">
                <IconButton variant="ghost" aria-label="Summary" icon={<DocIcon size={17} />} onClick={() => openSummarize(false)} />
              </Tooltip>
              {offersAddToBible && <Tooltip content="Add this chapter's new canon to the bible as a proposal">{addToBible}</Tooltip>}
              {actions.verify && (
                <Button variant="secondary" size="sm" loading={runReview.isPending && runReview.variables?.kind === 'judge'} onClick={runJudge}>
                  Verify
                </Button>
              )}
            </span>
            <span className={styles.narrowActions}>
              <DropdownMenu>
                <DropdownMenu.Trigger asChild>
                  <Button variant="ghost" size="sm" suffix={<ChevronDownIcon size={14} />}>
                    More
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Content align="end">
                  {actions.edit && <DropdownMenu.Item onSelect={() => setEditing(true)}>Edit prose</DropdownMenu.Item>}
                  <DropdownMenu.Item onSelect={() => openSummarize(false)}>Summary</DropdownMenu.Item>
                  {offersAddToBible && (
                    <DropdownMenu.Item disabled={!draft.body?.trim()} onSelect={runExtract}>
                      Add to bible
                    </DropdownMenu.Item>
                  )}
                  {actions.verify && <DropdownMenu.Item onSelect={runJudge}>Verify</DropdownMenu.Item>}
                </DropdownMenu.Content>
              </DropdownMenu>
            </span>
            {actions.amend && (
              <Tooltip content="Change this final chapter's text — it stays locked and the Story Bible is left as it is">
                <Button variant="secondary" size="sm" onClick={() => setAmendOpen(true)}>
                  Amend
                </Button>
              </Tooltip>
            )}
            {actions.amend && <StoryBibleUpdatesButton novelId={novelId} chapter={chapter} />}
            {actions.approve && (
              <Button variant="primary" size="sm" loading={approveDraft.isPending} onClick={approve}>
                {draft.approvedRevision === null ? 'Approve' : 'Approve again'}
              </Button>
            )}
            {actions.finalize && <FinalizeButton novelId={novelId} chapter={chapter} />}
          </>
        )}
      </div>

      {isDirty(editor.state) && editorStrip}
      {chapterStrip}

      <div className={styles.body}>
        <div className={styles.main}>
          {inEditor ? (
            <div className={`nf-scroll ${styles.scrollFill}`}>
              <div className={`nf-page ${styles.editorInner}`}>
                <div className={styles.titleField}>
                  <Input value={title} onValueChange={editor.setTitle} aria-label="Chapter title" placeholder="Chapter title" readOnly={textLocked} />
                </div>
                <div className={styles.tabs}>
                  {(['write', 'preview'] as const).map(t => (
                    <button key={t} onClick={() => setTab(t)} className={styles.tab} data-active={tab === t}>
                      {t}
                    </button>
                  ))}
                </div>
                {tab === 'write' ? (
                  <>
                    <ProseToolbar tools={CHAPTER_TOOLS} onTool={format.apply}>
                      <ProseToolbarNote>Markdown supported</ProseToolbarNote>
                    </ProseToolbar>
                    <textarea
                      ref={editorRef}
                      value={body}
                      onChange={e => editor.setBody(e.target.value)}
                      onKeyDown={format.onKeyDown}
                      readOnly={textLocked}
                      spellCheck
                      aria-label="Chapter prose (Markdown)"
                      placeholder="Write your chapter in Markdown…"
                      className={styles.textarea}
                    />
                  </>
                ) : (
                  <ChapterMarkdown content={body} className={styles.preview} />
                )}
              </div>
            </div>
          ) : (
            <div className={`nf-scroll ${styles.scrollFill}`}>
              <article className={`nf-page ${styles.reader}`}>
                {finalizeBlocked &&
                  (isIsolated(draft) ? (
                    <Alert
                      intent="danger"
                      title="Finalize is blocked until this chapter is summarized"
                      action={{ label: 'Summarize', onClick: () => openSummarize(true) }}
                      className={styles.notice}
                    >
                      This chapter’s prose is firewalled, so chapter {chapter + 1} sees only its summary and continuation state — and both are empty. Summarizing proposes them; you
                      review and apply before anything is saved.
                    </Alert>
                  ) : (
                    <Alert
                      intent="danger"
                      title="Finalize needs a summary for this chapter"
                      action={{ label: 'Summarise with AI', onClick: () => openSummarize(true) }}
                      className={styles.notice}
                    >
                      Chapter {chapter + 1}’s writer reads this chapter’s summary, not its prose — and it’s empty.{' '}
                      <button type="button" className={styles.linkButton} onClick={() => openSummarize(false)}>
                        Write your own
                      </button>{' '}
                      instead.
                    </Alert>
                  ))}
                {amendResult?.suggestExtractToBible && (
                  <Alert
                    intent="warning"
                    title="Canon was not re-derived"
                    action={{ label: 'Add to bible', onClick: runExtract }}
                    onDismiss={() => setAmendResult(undefined)}
                    className={styles.notice}
                  >
                    The amendment replaced prose only. Anything this chapter already contributed to the bible is still there and still propagating.
                  </Alert>
                )}
                {draft.title && <div className={styles.chapterEyebrow}>Chapter {chapter}</div>}
                {draft.body?.trim() ? (
                  <ChapterMarkdown content={draft.body} />
                ) : (
                  <p className={styles.emptyProse}>
                    {draft.status === 'final' ? 'This chapter has no prose.' : 'This chapter has no prose yet. Use “Edit prose” to write it, or generate a draft from its brief.'}
                  </p>
                )}
                {!actions.askForge && <p className={styles.finalNote}>The chat can’t change a final chapter. To change the text yourself, use Amend.</p>}
                {commentable && Boolean(draft.body?.trim()) && (
                  <p className={styles.finalNote}>
                    <button type="button" className={styles.linkButton} onClick={() => navigate({ to: '/novels/$novelId/chat', params: { novelId }, search: { chapter } })}>
                      Comment in the chat
                    </button>{' '}
                    to change a passage — select it there and say what you want different.
                  </p>
                )}

                <section className={styles.sceneImages}>
                  <div className={styles.sceneImagesHead}>
                    Scene images
                    <Button
                      variant="secondary"
                      size="sm"
                      prefix={<SparkIcon />}
                      onClick={() => navigate({ to: '/novels/$novelId/illustrations', params: { novelId }, search: { subject: 'chapter', key: String(chapter), start: true } })}
                    >
                      Generate scene art
                    </Button>
                  </div>
                  <ImageGallery
                    images={(sceneImagesQuery.data?.items ?? []).map(img => ({ id: img.id, url: img.imageUrl, caption: img.caption }))}
                    busy={addSceneImage.isPending || removeSceneImage.isPending}
                    addLabel="Add scene image"
                    onAdd={image => addSceneImage.mutate(image, { onSuccess: () => toast.success('Scene image added'), onError: e => toast.danger(e.message) })}
                    onRemove={id => removeSceneImage.mutate(id, { onSuccess: () => toast.success('Scene image removed'), onError: e => toast.danger(e.message) })}
                  />
                </section>
              </article>
            </div>
          )}

          {inEditor ? (
            <div className={styles.wordBadge}>
              {wordCount(body).toLocaleString()} words · <span aria-live="polite">{saveLabel(editor.state)}</span>
              {draft.reviewStatus === 'approved' && ' · Saving resets your approval'}
            </div>
          ) : (
            <div className={styles.wordBadge}>{wordCount(draft.body).toLocaleString()} words</div>
          )}

          {!inEditor && actions.askForge && (
            <div className={styles.forgeDock}>
              <ForgeBar
                novelId={novelId}
                scope={{ type: 'brief', ref: `chapter:${chapter}`, title: displayTitle }}
                placeholder={`Ask Forge to revise ${draft.title?.trim() || `chapter ${chapter}`} — tighten a scene, fix continuity, adjust the ending…`}
              />
            </div>
          )}
        </div>
        <ChapterDetailsPanel novelId={novelId} draft={draft} generating={Boolean(generation)} settledBase={editor.settledBase} />
      </div>

      <UnsavedChangesGuard when={unsaved} description={leaveWarning(editor.state)} onSave={saveBlocked ? undefined : editor.save} />

      {summarizeOpen && <SummarizeDialog novelId={novelId} draft={draft} autoRun={summarizeAutoRun} onOpenChange={setSummarizeOpen} />}

      {amendOpen && <AmendDialog novelId={novelId} chapter={chapter} draft={draft} onOpenChange={setAmendOpen} onAmended={setAmendResult} />}

      {overrideConfirm.dialog}
      <ChecksDrawer
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        novelId={novelId}
        draft={draft}
        reviews={reviews}
        jobs={reviewJobs}
        kind={checksKind}
        onKindChange={setChecksKind}
        runBlockedReason={runBlockedReason}
        starting={runReview.isPending ? runReview.variables?.kind : undefined}
        onRun={startReview}
      />
      <ChapterSwitchDrawer open={chaptersOpen} onOpenChange={setChaptersOpen} novelId={novelId} current={chapter} onPick={onPick} />
    </div>
  );
}
