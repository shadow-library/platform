import { type CollectionCount } from './collection-page';
import { relativeTime } from './format';

export type ReviewStatus = 'generating' | 'needs_review' | 'contradiction' | 'approved' | 'final';

export interface ReviewQueueDraft {
  chapter: number;
  title?: string | null;
  reviewStatus: ReviewStatus;
  body?: string | null;
  updatedAt: string;
}

export type ReviewHotkey = 'approve' | 'revise' | 'reject';

export interface ReviewHotkeyEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  editableTarget: boolean;
}

const EDITABLE_TAGS = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

const HOTKEYS: Record<string, ReviewHotkey> = { a: 'approve', r: 'revise', x: 'reject' };

const QUEUE_REASON: Record<ReviewStatus, string> = {
  contradiction: 'The judge flagged a contradiction',
  needs_review: 'Finished drafting — waiting on your read',
  generating: 'Still drafting',
  approved: 'Approved',
  final: 'Final',
};

export function chapterKey(chapter: number): string {
  return String(chapter);
}

export function parseChapterParam(value: unknown): number | undefined {
  const chapter = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(chapter) && chapter >= 1 ? chapter : undefined;
}

export function queueIds(drafts: readonly ReviewQueueDraft[]): string[] {
  return drafts.map(draft => chapterKey(draft.chapter));
}

export function chapterTitle(draft: Pick<ReviewQueueDraft, 'title'>): string {
  return draft.title?.trim() || 'Untitled chapter';
}

export function chapterBadge(chapter: number): string {
  return `CH.${String(chapter).padStart(2, '0')}`;
}

export function queueReason(draft: Pick<ReviewQueueDraft, 'reviewStatus'>): string {
  return QUEUE_REASON[draft.reviewStatus] ?? draft.reviewStatus;
}

export function wordCount(body?: string | null): number {
  return body ? body.trim().split(/\s+/).filter(Boolean).length : 0;
}

export function queueMeta(draft: Pick<ReviewQueueDraft, 'body' | 'updatedAt'>): string {
  const words = `${wordCount(draft.body).toLocaleString()} words`;
  const waited = relativeTime(draft.updatedAt);
  return waited ? `${words} · queued ${waited}` : words;
}

export function backLabel(total: number | undefined): string {
  return total === undefined ? 'Review queue' : `All ${total.toLocaleString()} in the queue`;
}

export function reviewCounts(drafts: readonly Pick<ReviewQueueDraft, 'reviewStatus'>[]): CollectionCount[] {
  let approved = 0;
  let drafting = 0;
  let flagged = 0;
  for (const draft of drafts) {
    if (draft.reviewStatus === 'approved' || draft.reviewStatus === 'final') approved += 1;
    else if (draft.reviewStatus === 'generating') drafting += 1;
    else if (draft.reviewStatus === 'contradiction') flagged += 1;
  }
  return [
    { label: 'approved', value: approved },
    { label: 'drafting', value: drafting },
    { label: 'flagged', value: flagged },
  ];
}

/** Approving removes the chapter from the queue, so the author advances to the next one still waiting; nothing after it means the queue view is the honest landing place. */
export function nextAfterApproval(ids: readonly string[] | undefined, currentId: string): string | undefined {
  if (!ids) return undefined;
  const index = ids.indexOf(currentId);
  return index < 0 ? undefined : ids[index + 1];
}

export function isEditableElement(tagName: string, contentEditable: boolean): boolean {
  return contentEditable || EDITABLE_TAGS.has(tagName.toUpperCase());
}

export function reviewHotkey(event: ReviewHotkeyEvent): ReviewHotkey | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.editableTarget) return null;
  return HOTKEYS[event.key.toLowerCase()] ?? null;
}
