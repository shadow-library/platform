import { type ChipIntent } from '@/components/nf/StatusChip';
import {
  type ApiError,
  type DraftSummaryItem,
  type FinalizeReadinessResponse,
  type FinalizeReviewCategory,
  type FinalizeReviewDecision,
  type FinalizeReviewItemResponse,
  type FinalizeReviewResponse,
} from '@/lib/apis';

export type FinalizeReviewPhase =
  | { kind: 'loading' }
  | { kind: 'missing' }
  | { kind: 'error'; message: string }
  | { kind: 'preparing' }
  | { kind: 'failed'; error: string | null }
  | { kind: 'invalidated' }
  | { kind: 'answering'; open: number }
  | { kind: 'answered'; blockers: string[] }
  | { kind: 'finalizable' }
  | { kind: 'applied' }
  | { kind: 'reverted' };

export type DecisionMode = 'keep' | 'edit' | 'skip';

export type FinalizeAction = { kind: 'reviewed'; enabled: boolean } | { kind: 'unreviewed'; enabled: boolean };

export type EditFieldKind = 'text' | 'longText' | 'list' | 'flag' | 'choice';

export interface EditField {
  key: string;
  label: string;
  kind: EditFieldKind;
  required?: boolean;
  options?: readonly string[];
}

export type EditValue = string | boolean;

export type EditPatch = { patch: Record<string, unknown> } | { problem: string };

export interface EvidenceLine {
  label: string | null;
  text: string;
}

const NO_REVIEW_CODE = 'FRV_001';
const OPEN_ITEMS_CODE = 'FRV_005';
const WITHHELD_PREFIX = '[excerpt withheld';

/** Routine-capable categories, in the order the review lists them; knowledge is always asked one by one, so it never auto-keeps. */
export const AUTO_KEEP_CATEGORIES: readonly FinalizeReviewCategory[] = ['appearance', 'character_state', 'relationship', 'promise', 'entity', 'milestone'];

const CATEGORY_LABELS: Record<FinalizeReviewCategory, string> = {
  entity: 'New in the Story Bible',
  appearance: 'Appeared',
  character_state: 'Where they stand',
  relationship: 'Relationship',
  promise: 'Promise',
  knowledge: 'Knows',
  milestone: 'Milestone',
};

const AUTO_KEEP_LABELS: Record<FinalizeReviewCategory, string> = {
  entity: 'New world details',
  appearance: 'Appearances',
  character_state: 'Where people are',
  relationship: 'Relationships',
  promise: 'Promises that moved',
  knowledge: 'What characters learn',
  milestone: 'Planned milestones',
};

/** The fields `editedChange` on the server accepts per proposed record; the keys naming the record are never among them. */
const EDIT_FIELDS: Record<string, readonly EditField[]> = {
  entity: [
    { key: 'name', label: 'Name', kind: 'text', required: true },
    { key: 'notes', label: 'Notes', kind: 'longText' },
  ],
  state: [
    { key: 'location', label: 'Where they are', kind: 'text' },
    { key: 'conditions', label: 'Conditions (comma separated)', kind: 'list' },
    { key: 'immediateGoal', label: 'What they want next', kind: 'text' },
    { key: 'statusNote', label: 'How they are', kind: 'longText' },
  ],
  relationship: [{ key: 'note', label: 'Note', kind: 'longText' }],
  thread: [
    { key: 'status', label: 'Status', kind: 'choice', options: ['open', 'closed'] },
    { key: 'summary', label: 'The promise', kind: 'longText' },
    { key: 'intentionallyOpen', label: 'Left open on purpose', kind: 'flag' },
  ],
  mystery: [
    { key: 'status', label: 'Status', kind: 'choice', options: ['open', 'resolved'] },
    { key: 'question', label: 'The question', kind: 'longText' },
    { key: 'intentionallyOpen', label: 'Left open on purpose', kind: 'flag' },
  ],
  knowledge: [{ key: 'how', label: 'How they learn it', kind: 'longText', required: true }],
  milestone: [{ key: 'reached', label: 'Reached in this chapter', kind: 'flag' }],
};

/**
 * Where the review stands, in the order that matters: a finished review first, then one the prose moved past, then the read itself, then the
 * answers; `readiness` only splits "everything answered" into finalizable or still blocked by something else the server checks.
 */
export function finalizeReviewPhase(
  review: FinalizeReviewResponse | undefined,
  error: ApiError | null | undefined,
  readiness: FinalizeReadinessResponse | undefined,
): FinalizeReviewPhase {
  if (!review) {
    if (error?.code === NO_REVIEW_CODE) return { kind: 'missing' };
    if (error) return { kind: 'error', message: error.message };
    return { kind: 'loading' };
  }
  if (review.status === 'applied') return { kind: 'applied' };
  if (review.status === 'reverted') return { kind: 'reverted' };
  if (!review.current) return { kind: 'invalidated' };
  if (review.status === 'preparing') return { kind: 'preparing' };
  if (review.status === 'failed') return { kind: 'failed', error: review.error ?? null };
  const open = review.open.consequential + review.open.routine;
  if (open > 0) return { kind: 'answering', open };
  if (readiness?.ready) return { kind: 'finalizable' };
  return { kind: 'answered', blockers: finalizeBlockers(readiness) };
}

/**
 * The footer's Finalize: through the review once it is read, or — for a chapter approved before reviews existed, which the server finalizes
 * unreviewed — the plain finalize, still gated on readiness. Nothing while the review is being read, failed, stale or already settled.
 */
export function finalizeAction(phase: FinalizeReviewPhase, readiness: FinalizeReadinessResponse | undefined): FinalizeAction | null {
  if (phase.kind === 'missing') return { kind: 'unreviewed', enabled: readiness?.ready === true };
  if (phase.kind === 'answering' || phase.kind === 'answered') return { kind: 'reviewed', enabled: false };
  if (phase.kind === 'finalizable') return { kind: 'reviewed', enabled: true };
  return null;
}

/** The server's own refusal reasons, minus the open-items count the review already shows item by item. */
export function finalizeBlockers(readiness: FinalizeReadinessResponse | undefined): string[] {
  if (!readiness || readiness.ready) return [];
  return readiness.blockers.filter(blocker => blocker.code !== OPEN_ITEMS_CODE).map(blocker => blocker.message);
}

export function categoryLabel(category: FinalizeReviewCategory): string {
  return CATEGORY_LABELS[category];
}

export function autoKeepLabel(category: FinalizeReviewCategory): string {
  return AUTO_KEEP_LABELS[category];
}

export function itemTag(item: Pick<FinalizeReviewItemResponse, 'flag' | 'basis' | 'category'>): { label: string; intent: ChipIntent } {
  if (item.flag === 'unplanned_disclosure') return { label: 'Unplanned disclosure', intent: 'danger' };
  if (item.flag === 'missed_milestone') return { label: 'Missed milestone', intent: 'warning' };
  if (item.flag === 'unclaimed_milestone') return { label: 'Unplanned milestone', intent: 'warning' };
  if (item.basis === 'inferred') return { label: 'Interpretation', intent: 'warning' };
  return { label: categoryLabel(item.category), intent: 'accent' };
}

/** What a flag puts at stake, in the author's terms; nothing for an unflagged item. */
export function itemStakes(item: Pick<FinalizeReviewItemResponse, 'flag' | 'dependents'>): string | null {
  const dependents = item.dependents ?? [];
  const list = dependents.join(', ');
  if (item.flag === 'missed_milestone') {
    return dependents.length > 0 ? `Keeping it locked leaves ${list} without the milestone it needs.` : 'Keeping it locked means later chapters can’t count on it.';
  }
  if (item.flag === 'unplanned_disclosure') return dependents.length > 0 ? `Still waiting on: ${list}.` : 'A character learns something the plan keeps locked here.';
  if (item.flag === 'unclaimed_milestone') return 'The plan doesn’t claim this milestone for this chapter.';
  return null;
}

/** The line an update was read from; an isolated chapter's excerpt comes back as the server's placeholder, shown as-is and unquoted. */
export function evidenceLine(evidence: string | null | undefined): EvidenceLine | null {
  if (!evidence) return null;
  if (evidence.startsWith(WITHHELD_PREFIX)) return { label: null, text: evidence };
  return { label: 'From the chapter:', text: `“${evidence}”` };
}

export function decisionMode(decision: FinalizeReviewDecision | null | undefined): DecisionMode | '' {
  if (decision === 'kept') return 'keep';
  if (decision === 'edited') return 'edit';
  if (decision === 'skipped') return 'skip';
  return '';
}

export function decisionLabel(item: Pick<FinalizeReviewItemResponse, 'decision' | 'autoKept'>): string {
  if (item.autoKept) return 'Kept automatically';
  if (item.decision === 'kept') return 'Kept';
  if (item.decision === 'edited') return 'Kept as edited';
  if (item.decision === 'skipped') return 'Skipped';
  return 'Needs your call';
}

function recordOf(proposed: Record<string, unknown>): { name: string; fields: Record<string, unknown> } {
  switch (proposed.category) {
    case 'entity':
      return { name: 'entity', fields: asRecord(proposed.entity) };
    case 'character_state':
      return { name: 'state', fields: asRecord(proposed.state) };
    case 'relationship':
      return { name: 'relationship', fields: asRecord(proposed.relationship) };
    case 'promise':
      return 'thread' in proposed ? { name: 'thread', fields: asRecord(proposed.thread) } : { name: 'mystery', fields: asRecord(proposed.mystery) };
    case 'knowledge':
    case 'milestone':
      return { name: proposed.category, fields: proposed };
    default:
      return { name: 'appearance', fields: {} };
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

export function editFields(proposed: Record<string, unknown>): readonly EditField[] {
  return EDIT_FIELDS[recordOf(proposed).name] ?? [];
}

export function editable(item: Pick<FinalizeReviewItemResponse, 'proposed'>): boolean {
  return editFields(item.proposed).length > 0;
}

function formValue(field: EditField, value: unknown): EditValue {
  if (field.kind === 'flag') return value === true;
  if (field.kind === 'list') return Array.isArray(value) ? value.filter(entry => typeof entry === 'string').join(', ') : '';
  return typeof value === 'string' ? value : '';
}

/** The form starts from what finalize would apply: the author's earlier edit when there is one, else the proposal. */
export function editValues(item: Pick<FinalizeReviewItemResponse, 'proposed' | 'edited' | 'decision'>): Record<string, EditValue> {
  const source = item.decision === 'edited' && item.edited ? item.edited : item.proposed;
  const { fields } = recordOf(source);
  return Object.fromEntries(editFields(item.proposed).map(field => [field.key, formValue(field, fields[field.key])]));
}

function patchValue(field: EditField, value: EditValue): unknown {
  if (field.kind === 'flag') return value === true;
  const text = String(value).trim();
  if (field.kind === 'list') {
    const entries = text
      .split(',')
      .map(entry => entry.trim())
      .filter(Boolean);
    return entries.length > 0 ? entries : null;
  }
  if (field.kind === 'choice') return text;
  return text === '' ? null : text;
}

/**
 * Every field that differs from the proposal, shaped the way the server checks them: the server lays the patch over `proposed`, not over an
 * earlier edit, so a second edit must carry the first one's changes too. A required field left blank or an edit equal to the proposal is refused.
 */
export function editPatch(item: Pick<FinalizeReviewItemResponse, 'proposed'>, values: Record<string, EditValue>): EditPatch {
  const proposed = editValues({ proposed: item.proposed, edited: null, decision: null });
  const patch: Record<string, unknown> = {};
  for (const field of editFields(item.proposed)) {
    const value = values[field.key] ?? proposed[field.key] ?? '';
    if (field.required && String(value).trim() === '') return { problem: `${field.label} can’t be empty.` };
    if (JSON.stringify(patchValue(field, value)) === JSON.stringify(patchValue(field, proposed[field.key] ?? ''))) continue;
    patch[field.key] = patchValue(field, value);
  }
  if (Object.keys(patch).length === 0) return { problem: 'This is what was proposed — choose Keep to record it as it is.' };
  return { patch };
}

export function keptCount(review: Pick<FinalizeReviewResponse, 'consequential' | 'routine'>): number {
  return [...review.consequential, ...review.routine].filter(item => item.decision === 'kept' || item.decision === 'edited').length;
}

export function finalizeLabel(kept: number): string {
  if (kept === 0) return 'Finalize without updates';
  return `Finalize and keep ${kept} update${kept === 1 ? '' : 's'}`;
}

export function keepAllLabel(review: Pick<FinalizeReviewResponse, 'open' | 'routine'>): string {
  if (review.open.routine > 0) return 'Keep all';
  return review.routine.some(item => item.decision === 'skipped') ? 'All answered' : 'All kept';
}

/** The next update still waiting after `afterId`, wrapping to the first, so focus moves on once one is answered. */
export function nextOpenItemId(items: readonly Pick<FinalizeReviewItemResponse, 'id' | 'decision'>[], afterId: string): string | undefined {
  const start = items.findIndex(item => item.id === afterId);
  const ordered = [...items.slice(start + 1), ...items.slice(0, Math.max(0, start))];
  return ordered.find(item => !item.decision)?.id;
}

export function decisionAnnouncement(decision: FinalizeReviewDecision, claim: string, open: number): string {
  const verb = decision === 'kept' ? 'Kept' : decision === 'edited' ? 'Kept as edited' : 'Skipped';
  const rest = open === 0 ? 'Every update is answered.' : `${open} still need${open === 1 ? 's' : ''} your call.`;
  return `${verb}: ${claim}. ${rest}`;
}

/** The categories shown as auto-keep switches: the ones this review batched, plus any already on so it can be turned off. */
export function autoKeepChoices(review: Pick<FinalizeReviewResponse, 'routine' | 'autoKeep'>): FinalizeReviewCategory[] {
  const shown = new Set<FinalizeReviewCategory>([...review.routine.map(item => item.category), ...review.autoKeep]);
  return AUTO_KEEP_CATEGORIES.filter(category => shown.has(category));
}

export function toggledAutoKeep(current: readonly FinalizeReviewCategory[], category: FinalizeReviewCategory, on: boolean): FinalizeReviewCategory[] {
  const next = new Set(current);
  if (on) next.add(category);
  else next.delete(category);
  return AUTO_KEEP_CATEGORIES.filter(entry => next.has(entry));
}

/** Finalize is written in chapter order, so the highest final chapter is the only one whose updates can still be undone. */
export function latestFinalChapter(items: readonly Pick<DraftSummaryItem, 'chapter' | 'status'>[] | undefined): number | undefined {
  const finals = (items ?? []).filter(item => item.status === 'final').map(item => item.chapter);
  return finals.length > 0 ? Math.max(...finals) : undefined;
}

export function reviewSubtitle(review: Pick<FinalizeReviewResponse, 'draftRevision' | 'open'>): string {
  const calls = review.open.consequential;
  const read = `Read from revision ${review.draftRevision}, the one you approved.`;
  const ask = calls === 0 ? 'Nothing needs your call.' : `${calls === 1 ? 'One thing needs' : `${calls} things need`} your call.`;
  return `${read} ${ask} Skipping only means “don’t record this” — it doesn’t unsay what the reader saw. To change what happened, edit the chapter before finalizing.`;
}
