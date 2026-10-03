import { Link } from '@tanstack/react-router';
import { type ReactNode, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Button, IconButton, SegmentedControl, Tooltip } from '@shadow-library/ui';

import { ChevronLeftIcon, CloseIcon } from '@/components/icons';
import { GenerationStatus, PaneError, PaneLoader, StatusChip } from '@/components/nf';
import {
  editorRecovery,
  EditorStrip,
  type ProseTool,
  ProseToolbar,
  ProseToolbarNote,
  UnsavedChangesGuard,
  useChapterEditor,
  useDraftApproval,
  useProseFormatting,
  useSaveShortcut,
  WorkspaceStrip,
} from '@/features/chapter-workspace';
import { type DraftResponse, type ProposalResponse, useDraftQuery } from '@/lib/apis';
import { chapterTitle, hasUnsavedWork, isDirty, isSaveBlocked, leaveWarning, saveLabel, unsettledMessage, wordCount } from '@/lib/chapter-editor';
import {
  CHAPTER_PANEL_WIDTH_KEY,
  type ChapterOpenMode,
  chapterPanelEdit,
  chapterPanelStatus,
  CHAT_BESIDE_PANEL_MIN,
  clampPanelWidth,
  isBeingWritten,
  leavesChapter,
  opensInEditor,
  panelApproval,
  panelWidthBounds,
  panelWidthForKey,
  storedPanelWidth,
} from '@/lib/chapter-panel';
import { proposedPassages, type TextSpan } from '@/lib/chapter-reader';
import { chapterGeneration, type ChapterGeneration } from '@/lib/generation-activity';
import { type ChipReveal, commentGate, isUnanswered, locateChip, type PassageChip } from '@/lib/passage-comments';
import { type PassageSelection } from '@/lib/passage-selection';
import { useGenerationActivity } from '@/lib/use-generation-activity';

import styles from './ChapterPanel.module.css';
import { ChapterReader, type CommentFollowUp, NumberedProse, type ReaderReveal } from './ChapterReader';

const PANEL_TOOLS: readonly ProseTool[] = ['bold', 'italic', 'sceneBreak'];

function readStoredWidth(): number {
  try {
    return storedPanelWidth(globalThis.localStorage?.getItem(CHAPTER_PANEL_WIDTH_KEY));
  } catch {
    return storedPanelWidth(undefined);
  }
}

function storeWidth(width: number): void {
  try {
    globalThis.localStorage?.setItem(CHAPTER_PANEL_WIDTH_KEY, String(width));
  } catch {
    // Storage full or blocked: the width holds for this visit only.
  }
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT';
}

/** The chat's side of commenting: the comments waiting in its composer, and the pending cards whose rewrites show in the prose. */
export interface PanelComments {
  chips: readonly PassageChip[];
  limitReason?: string;
  proposals: readonly ProposalResponse[];
  /** A chip the author clicked, to scroll to and flash. */
  reveal?: ChipReveal;
  /** The reveal was answered, so reopening the chapter does not answer it again. */
  onRevealed: () => void;
  onAdd: (chip: PassageChip, then: CommentFollowUp) => boolean;
  /** The chip's passage is no longer in the chapter as it was selected. */
  onMissing: (chipId: string) => void;
}

export interface ChapterPanelProps {
  novelId: string;
  chapter: number;
  comments: PanelComments;
  /** Set when the author's click opened the panel just now, rather than a reload or a shared link: it takes focus, and `edit` opens the editor. */
  request?: ChapterOpenMode;
  onClose: () => void;
  /** Shown under the header — the progress panel folded to its strip while the chapter holds the right side. */
  strip?: ReactNode;
}

/** A chapter read, hand-edited and approved beside the chat, the thread keeping the rest of the row. */
export function ChapterPanel({ novelId, chapter, comments, request, onClose, strip }: ChapterPanelProps): React.JSX.Element {
  const draftQuery = useDraftQuery(novelId, chapter);
  const { activity } = useGenerationActivity(novelId);
  const generation = chapterGeneration(activity, chapter);
  const draft = draftQuery.data;
  const missing = draftQuery.error?.status === 404;
  const heading = `Chapter ${chapter}`;

  const placeholder = (body: ReactNode): React.JSX.Element => (
    <>
      <PanelHead title={heading} onClose={onClose} />
      {strip}
      {body}
    </>
  );

  return (
    <PanelFrame label={heading} focusOnOpen={request !== undefined} onClose={onClose}>
      {draft ? (
        <DraftView novelId={novelId} draft={draft} deleted={missing} generation={generation} comments={comments} request={request} onClose={onClose} strip={strip} />
      ) : generation ? (
        placeholder(<WritingState generation={generation} />)
      ) : missing ? (
        placeholder(<p className={styles.state}>Chapter {chapter} has no draft yet.</p>)
      ) : draftQuery.error ? (
        placeholder(<PaneError error={draftQuery.error} />)
      ) : (
        placeholder(<PaneLoader />)
      )}
    </PanelFrame>
  );
}

interface PanelFrameProps {
  label: string;
  focusOnOpen: boolean;
  onClose: () => void;
  children: ReactNode;
}

function PanelFrame({ label, focusOnOpen, onClose, children }: PanelFrameProps): React.JSX.Element {
  const ref = useRef<HTMLElement>(null);
  const panelId = useId();
  const [width, setWidth] = useState(readStoredWidth);
  const [frameWidth, setFrameWidth] = useState<number>();
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; width: number } | undefined>(undefined);
  const frame = frameWidth ?? width + CHAT_BESIDE_PANEL_MIN;
  const bounds = panelWidthBounds(frame);
  const shown = clampPanelWidth(width, frame);

  useLayoutEffect(() => {
    const row = ref.current?.parentElement;
    if (!row) return;
    setFrameWidth(row.clientWidth);
    const observer = new ResizeObserver(() => setFrameWidth(row.clientWidth));
    observer.observe(row);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!dragging) storeWidth(width);
  }, [dragging, width]);

  // An editor inside that opened at the same time already holds focus, and keeps it.
  useEffect(() => {
    const panel = ref.current;
    if (focusOnOpen && panel && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
  }, [focusOnOpen]);

  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    closeRef.current = onClose;
  });
  // Radix layers (dialogs, menus, tooltips) mark the Escape they used as handled; a field keeps Escape for its own text.
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || event.defaultPrevented || isEditable(event.target)) return;
      if (document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return;
      closeRef.current();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, []);

  const startDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, width: shown };
    setDragging(true);
  };

  const moveDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    const start = drag.current;
    if (start) setWidth(clampPanelWidth(start.width + start.x - event.clientX, frame));
  };

  const endDrag = (): void => {
    drag.current = undefined;
    setDragging(false);
  };

  const resizeByKey = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const next = panelWidthForKey(event.key, shown, bounds);
    if (next === undefined) return;
    event.preventDefault();
    setWidth(next);
  };

  return (
    <aside
      ref={ref}
      id={panelId}
      tabIndex={-1}
      data-chapter-panel
      className={styles.panel}
      aria-label={label}
      style={{ '--chapter-panel-width': `${shown}px` } as React.CSSProperties}
    >
      <div
        role="separator"
        tabIndex={0}
        aria-orientation="vertical"
        aria-label="Resize the chapter panel"
        aria-controls={panelId}
        aria-valuenow={shown}
        aria-valuemin={bounds.min}
        aria-valuemax={bounds.max}
        className={styles.separator}
        data-dragging={dragging || undefined}
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
        onKeyDown={resizeByKey}
      />
      <div className={styles.backBar}>
        <Button variant="ghost" size="sm" prefix={<ChevronLeftIcon size={14} />} onClick={onClose}>
          Back to chat
        </Button>
      </div>
      {children}
    </aside>
  );
}

interface PanelHeadProps {
  title: string;
  chips?: ReactNode;
  actions?: ReactNode;
  onClose: () => void;
}

function PanelHead({ title, chips, actions, onClose }: PanelHeadProps): React.JSX.Element {
  return (
    <div className={styles.head}>
      <h2 className={styles.title} title={title}>
        {title}
      </h2>
      {chips}
      <div className={styles.headActions}>
        {actions}
        <Tooltip content="Close (Esc)">
          <IconButton variant="ghost" size="sm" aria-label="Close the chapter" icon={<CloseIcon />} onClick={onClose} />
        </Tooltip>
      </div>
    </div>
  );
}

function WritingState({ generation }: { generation?: ChapterGeneration }): React.JSX.Element {
  return (
    <div className={styles.state}>
      {generation && <GenerationStatus generation={generation} />}
      <span>Forge is writing this chapter. It shows here when it’s done.</span>
    </div>
  );
}

interface DraftViewProps {
  novelId: string;
  draft: DraftResponse;
  /** The chapter was deleted after it loaded; the draft on screen is the last one seen. */
  deleted: boolean;
  generation?: ChapterGeneration;
  comments: PanelComments;
  request?: ChapterOpenMode;
  onClose: () => void;
  strip?: ReactNode;
}

function focusIsIn(element: HTMLElement | null): boolean {
  const panel = element?.closest('[data-chapter-panel]');
  return Boolean(panel?.contains(document.activeElement));
}

function spanIn(text: string, wanted: PassageSelection): TextSpan | undefined {
  if (text.slice(wanted.start, wanted.end) === wanted.text) return wanted;
  const found = text.indexOf(wanted.text);
  return found === -1 || text.indexOf(wanted.text, found + 1) !== -1 ? undefined : { start: found, end: found + wanted.text.length };
}

function DraftView({ novelId, draft, deleted, generation, comments, request, onClose, strip }: DraftViewProps): React.JSX.Element {
  const chapter = draft.chapter;
  const writing = isBeingWritten(draft, Boolean(generation));
  const editor = useChapterEditor(novelId, draft, deleted);
  const approval = useDraftApproval(novelId, draft);
  const [editing, setEditing] = useState(() => opensInEditor(draft, writing, request === 'edit'));
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const format = useProseFormatting(editorRef, editor.state.body, editor.setBody);
  const recovery = editorRecovery(editor, setEditing);
  const saveBlocked = isSaveBlocked(editor.state);
  const unsaved = hasUnsavedWork(editor.state);
  const inEditor = editing && !writing && (unsaved || !saveBlocked);
  const edit = chapterPanelEdit(draft, writing);
  const status = chapterPanelStatus(draft, writing, inEditor);
  const approve = panelApproval(draft, { writing, pendingEdits: unsaved ? unsettledMessage(editor.state.status) : undefined, refusal: approval.refusal });

  const gate = commentGate(draft, writing);
  const proposed = useMemo(() => proposedPassages(comments.proposals, draft), [comments.proposals, draft]);
  const chapterChips = useMemo(() => comments.chips.filter(chip => chip.context.chapter === chapter), [comments.chips, chapter]);
  const body = draft.body ?? '';
  const commented = useMemo(() => chapterChips.flatMap(chip => locateChip(body, draft.id, chip.context) ?? []), [chapterChips, body, draft.id]);
  const wanted = comments.reveal;
  const revealed = wanted && chapterChips.find(chip => chip.id === wanted.chipId);
  const revealSpan = revealed && locateChip(body, draft.id, revealed.context);
  const readerReveal: ReaderReveal | undefined = wanted && revealSpan && !inEditor ? { span: revealSpan, nonce: wanted.nonce } : undefined;
  const editAt = useRef<PassageSelection | undefined>(undefined);

  useSaveShortcut(inEditor, editor.save);

  // The panel opening on the author's click hands the editor focus; later — writing ending, the tab switching back — only focus already in the panel
  // follows it there, so a reload, or the author typing in the composer, keeps their place.
  const opened = useRef(false);
  useEffect(() => {
    const first = !opened.current;
    opened.current = true;
    const area = editorRef.current;
    if (!inEditor || tab !== 'write' || !area) return;
    const wanted = editAt.current;
    editAt.current = undefined;
    if (!wanted && !(first ? request !== undefined : focusIsIn(area))) return;
    area.focus();
    const span = wanted && spanIn(area.value, wanted);
    if (span) area.setSelectionRange(span.start, span.end);
  }, [inEditor, tab, request]);

  const editPassage = (selection: PassageSelection): void => {
    editAt.current = selection;
    setTab('write');
    setEditing(true);
  };

  // The reader flashes a passage it can show; one gone from the chapter is marked on its chip, and in the editor the passage is selected instead.
  const answeredReveal = useRef<number | undefined>(undefined);
  useEffect(() => {
    if (!isUnanswered(wanted, answeredReveal.current) || !revealed) return;
    answeredReveal.current = wanted.nonce;
    comments.onRevealed();
    if (!revealSpan) return comments.onMissing(revealed.id);
    if (!inEditor) return;
    const area = editorRef.current;
    const inArea = area && spanIn(area.value, { ...revealSpan, text: revealed.context.quote });
    if (!area || !inArea) return comments.onMissing(revealed.id);
    area.focus();
    area.setSelectionRange(inArea.start, inArea.end);
  });

  const finishEditing = async (): Promise<void> => {
    if (await editor.save()) setEditing(false);
  };

  const editAction = inEditor ? (
    <Button variant="secondary" size="sm" disabled={saveBlocked} onClick={() => void finishEditing()}>
      Done
    </Button>
  ) : edit.allowed ? (
    <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
      Edit
    </Button>
  ) : (
    <Tooltip content={edit.reason}>
      <Button variant="ghost" size="sm" disabled>
        Edit
      </Button>
    </Tooltip>
  );

  const approveAction = approve.kind !== 'hidden' && (
    <Tooltip content={approve.kind === 'blocked' ? approve.reason : approval.held > 0 ? 'Approve and record its blocking findings as overridden' : 'Approve this draft'}>
      <Button variant="primary" size="sm" disabled={approve.kind === 'blocked'} loading={approval.pending} onClick={() => approval.approve()}>
        Approve
      </Button>
    </Tooltip>
  );

  const head = (
    <PanelHead
      title={`Chapter ${chapter}: ${chapterTitle(inEditor ? editor.state : draft)}`}
      chips={
        <>
          <StatusChip intent={status.intent} dot className={styles.chip}>
            {status.label}
          </StatusChip>
          <StatusChip intent="neutral" className={`${styles.chip} ${styles.revision}`}>
            revision {draft.revision}
          </StatusChip>
        </>
      }
      actions={
        <>
          {editAction}
          {approveAction}
        </>
      }
      onClose={onClose}
    />
  );

  if (deleted && !unsaved) {
    return (
      <>
        <PanelHead title={`Chapter ${chapter}`} onClose={onClose} />
        <p className={styles.state}>Chapter {chapter} was deleted.</p>
      </>
    );
  }

  return (
    <>
      {head}
      {strip}
      {isDirty(editor.state) && (
        <EditorStrip
          state={editor.state}
          chapter={chapter}
          onKeepMine={editor.keepMine}
          onTakeTheirs={recovery.takeTheirs}
          onCopyMine={recovery.copyMine}
          onDiscard={recovery.discardMine}
          onRetry={() => void editor.retry()}
        />
      )}
      {!inEditor && draft.status !== 'final' && draft.staleReason && <WorkspaceStrip tone="warning">{draft.staleReason}</WorkspaceStrip>}
      {inEditor ? (
        <div className={styles.editorBody}>
          <ProseToolbar
            variant="bar"
            tools={tab === 'write' ? PANEL_TOOLS : []}
            onTool={format.apply}
            leading={
              <SegmentedControl size="sm" aria-label="Editor view" value={tab} onValueChange={value => setTab(value as 'write' | 'preview')}>
                <SegmentedControl.Item value="write">Write</SegmentedControl.Item>
                <SegmentedControl.Item value="preview">Preview</SegmentedControl.Item>
              </SegmentedControl>
            }
          >
            <ProseToolbarNote>Saves as you type</ProseToolbarNote>
          </ProseToolbar>
          {tab === 'write' ? (
            <textarea
              ref={editorRef}
              value={editor.state.body}
              onChange={event => editor.setBody(event.target.value)}
              onKeyDown={format.onKeyDown}
              readOnly={editor.state.status === 'locked' || editor.state.status === 'deleted'}
              spellCheck
              aria-label={`Chapter ${chapter} prose (Markdown)`}
              placeholder="Write your chapter in Markdown…"
              className={styles.textarea}
            />
          ) : (
            <div className={`nf-scroll ${styles.scroll}`}>
              <div className={styles.reader}>
                <NumberedProse body={editor.state.body} />
              </div>
            </div>
          )}
          <div className={styles.statusBar}>
            <span aria-live="polite">{saveLabel(editor.state)}</span>
            <span aria-hidden="true">·</span>
            <span>revision {editor.state.base.revision}</span>
            <span aria-hidden="true">·</span>
            <span>{wordCount(editor.state.body).toLocaleString()} words</span>
            {draft.reviewStatus === 'approved' && (
              <>
                <span aria-hidden="true">·</span>
                <span>Saving resets your approval</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <Link to="/novels/$novelId/chapters" params={{ novelId }} search={{ chapter }} className={styles.statusLink}>
              History
            </Link>
          </div>
        </div>
      ) : (
        <div className={`nf-scroll ${styles.scroll}`}>
          {writing && <WritingState generation={generation} />}
          <article className={styles.reader}>
            {draft.judgeNote && draft.status !== 'final' && <p className={styles.note}>{draft.judgeNote}</p>}
            {body.trim() ? (
              <ChapterReader
                draft={draft}
                gate={gate}
                limitReason={comments.limitReason}
                proposed={proposed}
                commented={commented}
                reveal={readerReveal}
                onAdd={comments.onAdd}
                onEdit={editPassage}
              />
            ) : (
              <p className={styles.empty}>{edit.allowed ? 'No prose yet — use Edit to write it.' : 'This chapter has no prose yet.'}</p>
            )}
          </article>
        </div>
      )}
      <UnsavedChangesGuard when={unsaved} description={leaveWarning(editor.state)} onSave={saveBlocked ? undefined : editor.save} leaves={leavesChapter} />
      {approval.dialog}
    </>
  );
}
