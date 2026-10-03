import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { proseParagraphs } from '@shadow-library/sdk';
import { Button, Kbd, Popover, Textarea, toast, Tooltip } from '@shadow-library/ui';

import { sanitizeHtml } from '@/components/nf/sanitize-html';
import { type DraftResponse } from '@/lib/apis';
import { numberedHtml, type ProposedPassage, readerSelection, type ReaderSource, readerSource, renderedSpans, type TextSpan } from '@/lib/chapter-reader';
import {
  type CommentGate,
  commentRefusal,
  MAX_COMMENT_CHARS,
  MAX_COMMENT_QUOTE_CHARS,
  type PassageChip,
  passageChip,
  QUICK_COMMENTS,
  REWRITE_COMMENT,
  selectionRef,
  withQuickComment,
} from '@/lib/passage-comments';
import { passageHash, type PassageSelection } from '@/lib/passage-selection';

import styles from './ChapterPanel.module.css';
import chatStyles from './Chat.module.css';

/** What adding a comment goes on to do: nothing more, send the message now, or put the author in the composer to say how to rewrite it. */
export type CommentFollowUp = 'stay' | 'send' | 'rewrite';

export interface ReaderReveal {
  span: TextSpan;
  nonce: number;
}

interface Place {
  top: number;
  left: number;
  below: boolean;
}

type Pending = { kind: 'selected'; selection: PassageSelection; draft: DraftResponse; range: Range; place: Place } | { kind: 'problem'; message: string; place: Place };

interface Measurable {
  getBoundingClientRect: () => DOMRect;
}

export interface ChapterReaderProps {
  draft: DraftResponse;
  gate: CommentGate;
  /** Why no more comments fit on the message, while none do. */
  limitReason?: string;
  proposed: readonly ProposedPassage[];
  /** The passages commented on and waiting in the composer, underlined in the prose. */
  commented: readonly TextSpan[];
  reveal?: ReaderReveal;
  onAdd: (chip: PassageChip, then: CommentFollowUp) => boolean;
  onEdit: (selection: PassageSelection) => void;
}

const TOOLBAR_CLEARANCE = 48;
const TOOLBAR_GAP = 8;
const TOOLBAR_WIDTH = 360;
const FLASH_MS = 1600;
const COMMENTED = 'nf-passage-commented';
const SELECTED = 'nf-passage-selected';
const FLASH = 'nf-passage-flash';

function textOffset(root: Node, node: Node, offset: number): number {
  const range = document.createRange();
  range.setStart(root, 0);
  range.setEnd(node, offset);
  return range.toString().length;
}

/** The selection's part inside the prose, so a drag that runs past the last paragraph still counts. */
function clippedRange(prose: HTMLElement, range: Range): Range | undefined {
  if (!range.intersectsNode(prose)) return undefined;
  const clipped = range.cloneRange();
  if (!prose.contains(clipped.startContainer)) clipped.setStart(prose, 0);
  if (!prose.contains(clipped.endContainer)) clipped.setEnd(prose, prose.childNodes.length);
  return clipped.collapsed ? undefined : clipped;
}

function placeOf(rect: DOMRect, box: DOMRect): Place {
  const top = rect.top - box.top;
  const below = top < TOOLBAR_CLEARANCE;
  const left = Math.min(Math.max(0, rect.left - box.left), Math.max(0, box.width - TOOLBAR_WIDTH));
  return { top: below ? rect.bottom - box.top + TOOLBAR_GAP : top - TOOLBAR_GAP, left, below };
}

function domRange(root: HTMLElement, span: TextSpan | undefined): Range | undefined {
  if (!span) return undefined;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  let seen = 0;
  let started = false;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const length = node.textContent?.length ?? 0;
    if (!started && span.start < seen + length) {
      range.setStart(node, span.start - seen);
      started = true;
    }
    if (started && span.end <= seen + length) {
      range.setEnd(node, span.end - seen);
      return range;
    }
    seen += length;
  }
  return undefined;
}

function numberedProse(view: ReaderSource): string {
  return sanitizeHtml(numberedHtml(view, proseParagraphs(view.body), new Set()));
}

export function NumberedProse({ body }: { body: string }): React.JSX.Element {
  const html = useMemo(() => numberedProse(readerSource(body, [])), [body]);
  return <div className="nf-md" dangerouslySetInnerHTML={{ __html: html }} />;
}

// The CSS Custom Highlight API marks text without touching the DOM the reader's selection mapping reads; where it is missing, nothing is marked.
function highlights(): HighlightRegistry | undefined {
  return typeof Highlight === 'undefined' || typeof CSS === 'undefined' || !('highlights' in CSS) ? undefined : CSS.highlights;
}

export function ChapterReader({ draft, gate, limitReason, proposed, commented, reveal, onAdd, onEdit }: ChapterReaderProps): React.JSX.Element {
  const body = draft.body ?? '';
  const containerRef = useRef<HTMLDivElement>(null);
  const proseRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<Measurable | null>(null);
  const commentId = useId();
  const [pending, setPending] = useState<Pending>();
  const [commenting, setCommenting] = useState(false);
  const [comment, setComment] = useState('');
  const [adding, setAdding] = useState(false);
  const view = useMemo(() => readerSource(body, proposed), [body, proposed]);
  const html = useMemo(() => numberedProse(view), [view]);
  const canComment = !gate.comment && !limitReason;
  const commentingRef = useRef(commenting);
  useLayoutEffect(() => {
    commentingRef.current = commenting;
  });

  // Listened for on the document: a drag that starts in the prose often ends outside it.
  useEffect(() => {
    const readSelection = (): void => {
      if (commentingRef.current) return;
      const container = containerRef.current;
      const prose = proseRef.current;
      const selection = window.getSelection();
      const range = selection && !selection.isCollapsed && selection.rangeCount > 0 && prose ? clippedRange(prose, selection.getRangeAt(0)) : undefined;
      if (!container || !prose || !range) return setPending(undefined);
      const place = placeOf(range.getBoundingClientRect(), container.getBoundingClientRect());
      const domText = prose.textContent ?? '';
      const result = readerSelection(
        view,
        domText,
        textOffset(prose, range.startContainer, range.startOffset),
        textOffset(prose, range.endContainer, range.endOffset),
        MAX_COMMENT_QUOTE_CHARS,
      );
      if (result.kind === 'ok') return setPending({ kind: 'selected', selection: result.selection, draft, range, place });
      const message = commentRefusal(result.kind);
      setPending(message ? { kind: 'problem', message, place } : undefined);
    };
    document.addEventListener('mouseup', readSelection);
    document.addEventListener('keyup', readSelection);
    return () => {
      document.removeEventListener('mouseup', readSelection);
      document.removeEventListener('keyup', readSelection);
    };
  }, [view, draft]);

  const clear = (): void => {
    setCommenting(false);
    setPending(undefined);
    setComment('');
    window.getSelection()?.removeAllRanges();
  };

  const openComment = (): void => {
    if (pending?.kind !== 'selected' || !canComment) return;
    const { range } = pending;
    anchorRef.current = { getBoundingClientRect: () => range.getBoundingClientRect() };
    setComment('');
    setCommenting(true);
  };

  // Captured ahead of the command palette's ⌘K and the panel's Escape, and only while a passage is selected here.
  useEffect(() => {
    if (!pending || commenting) return;
    const onKey = (event: KeyboardEvent): void => {
      const shortcut = event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey);
      if (event.key !== 'Escape' && !(shortcut && pending.kind === 'selected' && canComment)) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') clear();
      else openComment();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  useLayoutEffect(() => {
    const registry = highlights();
    const prose = proseRef.current;
    if (!registry || !prose) return;
    const domText = prose.textContent ?? '';
    const ranges = renderedSpans(view, domText, commented).flatMap(span => domRange(prose, span) ?? []);
    registry.set(COMMENTED, new Highlight(...ranges));
    return () => void registry.delete(COMMENTED);
  }, [html, view, commented]);

  useLayoutEffect(() => {
    const registry = highlights();
    if (!registry || !commenting || pending?.kind !== 'selected') return;
    registry.set(SELECTED, new Highlight(pending.range));
    return () => void registry.delete(SELECTED);
  }, [commenting, pending]);

  const flashTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(flashTimer.current);
      highlights()?.delete(FLASH);
    },
    [],
  );

  const flashed = useRef<number | undefined>(undefined);
  useEffect(() => {
    const prose = proseRef.current;
    if (!reveal || !prose || flashed.current === reveal.nonce) return;
    flashed.current = reveal.nonce;
    const range = domRange(prose, renderedSpans(view, prose.textContent ?? '', [reveal.span])[0]);
    if (!range) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    range.startContainer.parentElement?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
    const registry = highlights();
    if (!registry) return;
    registry.set(FLASH, new Highlight(range));
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => registry.delete(FLASH), FLASH_MS);
  });

  const add = async (then: CommentFollowUp): Promise<void> => {
    if (pending?.kind !== 'selected' || adding) return;
    setAdding(true);
    try {
      const hash = await passageHash(pending.selection.text);
      const chip = passageChip(pending.draft, pending.selection, then === 'rewrite' ? REWRITE_COMMENT : comment, hash);
      if (onAdd(chip, then)) clear();
    } catch {
      toast.danger('Couldn’t read that passage — select it again.');
    } finally {
      setAdding(false);
    }
  };

  const copy = (): void => {
    if (pending?.kind !== 'selected') return;
    if (!navigator.clipboard) return void toast.danger('Couldn’t copy — this browser keeps the clipboard closed here.');
    navigator.clipboard.writeText(pending.selection.text).then(
      () => toast.success('Copied'),
      () => toast.danger('Couldn’t copy — this browser keeps the clipboard closed here.'),
    );
  };

  const edit = (): void => {
    if (pending?.kind !== 'selected') return;
    const { selection } = pending;
    clear();
    onEdit(selection);
  };

  const onCommentKey = (event: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (canComment) void add(event.metaKey || event.ctrlKey ? 'send' : 'stay');
  };

  const keepSelection = (event: React.MouseEvent): void => event.preventDefault();
  const selected = pending?.kind === 'selected' ? pending : undefined;
  const announcement = selected ? (gate.comment ?? 'Comment is ready for the selected passage.') : pending?.kind === 'problem' ? pending.message : '';

  return (
    <div ref={containerRef} tabIndex={-1} className={styles.selection}>
      <div role="status" className="sr-only">
        {announcement}
      </div>
      <div ref={proseRef} className="nf-md" dangerouslySetInnerHTML={{ __html: html }} />
      {selected && !commenting && (
        <div
          role="toolbar"
          aria-label="Selected passage"
          className={styles.toolbar}
          data-below={selected.place.below || undefined}
          style={{ top: selected.place.top, left: selected.place.left }}
          onMouseDown={keepSelection}
        >
          {gate.comment ? (
            <span className={styles.toolbarNote}>{gate.comment}</span>
          ) : (
            <>
              <ToolbarAction reason={limitReason}>
                <Button variant="primary" size="sm" disabled={Boolean(limitReason)} onClick={openComment} aria-keyshortcuts="Meta+K Control+K">
                  Comment <Kbd keys="mod+k" bare aria-hidden className={styles.toolbarKbd} />
                </Button>
              </ToolbarAction>
              {!gate.rewrite && (
                <ToolbarAction reason={limitReason}>
                  <Button variant="ghost" size="sm" className={styles.toolbarButton} disabled={Boolean(limitReason) || adding} onClick={() => void add('rewrite')}>
                    Rewrite with AI
                  </Button>
                </ToolbarAction>
              )}
            </>
          )}
          {!gate.edit && (
            <Button variant="ghost" size="sm" className={styles.toolbarButton} onClick={edit}>
              Edit
            </Button>
          )}
          <Button variant="ghost" size="sm" className={styles.toolbarButton} onClick={copy}>
            Copy
          </Button>
        </div>
      )}
      {pending?.kind === 'problem' && (
        <div className={styles.toolbarProblem} data-below={pending.place.below || undefined} style={{ top: pending.place.top, left: pending.place.left }}>
          {pending.message}
        </div>
      )}
      <Popover open={commenting && Boolean(selected)} onOpenChange={open => !open && clear()}>
        <Popover.Anchor virtualRef={anchorRef} />
        {selected && (
          <Popover.Content
            side="bottom"
            align="start"
            className={styles.comment}
            aria-label="Comment on the passage"
            onCloseAutoFocus={event => {
              event.preventDefault();
              containerRef.current?.focus({ preventScroll: true });
            }}
          >
            <div className={styles.commentPassage}>
              <span className={chatStyles.passageRef}>{selectionRef(selected.draft, selected.selection)}</span>
              <span className={styles.commentQuote}>{selected.selection.text}</span>
            </div>
            <label htmlFor={commentId} className={styles.commentLabel}>
              What should change here?
            </label>
            <Textarea id={commentId} autoFocus value={comment} onValueChange={setComment} onKeyDown={onCommentKey} maxLength={MAX_COMMENT_CHARS} minRows={2} maxRows={6} />
            <div className={styles.quick} role="group" aria-label="Quick comments">
              {QUICK_COMMENTS.map(quick => (
                <Button key={quick} variant="secondary" size="sm" onClick={() => setComment(current => withQuickComment(current, quick))}>
                  {quick}
                </Button>
              ))}
            </div>
            <div className={styles.commentFoot}>
              <span className={styles.commentCaption}>
                <Kbd keys="enter" bare /> adds to the message · <Kbd keys="mod+enter" bare /> sends now
              </span>
              <Button variant="ghost" size="sm" onClick={clear}>
                Cancel
              </Button>
              <ToolbarAction reason={limitReason}>
                <Button variant="primary" size="sm" disabled={Boolean(limitReason)} loading={adding} onClick={() => void add('stay')}>
                  Add to chat
                </Button>
              </ToolbarAction>
            </div>
          </Popover.Content>
        )}
      </Popover>
    </div>
  );
}

function ToolbarAction({ reason, children }: { reason?: string; children: React.ReactElement }): React.JSX.Element {
  return reason ? <Tooltip content={reason}>{children}</Tooltip> : children;
}
