import { type ChipIntent } from '@/components/nf/StatusChip';
import {
  type ChapterReviewKind,
  type ChapterReviewRecordResponse,
  type GenerationJobItem,
  type ListChapterReviewsResponse,
  type ReviewFindingCategory,
  type ReviewFindingResponse,
  type ReviewFindingSeverity,
  type ReviewRemedyResponse,
} from '@/lib/apis';

export const REVIEW_KINDS: readonly ChapterReviewKind[] = ['judge', 'editorial', 'mechanics', 'readability'];
export const SEVERITY_ORDER: readonly ReviewFindingSeverity[] = ['blocking', 'warning', 'note'];

const MODEL_KINDS: ReadonlySet<ChapterReviewKind> = new Set(['judge', 'editorial']);
const REVIEW_JOB = 'review';

const KIND_LABEL: Record<ChapterReviewKind, string> = {
  judge: 'AI review',
  editorial: 'Editor’s read',
  mechanics: 'Mechanics',
  readability: 'Readability',
};

const KIND_NOUN: Record<ChapterReviewKind, string> = {
  judge: 'AI review',
  editorial: 'editor’s read',
  mechanics: 'mechanics check',
  readability: 'readability check',
};

const KIND_DESCRIPTION: Record<ChapterReviewKind, string> = {
  judge: 'Reads the chapter against the Story Bible, the plan, the ending it should reach and the secrets kept from the reader.',
  editorial: 'An editor’s read against the plan, the canon and your style.',
  mechanics: 'Length against the target, repeated paragraphs, reused phrases, stock phrases and dialogue tags. Measured at once, no model call.',
  readability: 'Sentence and paragraph length, reading grade and ornate phrasing. Measured at once, no model call.',
};

const SEVERITY_LABEL: Record<ReviewFindingSeverity, string> = { blocking: 'Blocking', warning: 'Warning', note: 'Note' };
const SEVERITY_GROUP_LABEL: Record<ReviewFindingSeverity, string> = { blocking: 'Blocking', warning: 'Warnings', note: 'Notes' };
const SEVERITY_INTENT: Record<ReviewFindingSeverity, ChipIntent> = { blocking: 'danger', warning: 'warning', note: 'neutral' };

const CATEGORY_LABEL: Record<ReviewFindingCategory, string> = {
  continuity: 'Continuity',
  brief: 'The plan',
  ending: 'The ending',
  knowledge: 'Secrets',
  readability: 'Readability',
  mechanics: 'Mechanics',
  editorial: 'Editorial',
};

export type ReviewJobPhase = 'queued' | 'running';

export interface ReviewJobState {
  active: Partial<Record<ChapterReviewKind, ReviewJobPhase>>;
  failed: Partial<Record<ChapterReviewKind, string>>;
  activeIds: string[];
}

export type FindingFormAction = 'dismissed' | 'overridden';

export interface OpenFindingForm {
  kind: ChapterReviewKind;
  findingId: string;
  action: FindingFormAction;
}

export interface SettledNotice {
  intent: 'success' | 'danger' | 'warning';
  message: string;
}

export interface StatusView {
  label: string;
  intent: ChipIntent;
}

export type FindingState = 'open' | 'fixing' | 'settled';

export interface FindingGroup {
  severity: ReviewFindingSeverity;
  label: string;
  findings: ReviewFindingResponse[];
}

export function kindLabel(kind: ChapterReviewKind): string {
  return KIND_LABEL[kind];
}

/** The kind as it reads mid-sentence ("run the mechanics check"). */
export function kindNoun(kind: ChapterReviewKind): string {
  return KIND_NOUN[kind];
}

export function kindDescription(kind: ChapterReviewKind): string {
  return KIND_DESCRIPTION[kind];
}

export function isModelKind(kind: ChapterReviewKind): boolean {
  return MODEL_KINDS.has(kind);
}

export function severityLabel(severity: ReviewFindingSeverity): string {
  return SEVERITY_LABEL[severity];
}

export function severityIntent(severity: ReviewFindingSeverity): ChipIntent {
  return SEVERITY_INTENT[severity];
}

export function categoryLabel(category: ReviewFindingCategory): string {
  return CATEGORY_LABEL[category];
}

export function latestOf(list: ListChapterReviewsResponse | undefined, kind: ChapterReviewKind): ChapterReviewRecordResponse | undefined {
  return list?.latest.find(review => review.kind === kind);
}

/** Finalized prose imported without a draft has no revision to name. */
export function versionLabel(revision: number | null | undefined): string {
  return revision == null ? 'the final text' : `version ${revision}`;
}

export function staleNotice(review: Pick<ChapterReviewRecordResponse, 'stale' | 'draftRevision'>, currentRevision: number | null | undefined): string | undefined {
  if (!review.stale) return undefined;
  const reviewed = versionLabel(review.draftRevision);
  const now = currentRevision == null || currentRevision === review.draftRevision ? 'The text has changed since.' : `This is version ${currentRevision}.`;
  return `This review is for ${reviewed}. ${now} Its findings describe the older text.`;
}

/** The disposition the author reads: what is still open decides it, so answering every finding reads the same as a clean review. */
export function dispositionView(review: Pick<ChapterReviewRecordResponse, 'disposition' | 'openFindings' | 'openBlocking'>): StatusView {
  if (review.disposition === 'failed') return { label: 'Not assessed', intent: 'neutral' };
  if (review.openBlocking > 0) return { label: 'Revision suggested', intent: 'danger' };
  if (review.openFindings > 0) return { label: 'Looks good · notes', intent: 'warning' };
  return { label: 'No issue detected', intent: 'success' };
}

export function kindStatus(review: ChapterReviewRecordResponse | undefined, job: ReviewJobPhase | undefined): StatusView {
  if (job === 'running') return { label: 'Reviewing…', intent: 'info' };
  if (job === 'queued') return { label: 'Queued', intent: 'info' };
  if (!review) return { label: 'Not run', intent: 'neutral' };
  if (review.disposition === 'failed') return { label: 'Not assessed', intent: 'neutral' };
  if (review.stale) return { label: 'Out of date', intent: 'warning' };
  if (review.openBlocking > 0) return { label: `${review.openBlocking} blocking`, intent: 'danger' };
  if (review.openFindings > 0) return { label: `${review.openFindings} open`, intent: 'warning' };
  return { label: 'No issue', intent: 'success' };
}

export function kindSubline(review: ChapterReviewRecordResponse | undefined, currentRevision: number | null | undefined): string {
  if (!review) return 'Not run yet';
  const reviewed = `Reviewed ${versionLabel(review.draftRevision)}`;
  return review.stale && currentRevision != null && currentRevision !== review.draftRevision ? `${reviewed} · this is version ${currentRevision}` : reviewed;
}

export function groupFindings(findings: readonly ReviewFindingResponse[]): FindingGroup[] {
  return SEVERITY_ORDER.map(severity => ({ severity, label: SEVERITY_GROUP_LABEL[severity], findings: findings.filter(finding => finding.severity === severity) })).filter(
    group => group.findings.length > 0,
  );
}

/** "I'll fix it myself" leaves a finding open — it still counts, and a blocking one still holds the next chapter, until a new review finds it gone. */
export function findingState(finding: Pick<ReviewFindingResponse, 'remedy'>): FindingState {
  if (!finding.remedy) return 'open';
  return finding.remedy.action === 'fixing_myself' ? 'fixing' : 'settled';
}

export function remedyNote(remedy: ReviewRemedyResponse, severity: ReviewFindingSeverity): string {
  const reason = remedy.reason?.trim();
  if (remedy.action === 'fixing_myself') {
    return severity === 'blocking'
      ? 'You’ll fix it yourself — it still holds the next chapter until a new review finds it fixed'
      : 'You’ll fix it yourself — rechecked on the next review';
  }
  if (remedy.action === 'overridden') return `Overridden${reason ? `: ${reason}` : ''} — recorded as intended for this text`;
  return `Dismissed${reason ? `: ${reason}` : ''} — won’t be raised again for this text`;
}

function reviewJobKind(job: Pick<GenerationJobItem, 'kind' | 'target'>, chapter: number): ChapterReviewKind | undefined {
  if (job.kind !== REVIEW_JOB) return undefined;
  const prefix = `chapter-${chapter}-`;
  if (!job.target.startsWith(prefix)) return undefined;
  const kind = job.target.slice(prefix.length) as ChapterReviewKind;
  return REVIEW_KINDS.includes(kind) ? kind : undefined;
}

/**
 * The review jobs of one chapter, read from the project's job list (newest first), so a review started from the chat or before a reload
 * still shows as running. A kind's newest job that failed after its newest review is said so rather than left to look like nothing happened;
 * until the reviews have loaded there is nothing to compare it with, so no failure is claimed.
 */
export function reviewJobState(jobs: readonly GenerationJobItem[] | undefined, chapter: number, list: ListChapterReviewsResponse | undefined): ReviewJobState {
  const state: ReviewJobState = { active: {}, failed: {}, activeIds: [] };
  const seen = new Set<ChapterReviewKind>();
  for (const job of jobs ?? []) {
    const kind = reviewJobKind(job, chapter);
    if (!kind || seen.has(kind)) continue;
    seen.add(kind);
    if (job.status === 'pending' || job.status === 'in_progress') {
      state.active[kind] = job.status === 'pending' ? 'queued' : 'running';
      state.activeIds.push(job.id);
      continue;
    }
    if (!list) continue;
    const latest = latestOf(list, kind);
    if (job.status === 'failed' && (!latest || Date.parse(latest.createdAt) < Date.parse(job.updatedAt)))
      state.failed[kind] = job.lastError?.trim() || 'The review stopped before it finished.';
  }
  return state;
}

/** The blocking findings holding this chapter: the latest judge review of the text as it stands, as the server's gate reads it. */
export function blockingHold(list: ListChapterReviewsResponse | undefined): number {
  const judge = latestOf(list, 'judge');
  return judge && !judge.stale ? judge.openBlocking : 0;
}

export function reviewSettledNotice(job: Pick<GenerationJobItem, 'kind' | 'target' | 'status' | 'lastError'>, chapter: number): SettledNotice | undefined {
  const kind = reviewJobKind(job, chapter);
  if (!kind) return undefined;
  const label = `The ${kindNoun(kind)} of chapter ${chapter}`;
  if (job.status === 'done') return { intent: 'success', message: `${label} is ready — see Checks` };
  if (job.status === 'cancelled') return { intent: 'warning', message: `${label} was cancelled` };
  if (job.status === 'failed') return { intent: 'danger', message: `${label} failed${job.lastError?.trim() ? `: ${job.lastError.trim()}` : ''}` };
  return undefined;
}

/** Only open blocking findings and warnings go to the reviser: a dismissed, overridden or informational one is not something to "fix". */
export function openFindingsNote(review: Pick<ChapterReviewRecordResponse, 'findings'>): string {
  return review.findings
    .filter(finding => findingState(finding) !== 'settled' && finding.severity !== 'note')
    .map(finding => `[${finding.severity === 'blocking' ? 'hard' : 'soft'}] ${finding.text}`)
    .join('\n');
}

/** The judge note the reviser acts on: the current judge review's open findings, or the draft's own note when no current review explains the hold. */
export function repairSource(list: ListChapterReviewsResponse | undefined, judgeNote: string | null | undefined): string | null | undefined {
  const judge = latestOf(list, 'judge');
  return judge && !judge.stale ? openFindingsNote(judge) : judgeNote;
}

function blockingFindings(count: number): string {
  return count === 1 ? 'a blocking finding' : `${count} blocking findings`;
}

export function holdMessage(chapter: number, blocking: number): string {
  if (blocking === 0) return `Chapter ${chapter} has a conflict the judge flagged — chapter ${chapter + 1} waits until it’s resolved.`;
  return `Chapter ${chapter} has ${blockingFindings(blocking)} — chapter ${chapter + 1} waits until you answer ${blocking === 1 ? 'it' : 'them'}.`;
}

export function holdDetail(blocking: number, judgeNote: string | null | undefined, canApprove: boolean): string {
  if (blocking === 0) {
    const note = judgeNote?.trim();
    return `${note ? `${note} ` : ''}Run the AI review to see it as findings you can answer, or repair or regenerate the chapter.`;
  }
  const them = blocking === 1 ? 'it' : 'them';
  return `Fix the text and run the AI review again, dismiss ${them} with a reason, or override ${them}.${canApprove ? ` Approving this version records ${them} as overridden.` : ''}`;
}

/** Why Approve is withheld; a contradiction no current review explains has nothing for an approval to override. */
export function approvalRefusal(reviewStatus: string, blocking: number): string | undefined {
  if (reviewStatus !== 'contradiction' || blocking > 0) return undefined;
  return 'Run the AI review first — it turns the judge’s conflict into findings you can fix, dismiss or override.';
}

export function overrideWarning(blocking: number): string {
  const findings = blocking === 1 ? '1 blocking finding' : `${blocking} blocking findings`;
  return `Approving records ${findings} as overridden — including any you marked “I’ll fix it myself”.`;
}

export function approvalMessage(chapter: number, overriddenFindings: number | undefined, asWritten = false): string {
  const approved = `Chapter ${chapter} approved${asWritten ? ' as written' : ''}`;
  if (!overriddenFindings) return approved;
  return `${approved} — ${overriddenFindings === 1 ? '1 blocking finding was' : `${overriddenFindings} blocking findings were`} recorded as overridden`;
}

/** The reason form as it is actually on screen: open drawer, the selected kind, and a finding of its current review that can still be answered. */
export function visibleForm(form: OpenFindingForm | undefined, list: ListChapterReviewsResponse | undefined, kind: ChapterReviewKind, open: boolean): OpenFindingForm | undefined {
  if (!form || !open || form.kind !== kind) return undefined;
  const review = latestOf(list, kind);
  const finding = review && !review.stale ? review.findings.find(item => item.id === form.findingId) : undefined;
  return finding && findingState(finding) === 'open' ? form : undefined;
}
