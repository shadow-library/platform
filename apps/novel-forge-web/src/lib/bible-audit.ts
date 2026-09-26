import { type ChipIntent } from '@/components/nf/StatusChip';
import {
  type AuditFindingDecision,
  type AuditProposalStatus,
  type BibleAuditFindingResponse,
  type BibleAuditGroup,
  type BibleAuditReportResponse,
  type GenerationJobItem,
  type ListBibleAuditsResponse,
} from '@/lib/apis';

const AUDIT_JOB_KIND = 'audit';

export const AUDIT_GROUPS: readonly BibleAuditGroup[] = ['contradiction', 'add', 'revise', 'remove'];

const GROUP_LABEL: Record<BibleAuditGroup, string> = { contradiction: 'Contradictions', add: 'Add', revise: 'Revise', remove: 'Remove' };

export function auditGroupLabel(group: BibleAuditGroup): string {
  return GROUP_LABEL[group];
}

export interface AuditFindingGroup {
  group: BibleAuditGroup;
  label: string;
  findings: BibleAuditFindingResponse[];
}

export function groupAuditFindings(findings: readonly BibleAuditFindingResponse[]): AuditFindingGroup[] {
  return AUDIT_GROUPS.map(group => ({ group, label: GROUP_LABEL[group], findings: findings.filter(finding => finding.group === group) })).filter(
    entry => entry.findings.length > 0,
  );
}

export function findingDecidable(finding: Pick<BibleAuditFindingResponse, 'opIndexes'>): boolean {
  return finding.opIndexes.length > 0;
}

/** Undecided reads as kept: the report's own `selection` already counts every non-skipped finding in. */
export function findingDecisionValue(finding: Pick<BibleAuditFindingResponse, 'decision'>): AuditFindingDecision {
  return finding.decision?.decision ?? 'kept';
}

const DECISION_LABEL: Record<AuditFindingDecision, string> = { kept: 'Kept', skipped: 'Skipped' };

export function auditDecisionLabel(decision: AuditFindingDecision): string {
  return DECISION_LABEL[decision];
}

/** Only a finding the card actually carries a change for counts toward "open" — a flagged-only finding has nothing to decide. */
export function auditOpenCount(report: Pick<BibleAuditReportResponse, 'findings'>): number {
  return report.findings.filter(finding => findingDecidable(finding) && !finding.decision).length;
}

/** Findings, not ops: one finding can carry several ops, and the count the author reasons about is "how many things did I keep". */
export function auditKeptFindingsCount(report: Pick<BibleAuditReportResponse, 'findings'>): number {
  return report.findings.filter(finding => findingDecidable(finding) && findingDecisionValue(finding) === 'kept').length;
}

/** The card is a pending proposal already; this opens the Review Queue on it rather than applying anything here. */
export function auditStageLabel(keptFindingsCount: number): string {
  return `Review ${keptFindingsCount} kept finding${keptFindingsCount === 1 ? '' : 's'}`;
}

/** Whether one change-set op index is on an audit card's kept selection — undecided (no report loaded yet) reads as kept. */
export function auditOpKept(report: Pick<BibleAuditReportResponse, 'selection'> | undefined, index: number): boolean {
  return !report || report.selection.includes(index);
}

/** Removes one key from a record immutably — shared by the optimistic-decision and draft-reason maps a mutation clears on settle. */
export function clearKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

const PROPOSAL_LABEL: Record<AuditProposalStatus, string> = {
  pending: 'Pending',
  applied: 'Applied',
  discarded: 'Discarded',
  superseded: 'Superseded',
  conflicted: 'Conflicted',
  reverted: 'Reverted',
};

const PROPOSAL_INTENT: Record<AuditProposalStatus, ChipIntent> = {
  pending: 'info',
  applied: 'success',
  discarded: 'neutral',
  superseded: 'neutral',
  conflicted: 'danger',
  reverted: 'neutral',
};

export function auditProposalLabel(status: AuditProposalStatus): string {
  return PROPOSAL_LABEL[status];
}

export function auditProposalIntent(status: AuditProposalStatus): ChipIntent {
  return PROPOSAL_INTENT[status];
}

/** Applied, reverted or conflicted is settled — the server's own `SETTLED_CARD`. Discarded and superseded stay open: keeping a finding restages the card. */
const SETTLED_CARD: ReadonlySet<AuditProposalStatus> = new Set(['applied', 'reverted', 'conflicted']);

export function auditReadOnly(report: Pick<BibleAuditReportResponse, 'proposalId' | 'proposalStatus'>): boolean {
  return Boolean(report.proposalId) && report.proposalStatus != null && SETTLED_CARD.has(report.proposalStatus);
}

/** A card the author can still restage by choosing Keep, even though it currently applies nothing. */
export function auditRestageable(report: Pick<BibleAuditReportResponse, 'proposalId' | 'proposalStatus'>): boolean {
  return report.proposalStatus === 'discarded' || report.proposalStatus === 'superseded';
}

function splitRef(ref: string): [string, string] | undefined {
  const at = ref.indexOf(':');
  return at < 0 ? undefined : [ref.slice(0, at), ref.slice(at + 1)];
}

/**
 * `entity:<key>` and `doc:<section>/<slug>` read as an entity name or a page title once the Story
 * Bible's own entity/doc lists are on hand; `chapter:<n>` reads as "Chapter N". Anything else — a fact
 * or a ref the caller has no lookup for — is shown as the raw address rather than guessed at.
 */
export function humanizeAuditRef(ref: string, names: ReadonlyMap<string, string>, docTitles: ReadonlyMap<string, string>): string {
  const split = splitRef(ref);
  if (!split) return ref;
  const [kind, rest] = split;
  if (kind === 'entity') return names.get(rest) ?? ref;
  if (kind === 'doc') return docTitles.get(rest) ?? ref;
  if (kind === 'chapter') return `Chapter ${rest}`;
  return ref;
}

export function findAuditJob(jobs: readonly GenerationJobItem[] | undefined, jobId: string): GenerationJobItem | undefined {
  return jobs?.find(job => job.id === jobId && job.kind === AUDIT_JOB_KIND);
}

/** An audit already running when this screen mounts (started from chat, or before a navigation away) — the newest such job, if several. */
export function findAdoptableAuditJob(jobs: readonly GenerationJobItem[] | undefined): GenerationJobItem | undefined {
  return jobs
    ?.filter(job => job.kind === AUDIT_JOB_KIND && (job.status === 'pending' || job.status === 'in_progress'))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
}

export function findAuditReport(list: ListBibleAuditsResponse | undefined, runId: string): BibleAuditReportResponse | undefined {
  return list?.items.find(item => item.runId === runId);
}

/** The report behind an audit's proposal card, for the Review Queue's own detail view — the list carries `proposalId`, so no extra endpoint is needed. */
export function findAuditReportByProposal(list: ListBibleAuditsResponse | undefined, proposalId: string): BibleAuditReportResponse | undefined {
  return list?.items.find(item => item.proposalId === proposalId);
}

/** For a job adopted without a known run id: the newest report, once one appears created at or after the job started. */
function findNewestAuditReportSince(list: ListBibleAuditsResponse | undefined, since: string): BibleAuditReportResponse | undefined {
  const newest = list?.items[0];
  return newest && Date.parse(newest.createdAt) >= Date.parse(since) ? newest : undefined;
}

export interface StartedAudit {
  jobId: string;
  /** Known for an audit this screen itself started; null for one adopted from the jobs list, matched by recency instead. */
  runId: string | null;
  /** Required when `runId` is null. */
  since?: string;
}

export interface AuditPollState {
  running: boolean;
  report?: BibleAuditReportResponse;
  failure?: string;
}

/**
 * One tracked audit job's state, read off the project's job list and its audits list — the same shape
 * `reviewJobState` reads the chapter workspace's review jobs from. A job already `done` with no report
 * visible yet still counts as running: the report can land a beat after the job settles, and reading
 * that gap as failure or cancellation would be wrong. Only `failed` and `cancelled` are failures.
 */
export function auditPollState(jobs: readonly GenerationJobItem[] | undefined, audits: ListBibleAuditsResponse | undefined, started: StartedAudit | undefined): AuditPollState {
  if (!started) return { running: false };
  const report = started.runId ? findAuditReport(audits, started.runId) : started.since ? findNewestAuditReportSince(audits, started.since) : undefined;
  if (report) return { running: false, report };
  const job = findAuditJob(jobs, started.jobId);
  if (!job || job.status === 'pending' || job.status === 'in_progress' || job.status === 'done') return { running: true };
  if (job.status === 'failed') return { running: false, failure: job.lastError?.trim() || 'The bible audit stopped before it finished.' };
  return { running: false, failure: 'The bible audit was cancelled.' };
}
