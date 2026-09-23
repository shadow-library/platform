import { relativeTime } from './format';

export type ProposalStatus = 'pending' | 'applied' | 'discarded' | 'superseded' | 'conflicted' | 'reverted';

export type ProposalFilter = 'open' | 'applied' | 'all';

export type ChangeOp = Record<string, unknown>;

export interface Proposal {
  id: string;
  status: ProposalStatus;
  kind: string;
  scopeType: string;
  summary?: string | null;
  changeSet: ChangeOp[];
  revertible: boolean;
  createdAt: string;
  appliedAt?: string | null;
  revertedAt?: string | null;
}

export const PROPOSAL_FILTERS: ProposalFilter[] = ['open', 'applied', 'all'];

export const FILTER_LABEL: Record<ProposalFilter, string> = { open: 'Open', applied: 'Applied', all: 'All' };

export const NEVER_AUTO_NOTE = 'Applies only when you select it deliberately.';

export const CONFLICT_NOTE = 'The canon moved on since this was drafted, so it can no longer apply cleanly. Discard it and ask again for a fresh proposal.';

const GUARDED_OP_TYPES = new Set(['action.finalize']);

/** A proposal still owed a decision. `conflicted` cannot be applied, but it can be discarded, so it is not settled. */
const OPEN_STATUSES = new Set<ProposalStatus>(['pending', 'conflicted']);

export function isGuardedOp(op: ChangeOp): boolean {
  return GUARDED_OP_TYPES.has(String(op.op));
}

export function defaultDeclined(changeSet: readonly ChangeOp[]): Set<number> {
  return new Set(changeSet.reduce<number[]>((acc, op, i) => (isGuardedOp(op) ? [...acc, i] : acc), []));
}

export function opLabel(op: ChangeOp): string {
  const type = String(op.op ?? 'unknown');
  const target =
    op.volumeKey ??
    op.arcKey ??
    op.entityKey ??
    op.factKey ??
    (op.section !== undefined ? `${op.section}/${op.slug}` : undefined) ??
    (op.chapter !== undefined ? `ch ${op.chapter}` : undefined);
  return target === undefined ? type : `${type} · ${target}`;
}

export function parseProposalFilter(value: unknown): ProposalFilter | undefined {
  return PROPOSAL_FILTERS.find(filter => filter === value);
}

export function isOpenProposal(proposal: Pick<Proposal, 'status'>): boolean {
  return OPEN_STATUSES.has(proposal.status);
}

export function filterProposals<T extends Pick<Proposal, 'status'>>(proposals: readonly T[], filter: ProposalFilter): T[] {
  if (filter === 'all') return [...proposals];
  if (filter === 'applied') return proposals.filter(proposal => proposal.status === 'applied');
  return proposals.filter(isOpenProposal);
}

export function countByFilter(proposals: readonly Pick<Proposal, 'status'>[]): Record<ProposalFilter, number> {
  let open = 0;
  let applied = 0;
  for (const proposal of proposals) {
    if (isOpenProposal(proposal)) open += 1;
    else if (proposal.status === 'applied') applied += 1;
  }
  return { open, applied, all: proposals.length };
}

export function proposalIds(proposals: readonly Pick<Proposal, 'id'>[]): string[] {
  return proposals.map(proposal => proposal.id);
}

export function proposalTitle(proposal: Pick<Proposal, 'summary' | 'kind' | 'scopeType'>): string {
  return proposal.summary?.trim() || `${proposal.kind} · ${proposal.scopeType}`;
}

/** The op *types*, not `opLabel`'s type-plus-target: a row caption names the shape of the change, and the targets are what the detail is for. */
export function changeSetCaption(changeSet: readonly ChangeOp[]): string {
  const count = `${changeSet.length} op${changeSet.length === 1 ? '' : 's'}`;
  const types = [...new Set(changeSet.map(op => String(op.op ?? 'unknown')))];
  if (types.length === 0) return count;
  const shown = types.slice(0, 3).join(', ');
  return types.length > 3 ? `${count} · ${shown} +${types.length - 3} more` : `${count} · ${shown}`;
}

export function proposalMeta(proposal: Pick<Proposal, 'createdAt'>): string {
  const staged = relativeTime(proposal.createdAt);
  return staged ? `staged ${staged}` : '';
}

export function backLabel(total: number | undefined): string {
  return total === undefined ? 'Proposals' : `All ${total.toLocaleString()} proposals`;
}

/** Discarding removes the proposal from the open list, so the author advances to the next one still owed a decision; nothing after it means the directory is the honest landing place. */
export function nextAfterDecision(ids: readonly string[] | undefined, currentId: string): string | undefined {
  if (!ids) return undefined;
  const index = ids.indexOf(currentId);
  return index < 0 ? undefined : ids[index + 1];
}

export type ProposalDisposition = { kind: 'decide' } | { kind: 'blocked'; note: string } | { kind: 'revert'; note: string } | { kind: 'settled'; note: string };

export function proposalDisposition(proposal: Pick<Proposal, 'status' | 'revertible' | 'appliedAt' | 'revertedAt'>): ProposalDisposition {
  const applied = proposal.appliedAt ? ` ${relativeTime(proposal.appliedAt)}` : '';
  if (proposal.status === 'pending') return { kind: 'decide' };
  if (proposal.status === 'conflicted') return { kind: 'blocked', note: CONFLICT_NOTE };
  if (proposal.status === 'applied' && proposal.revertible) return { kind: 'revert', note: `Applied${applied} — reverting restores every touched artifact.` };
  if (proposal.status === 'applied') return { kind: 'settled', note: `Applied${applied} — no inverse recorded, so this change cannot be reverted.` };
  const when = proposal.revertedAt ? ` · reverted ${relativeTime(proposal.revertedAt)}` : applied ? ` ·${applied}` : '';
  return { kind: 'settled', note: `This proposal is ${proposal.status}${when}.` };
}

export function selectedOpIndexes(totalOps: number, declined: ReadonlySet<number>): number[] {
  return Array.from({ length: totalOps }, (_, i) => i).filter(i => !declined.has(i));
}

export function applyButtonLabel(totalOps: number, declinedCount: number): string {
  return declinedCount > 0 ? `Apply ${totalOps - declinedCount} selected` : 'Apply to canon';
}
