import { type DraftResponse } from '@/lib/apis';

import { isRecord } from './is-record';

export const CHAPTER_PANEL_WIDTH = 640;
export const CHAPTER_PANEL_MIN = 320;
export const CHAT_BESIDE_PANEL_MIN = 420;
export const CHAPTER_PANEL_STEP = 16;
export const CHAPTER_PANEL_WIDTH_KEY = 'nf.chapter-panel-width';
/** Narrower than this the chapter is a full sheet over the chat, not a panel beside it. */
export const CHAPTER_SHEET_QUERY = '(max-width: 1023px)';

type PanelDraft = Pick<DraftResponse, 'status' | 'reviewStatus' | 'body' | 'staleReason'>;

export interface PanelWidthBounds {
  min: number;
  max: number;
}

export interface PanelStatus {
  label: string;
  intent: 'info' | 'success' | 'accent' | 'danger' | 'warning';
}

export type PanelGate = { allowed: true } | { allowed: false; reason: string };

export type PanelApproval = { kind: 'hidden' } | { kind: 'blocked'; reason: string } | { kind: 'ready' };

export type ChapterOpenMode = 'read' | 'edit';

export interface PanelLocation {
  pathname: string;
  search: unknown;
}

/** A hand-typed `?chapter=3` arrives as a number, a navigated one may be a string; anything but a positive whole number opens nothing. */
export function chapterParam(value: unknown): number | undefined {
  const text = typeof value === 'number' || typeof value === 'string' ? String(value) : '';
  if (!/^[0-9]+$/.test(text)) return undefined;
  const chapter = Number(text);
  return chapter > 0 && Number.isSafeInteger(chapter) ? chapter : undefined;
}

export function panelWidthBounds(frameWidth: number): PanelWidthBounds {
  return { min: CHAPTER_PANEL_MIN, max: Math.max(CHAPTER_PANEL_MIN, Math.floor(frameWidth - CHAT_BESIDE_PANEL_MIN)) };
}

export function clampPanelWidth(width: number, frameWidth: number): number {
  const { min, max } = panelWidthBounds(frameWidth);
  if (!Number.isFinite(width)) return Math.min(CHAPTER_PANEL_WIDTH, max);
  return Math.round(Math.min(max, Math.max(min, width)));
}

/** The divider sits on the panel's left edge, so moving it left widens the panel. */
export function panelWidthForKey(key: string, width: number, bounds: PanelWidthBounds): number | undefined {
  const clamp = (next: number): number => Math.min(bounds.max, Math.max(bounds.min, next));
  switch (key) {
    case 'ArrowLeft':
    case 'ArrowUp':
      return clamp(width + CHAPTER_PANEL_STEP);
    case 'ArrowRight':
    case 'ArrowDown':
      return clamp(width - CHAPTER_PANEL_STEP);
    case 'Home':
      return bounds.min;
    case 'End':
      return bounds.max;
    default:
      return undefined;
  }
}

export function storedPanelWidth(raw: string | null | undefined): number {
  const width = Number(raw);
  return raw && Number.isFinite(width) && width >= CHAPTER_PANEL_MIN ? Math.round(width) : CHAPTER_PANEL_WIDTH;
}

/** One copy of the draft on screen: the thread's card shrinks to a pointer while the panel holds its chapter. */
export function draftCardShape(chapter: number, openChapter: number | undefined): 'card' | 'pointer' {
  return chapter === openChapter ? 'pointer' : 'card';
}

/** Whether a navigation takes the panel's chapter off screen; anything else on the chat route, such as a revealed card clearing `?card`, keeps it. */
export function leavesChapter(current: PanelLocation, next: PanelLocation): boolean {
  if (current.pathname !== next.pathname) return true;
  const chapterOf = (search: unknown): number | undefined => (isRecord(search) ? chapterParam(search.chapter) : undefined);
  return chapterOf(current.search) !== chapterOf(next.search);
}

export function isBeingWritten(draft: Pick<DraftResponse, 'reviewStatus'> | undefined, writing: boolean): boolean {
  return writing || draft?.reviewStatus === 'generating';
}

export function chapterPanelStatus(draft: PanelDraft, writing: boolean, editing: boolean): PanelStatus {
  if (isBeingWritten(draft, writing)) return { label: 'being written', intent: 'info' };
  if (draft.status === 'final') return { label: 'final', intent: 'success' };
  if (editing) return { label: 'editing', intent: 'accent' };
  if (draft.reviewStatus === 'contradiction') return { label: 'conflicts with canon', intent: 'danger' };
  if (draft.reviewStatus === 'approved') return { label: 'approved', intent: 'success' };
  if (draft.staleReason) return { label: 'out of date', intent: 'warning' };
  return { label: 'ready for you', intent: 'warning' };
}

export function chapterPanelEdit(draft: PanelDraft, writing: boolean): PanelGate {
  if (draft.status === 'final') return { allowed: false, reason: 'Final chapters are locked — change the text with Amend on the Chapters page.' };
  if (isBeingWritten(draft, writing)) return { allowed: false, reason: 'The chapter is being written — edit it once it’s done.' };
  return { allowed: true };
}

/** A chapter with no prose yet has nothing to read, so it opens in the editor, as on the Chapters page. */
export function opensInEditor(draft: PanelDraft, writing: boolean, requested: boolean): boolean {
  if (!chapterPanelEdit(draft, writing).allowed) return false;
  return requested || !(draft.body ?? '').trim();
}

export interface PanelApprovalInput {
  writing: boolean;
  /** Why the author's own edits are not on the server yet, while they are not: an approval binds to the text the server holds. */
  pendingEdits?: string;
  /** The card's own refusal, so both places answer alike. */
  refusal?: string;
}

/** The panel's Approve answers exactly as the thread's card does, and waits for the author's own edits to be saved first. */
export function panelApproval(draft: PanelDraft, input: PanelApprovalInput): PanelApproval {
  if (draft.status === 'final' || draft.reviewStatus === 'approved') return { kind: 'hidden' };
  if (isBeingWritten(draft, input.writing)) return { kind: 'blocked', reason: 'The chapter is being written — approve it once it’s done.' };
  if (input.pendingEdits) return { kind: 'blocked', reason: input.pendingEdits };
  if (input.refusal) return { kind: 'blocked', reason: input.refusal };
  return { kind: 'ready' };
}
