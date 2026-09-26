import { and, eq, inArray, isNull, or } from 'drizzle-orm';

import { AppErrorCode } from '@server/classes';
import { type DbExecutor, type Refinement, schema } from '@server/database';

import { loadActiveLedger } from '../ledger/ledger-entries';
import { ledgerRow } from '../ledger/ledger.service';
import { type OrganiseLedgerDelta, organiseReconciliation, type OrganiseRecord } from './organise-card';
import { type OrganiseReconciliation } from './organise-reconcile';

/** The marker migration 0008 left on organise cards staged before they carried a record: they record nothing, as they never did. */
export const LEGACY_ORGANISE_RECORD = { legacy: true } as const;

const RETIRED_REASON = 'Replaced when the notes were organised again.';

type OrganiseProposal = Pick<Refinement.Proposal, 'id' | 'kind' | 'organiseRecord'>;

function isLegacy(value: unknown): boolean {
  return typeof value === 'object' && value !== null && (value as { legacy?: unknown }).legacy === true;
}

export function organiseRecordOf(value: unknown): OrganiseRecord | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const record = value as Partial<OrganiseRecord>;
  return record.version === 1 && Array.isArray(record.ops) && Array.isArray(record.settled) && record.receipt !== undefined ? (record as OrganiseRecord) : undefined;
}

/** The record an organise proposal must carry, or undefined for a legacy card; a new card without one is refused rather than applied blind. */
function recordFor(proposal: OrganiseProposal): OrganiseRecord | undefined {
  if (proposal.kind !== 'organise' || isLegacy(proposal.organiseRecord)) return undefined;
  const record = organiseRecordOf(proposal.organiseRecord);
  if (!record) throw AppErrorCode.NTS_009.create();
  return record;
}

/** What an organise card applies when the author keeps it whole: every op but the notes-backed half of a page whose whole page it also keeps. */
export function wholeOrganiseSelection(proposal: OrganiseProposal & Pick<Refinement.Proposal, 'changeSet'>): number[] | undefined {
  const record = recordFor(proposal);
  if (!record || record.mixed.length === 0) return undefined;
  const halves = new Set(record.mixed.map(pair => pair.notesOnly));
  return (proposal.changeSet as unknown[]).map((_, index) => index).filter(index => !halves.has(index));
}

/** The whole page already holds its notes-backed half, so keeping both would apply one write under the other. */
export function assertOrganiseSelection(record: OrganiseRecord, selected: readonly number[]): void {
  const chosen = new Set(selected);
  const both = record.mixed.find(pair => chosen.has(pair.notesOnly) && chosen.has(pair.whole));
  if (both) throw AppErrorCode.NTS_007.create({ page: both.page });
}

async function writeReconciliation(executor: DbExecutor, projectId: bigint, reconciliation: OrganiseReconciliation): Promise<OrganiseLedgerDelta> {
  const table = schema.decisionLedgerEntries;
  const now = new Date();
  const retire = (id: bigint, withdrawnReason: string | null) =>
    executor
      .update(table)
      .set({ supersededAt: now, withdrawnReason })
      .where(and(eq(table.id, id), eq(table.projectId, projectId), isNull(table.supersededAt)));
  const insert = async (rows: ReturnType<typeof ledgerRow>[]): Promise<string[]> =>
    rows.length === 0 ? [] : (await executor.insert(table).values(rows).returning({ id: table.id })).map(row => String(row.id));

  const delta: OrganiseLedgerDelta = { created: [], retired: [] };
  for (const entry of reconciliation.withdraw) {
    await retire(entry.id, RETIRED_REASON);
    delta.retired.push({ id: String(entry.id), successor: null });
  }
  for (const { previous, next } of reconciliation.supersede) {
    await retire(previous.id, null);
    const [successor] = await insert([ledgerRow(projectId, { ...next, topic: previous.topic }, previous.id)]);
    delta.retired.push({ id: String(previous.id), successor: successor ?? null });
    if (successor) delta.created.push(successor);
  }
  delta.created.push(...(await insert(reconciliation.create.map(entry => ledgerRow(projectId, entry)))));
  return delta;
}

/**
 * Applying an organise proposal records, in the apply's own transaction, what the selected writes left organising holding, so the next run
 * rewrites that in place instead of beside it; the ledger rows it wrote stay on the proposal for an undo to take back.
 */
export async function recordOrganiseDecision(executor: DbExecutor, projectId: bigint, proposal: OrganiseProposal, selected: readonly number[]): Promise<void> {
  const record = recordFor(proposal);
  if (!record) return;
  assertOrganiseSelection(record, selected);
  const ledger = await loadActiveLedger(executor, projectId);
  const applied = await writeReconciliation(executor, projectId, organiseReconciliation(record, selected, ledger));
  await executor
    .update(schema.refinementProposals)
    .set({ organiseRecord: { ...record, applied } })
    .where(eq(schema.refinementProposals.id, proposal.id));
}

/** An applied organise proposal whose ledger writes an undo can take back, even when it changed no artifact (a card that kept only rules). */
export function hasOrganiseUndo(proposal: OrganiseProposal): boolean {
  return recordFor(proposal)?.applied !== undefined;
}

/** The later organise proposal that wrote one of `ids`, if one did: the change that must be undone first. */
async function laterOrganise(executor: DbExecutor, projectId: bigint, ids: readonly bigint[]): Promise<bigint | undefined> {
  if (ids.length === 0) return undefined;
  const table = schema.refinementProposals;
  const applied = await executor
    .select({ id: table.id, organiseRecord: table.organiseRecord })
    .from(table)
    .where(and(eq(table.projectId, projectId), eq(table.kind, 'organise'), eq(table.status, 'applied')));
  const wanted = new Set(ids.map(String));
  return applied.find(row => organiseRecordOf(row.organiseRecord)?.applied?.created.some(id => wanted.has(id)))?.id;
}

/**
 * Undoing an organise proposal puts the ledger back as the apply found it: the rows it wrote go, and what it retired is active again. A
 * row the author has since withdrawn or reworded in the Notebook is theirs now and stays, with what it replaced left retired; only a row a
 * later organise answer replaced stops the undo, since that answer must be undone first.
 */
export async function revertOrganiseDecision(executor: DbExecutor, projectId: bigint, proposal: OrganiseProposal): Promise<void> {
  const applied = recordFor(proposal)?.applied;
  if (!applied) return;
  const table = schema.decisionLedgerEntries;
  const created = applied.created.map(BigInt);
  const related =
    created.length === 0
      ? []
      : await executor
          .select({ id: table.id, supersedesId: table.supersedesId, supersededAt: table.supersededAt })
          .from(table)
          .where(and(eq(table.projectId, projectId), or(inArray(table.id, created), inArray(table.supersedesId, created))));
  const mine = new Set(created);
  const rows = related.filter(row => mine.has(row.id));
  const successors = related.filter(row => row.supersedesId !== null && mine.has(row.supersedesId));
  const later = await laterOrganise(
    executor,
    projectId,
    successors.map(row => row.id),
  );
  if (later !== undefined) throw AppErrorCode.NTS_010.create({ proposalId: String(later) });

  const removable = rows.filter(row => row.supersededAt === null).map(row => row.id);
  if (removable.length > 0) await executor.delete(table).where(and(eq(table.projectId, projectId), inArray(table.id, removable)));
  const removed = new Set(removable.map(String));
  const restored = applied.retired.filter(entry => entry.successor === null || removed.has(entry.successor)).map(entry => BigInt(entry.id));
  if (restored.length > 0) {
    await executor
      .update(table)
      .set({ supersededAt: null, withdrawnReason: null })
      .where(and(eq(table.projectId, projectId), inArray(table.id, restored)));
  }
}
