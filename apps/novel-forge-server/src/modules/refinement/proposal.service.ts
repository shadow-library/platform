import { and, asc, desc, eq, inArray, ne } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger, OffsetPaginationResult, utils } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type DbExecutor, type PrimaryDatabase, type Refinement, schema } from '@server/database';

import { loadArtifactStates } from './artifact-state';
import { type ChangeOp, changeSetRefs, type OpType, validateChangeSet } from './change-set';
import { type ListChangesQuery, type ListProposalsQuery } from './refinement.dto';

export interface ChangeItem {
  id: bigint;
  sessionId: string | null;
  kind: Refinement.Kind;
  scopeType: Refinement.ChatScope;
  status: Refinement.ProposalStatus;
  summary: string | null;
  autoApplied: boolean;
  refs: string[];
  revertible: boolean;
  opResults: Record<string, unknown>[] | null;
  appliedAt: Date | null;
  revertedAt: Date | null;
}

export interface CreateProposalInput {
  sessionId?: string;
  messageId?: bigint;
  scopeType: Refinement.ChatScope;
  scopeRef?: string | null;
  kind: Refinement.Kind;
  summary?: string | null;
  changeSet: ChangeOp[];
  allowedOps?: readonly OpType[];
  model?: string | null;
  runId?: string | null;
}

@Injectable()
export class ProposalService {
  private readonly logger = Logger.getLogger(APP_NAME, ProposalService.name);
  private readonly db: PrimaryDatabase;

  constructor(private readonly databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  /**
   * Persists a new pending proposal with a freshly captured baseline, and supersedes any prior
   * pending proposal of the same session that touches an overlapping artifact (§6.4). Cross-session
   * pending proposals are left alone — the baseline check catches them at apply time.
   */
  async create(projectId: bigint, input: CreateProposalInput, executor: DbExecutor = this.db): Promise<Refinement.Proposal> {
    const errors = validateChangeSet(input.changeSet, input.allowedOps);
    if (errors.length > 0) throw AppErrorCode.RFN_004.create();

    const refs = changeSetRefs(input.changeSet);
    const baseline = await loadArtifactStates(executor, projectId, refs);

    const [proposal] = await executor
      .insert(schema.refinementProposals)
      .values({
        projectId,
        sessionId: input.sessionId,
        messageId: input.messageId,
        scopeType: input.scopeType,
        scopeRef: input.scopeRef,
        kind: input.kind,
        summary: input.summary,
        changeSet: input.changeSet,
        baseline,
        model: input.model,
        runId: input.runId,
      })
      .returning();
    if (!proposal) throw AppErrorCode.RFN_001.create();

    if (input.sessionId) await this.supersedeOverlapping(projectId, input.sessionId, proposal.id, refs, executor);
    return proposal;
  }

  private async supersedeOverlapping(projectId: bigint, sessionId: string, newProposalId: bigint, refs: string[], executor: DbExecutor): Promise<void> {
    const pending = await executor.query.refinementProposals.findMany({
      where: and(
        eq(schema.refinementProposals.projectId, projectId),
        eq(schema.refinementProposals.sessionId, sessionId),
        eq(schema.refinementProposals.status, 'pending'),
        ne(schema.refinementProposals.id, newProposalId),
      ),
    });

    const overlapping = pending.filter(p => changeSetRefs(p.changeSet as ChangeOp[]).some(ref => refs.includes(ref)));
    for (const proposal of overlapping) {
      await executor.update(schema.refinementProposals).set({ status: 'superseded', updatedAt: new Date() }).where(eq(schema.refinementProposals.id, proposal.id));
      this.logger.debug(`proposal ${proposal.id} superseded by ${newProposalId}`);
    }
  }

  async list(projectId: bigint, filter: ListProposalsQuery): Promise<OffsetPaginationResult<Refinement.Proposal>> {
    const query = utils.pagination.normalise(filter, { mode: 'offset', defaults: { limit: 20, offset: 0, sortBy: 'createdAt', sortOrder: 'desc' } });

    const conditions = [eq(schema.refinementProposals.projectId, projectId)];
    if (filter.status) conditions.push(eq(schema.refinementProposals.status, filter.status));
    if (filter.kind) conditions.push(eq(schema.refinementProposals.kind, filter.kind));
    if (filter.scopeType) conditions.push(eq(schema.refinementProposals.scopeType, filter.scopeType));
    if (filter.sessionId) conditions.push(eq(schema.refinementProposals.sessionId, filter.sessionId));
    const where = and(...conditions);

    const column = query.sortBy === 'createdAt' ? schema.refinementProposals.createdAt : schema.refinementProposals.updatedAt;
    const order = query.sortOrder === 'asc' ? asc(column) : desc(column);

    const [total, items] = await Promise.all([
      this.db.$count(schema.refinementProposals, where),
      this.db.query.refinementProposals.findMany({ where, limit: query.limit, offset: query.offset, orderBy: order }),
    ]);

    return utils.pagination.createResult(query, items, total);
  }

  /**
   * The project-wide change history (chat-hub design §5.6): every applied/reverted proposal, newest
   * apply first — the feed the UI timeline renders with per-change revert and rollback-to-here.
   */
  async listChanges(projectId: bigint, filter: Partial<ListChangesQuery>): Promise<OffsetPaginationResult<ChangeItem>> {
    // The feed's order is fixed — newest apply first — so the query DTO offers no sort fields and the
    // sortBy/sortOrder defaults only satisfy the normaliser's shape; limit and offset are read below.
    const query = utils.pagination.normalise(filter, { mode: 'offset', defaults: { limit: 30, offset: 0, sortBy: 'updatedAt', sortOrder: 'desc' } });
    const where = and(eq(schema.refinementProposals.projectId, projectId), inArray(schema.refinementProposals.status, ['applied', 'reverted']));

    const [total, items] = await Promise.all([
      this.db.$count(schema.refinementProposals, where),
      this.db.query.refinementProposals.findMany({
        where,
        limit: query.limit,
        offset: query.offset,
        orderBy: [desc(schema.refinementProposals.appliedAt), desc(schema.refinementProposals.id)],
      }),
    ]);

    const changes = items.map((proposal): ChangeItem => ({
      id: proposal.id,
      sessionId: proposal.sessionId,
      kind: proposal.kind,
      scopeType: proposal.scopeType,
      status: proposal.status,
      summary: proposal.summary,
      autoApplied: proposal.autoApplied,
      refs: changeSetRefs(proposal.changeSet as ChangeOp[]),
      revertible: proposal.status === 'applied' && ((proposal.inverseOps as ChangeOp[] | null)?.length ?? 0) > 0,
      opResults: proposal.opResults as Record<string, unknown>[] | null,
      appliedAt: proposal.appliedAt,
      revertedAt: proposal.revertedAt,
    }));
    return utils.pagination.createResult(query, changes, total);
  }

  async get(projectId: bigint, proposalId: bigint): Promise<Refinement.Proposal> {
    const proposal = await this.db.query.refinementProposals.findFirst({
      where: and(eq(schema.refinementProposals.projectId, projectId), eq(schema.refinementProposals.id, proposalId)),
    });
    if (!proposal) throw AppErrorCode.RFN_001.create();
    return proposal;
  }

  /** Hand-edits get no trust: the change-set is re-validated and the baseline re-captured for the new refs. */
  async updateChangeSet(projectId: bigint, proposalId: bigint, changeSet: unknown): Promise<Refinement.Proposal> {
    const existing = await this.get(projectId, proposalId);
    if (existing.status !== 'pending') throw AppErrorCode.RFN_002.create();

    const errors = validateChangeSet(changeSet);
    if (errors.length > 0) throw AppErrorCode.RFN_004.create();

    const ops = changeSet as ChangeOp[];
    const baseline = await loadArtifactStates(this.db, projectId, changeSetRefs(ops));
    const [updated] = await this.db
      .update(schema.refinementProposals)
      .set({ changeSet: ops, baseline, updatedAt: new Date() })
      .where(eq(schema.refinementProposals.id, existing.id))
      .returning();
    if (!updated) throw AppErrorCode.RFN_001.create();
    return updated;
  }

  async discard(projectId: bigint, proposalId: bigint): Promise<Refinement.Proposal> {
    const existing = await this.get(projectId, proposalId);
    if (existing.status !== 'pending' && existing.status !== 'conflicted') throw AppErrorCode.RFN_002.create();

    const [updated] = await this.db
      .update(schema.refinementProposals)
      .set({ status: 'discarded', updatedAt: new Date() })
      .where(eq(schema.refinementProposals.id, existing.id))
      .returning();
    if (!updated) throw AppErrorCode.RFN_001.create();
    return updated;
  }
}
