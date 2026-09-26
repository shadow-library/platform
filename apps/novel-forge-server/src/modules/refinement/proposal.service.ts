import { and, asc, desc, eq, inArray, ne, type SQL, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger, OffsetPaginationResult, utils } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { findAuditReportForCard } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type DbExecutor, type PrimaryDatabase, type Refinement, schema } from '@server/database';

import { ISOLATED_SOURCE_WARNING } from '../ai/isolation-read-policy';
import { type ArtifactState, loadArtifactStates, MISSING_ARTIFACT } from './artifact-state';
import { type ChangeOp, changeSetRefs, type ChangeSetValidationOptions, type ContentOp, type OpType, validateChangeSet, validatePluginChangeSet } from './change-set';
import { planCardDiagnostics, proposalDiagnostics } from './plan-diagnostics';
import { findNegationEchoWarnings, findRevealClearWarnings } from './proposal-warnings';
import { type ListChangesQuery, type ListProposalsQuery } from './refinement.dto';
import { loadImpactRows, type UndoImpact, undoImpact, undoneChange } from './undo-impact';

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
  /** Off for the bible tidy-up, whose document writes only move or retitle prose that is already there. */
  entityMaterialization?: boolean;
  model?: string | null;
  runId?: string | null;
  /** Precomputed by a caller that already ran the checks with more context (the chat turn knows the author's words); computed here otherwise. */
  warnings?: string[];
  /** Read from an isolated chapter: the proposal carries a warning saying so, which also holds it from any automatic apply. */
  sourceIsolated?: boolean;
  /** States read before the change-set was written (an audit's, taken as it loaded the bible), so an edit made meanwhile conflicts at apply; read now otherwise. */
  baseline?: Readonly<Record<string, ArtifactState>>;
  /** An organise proposal's record, aligned to its change-set: what applying it records on the ledger. */
  organiseRecord?: unknown;
}

/** An apply or revert that lands between the read and the write settles the card, so the write re-checks the status itself. */
export const DISCARDABLE: Refinement.ProposalStatus[] = ['pending', 'conflicted'];

function pickBaseline(states: Readonly<Record<string, ArtifactState>>, refs: readonly string[]): Record<string, ArtifactState> {
  return Object.fromEntries(refs.map(ref => [ref, states[ref] ?? MISSING_ARTIFACT]));
}

type ApproveDraftOp = Extract<ChangeOp, { op: 'action.approve_draft' }>;

/**
 * Who a new proposal supersedes its own stale pending work for: a chat session, or — for a plugin, which
 * has no session and restages the same decision on every run — the plugin's own scope.
 */
function supersessionOwner(input: CreateProposalInput): SQL | undefined {
  if (input.sessionId) return eq(schema.refinementProposals.sessionId, input.sessionId);
  if (input.kind !== 'plugin' || !input.scopeRef) return undefined;
  return and(eq(schema.refinementProposals.kind, 'plugin'), eq(schema.refinementProposals.scopeType, input.scopeType), eq(schema.refinementProposals.scopeRef, input.scopeRef));
}

/** A plugin-kind proposal carries the plugin allowlist by virtue of its kind, so a hand-edit cannot widen it either. */
function validateOps(kind: Refinement.Kind, changeSet: unknown, allowedOps?: readonly OpType[], options?: ChangeSetValidationOptions): string[] {
  if (kind === 'plugin') return validatePluginChangeSet(changeSet);
  return validateChangeSet(changeSet, allowedOps, options);
}

/**
 * `startedEmpty` is the server's mark on a plan card it opened empty, never a model's or a client's to set: it is dropped from whatever
 * arrives, and an edited card keeps the mark its stored plan carried for the same chapter.
 */
function stampStartedEmpty(ops: readonly ChangeOp[], stamped: readonly ChangeOp[] = []): ChangeOp[] {
  const marked = new Set(stamped.flatMap(op => (op.op === 'brief.update' && op.startedEmpty === true ? [op.chapter] : [])));
  return ops.map(op => {
    const { startedEmpty: _startedEmpty, ...rest } = op;
    return op.op === 'brief.update' && marked.has(op.chapter) ? ({ ...rest, startedEmpty: true } as ChangeOp) : (rest as ChangeOp);
  });
}

/**
 * An approval binds to the draft revision current when it was staged — the prose the author could read beside the card — so a card
 * applied after the prose changed is refused. A model never knows the revision, so staging overwrites whatever it sent; a hand edit
 * keeps a revision it carries.
 */
async function stampApprovalRevisions(executor: DbExecutor, projectId: bigint, ops: ChangeOp[], keepSupplied: boolean): Promise<ChangeOp[]> {
  const unstamped = (op: ChangeOp): op is ApproveDraftOp =>
    op.op === 'action.approve_draft' && !(keepSupplied && typeof op.revision === 'number' && typeof op.saveSeq === 'number' && typeof op.draftId === 'string');
  const chapters = [...new Set(ops.filter(unstamped).map(op => op.chapter))];
  if (chapters.length === 0) return ops;

  const drafts = await executor.query.drafts.findMany({
    columns: { id: true, chapter: true, revision: true, saveSeq: true },
    where: and(eq(schema.drafts.projectId, projectId), inArray(schema.drafts.chapter, chapters)),
  });
  const readByChapter = new Map(drafts.map(draft => [draft.chapter, { revision: draft.revision, saveSeq: draft.saveSeq, draftId: String(draft.id) }]));
  return ops.map(op => {
    if (!unstamped(op)) return op;
    const { revision: _revision, saveSeq: _saveSeq, draftId: _draftId, ...approval } = op;
    const read = readByChapter.get(op.chapter);
    return read === undefined ? approval : { ...approval, ...read };
  });
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
   * pending proposal of the same session that touches an overlapping artifact. Cross-session
   * pending proposals are left alone — the baseline check catches them at apply time.
   */
  async create(projectId: bigint, input: CreateProposalInput, executor: DbExecutor = this.db): Promise<Refinement.Proposal> {
    const errors = validateOps(input.kind, input.changeSet, input.allowedOps, { entityMaterialization: input.entityMaterialization });
    if (errors.length > 0) throw AppErrorCode.RFN_004.create();

    const trusted = input.kind === 'chapter_plan' ? input.changeSet : stampStartedEmpty(input.changeSet);
    const changeSet = await stampApprovalRevisions(executor, projectId, trusted, false);
    const refs = changeSetRefs(changeSet);
    const baseline = input.baseline ? pickBaseline(input.baseline, refs) : await loadArtifactStates(executor, projectId, refs);
    // Caller warnings replace only the negation-echo review; the reveal-clear check always runs so an undate cannot slip past auto-apply.
    const diagnostics = proposalDiagnostics(
      [
        ...(input.warnings ?? (await this.reviewWarnings(executor, projectId, input.changeSet))),
        ...(await this.revealClearWarnings(executor, projectId, input.changeSet)),
        ...(input.sourceIsolated ? [ISOLATED_SOURCE_WARNING] : []),
      ],
      await this.planDiagnostics(executor, projectId, input.kind, changeSet),
    );
    const warnings = diagnostics.map(diagnostic => diagnostic.message);

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
        changeSet,
        baseline,
        model: input.model,
        runId: input.runId,
        warnings: warnings.length > 0 ? warnings : null,
        organiseRecord: input.organiseRecord,
        diagnostics: diagnostics.length > 0 ? diagnostics : null,
      })
      .returning();
    if (!proposal) throw AppErrorCode.RFN_001.create();

    const owner = supersessionOwner(input);
    if (owner) await this.supersedeOverlapping(projectId, owner, proposal.id, refs, executor);
    return proposal;
  }

  /** Warnings are advisory: a failed check must never cost the author the proposal it was reviewing. */
  private async reviewWarnings(executor: DbExecutor, projectId: bigint, ops: ChangeOp[]): Promise<string[]> {
    try {
      return await findNegationEchoWarnings(executor, projectId, ops);
    } catch (err) {
      this.logger.warn('proposal review warnings failed — staging without them', { projectId, err });
      return [];
    }
  }

  /** A plan pass card's pooling, point-of-view and density diagnostics, judged on the card as it now stands. */
  private async planDiagnostics(executor: DbExecutor, projectId: bigint, kind: Refinement.Kind, ops: ChangeOp[]): Promise<Refinement.Diagnostic[]> {
    if (kind !== 'chapter_plan') return [];
    try {
      return await planCardDiagnostics(executor, projectId, ops);
    } catch (err) {
      this.logger.warn('proposal plan diagnostics failed — staging without them', { projectId, err });
      return [];
    }
  }

  private async revealClearWarnings(executor: DbExecutor, projectId: bigint, ops: ChangeOp[]): Promise<string[]> {
    try {
      return await findRevealClearWarnings(executor, projectId, ops);
    } catch (err) {
      this.logger.warn('proposal reveal-clear warnings failed — staging without them', { projectId, err });
      return [];
    }
  }

  private async supersedeOverlapping(projectId: bigint, owner: SQL, newProposalId: bigint, refs: string[], executor: DbExecutor): Promise<void> {
    const pending = await executor.query.refinementProposals.findMany({
      where: and(eq(schema.refinementProposals.projectId, projectId), owner, eq(schema.refinementProposals.status, 'pending'), ne(schema.refinementProposals.id, newProposalId)),
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
    if (filter.chapter !== undefined) conditions.push(sql`${schema.refinementProposals.changeSet} @> jsonb_build_array(jsonb_build_object('chapter', ${filter.chapter}::int))`);
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
   * The project-wide change history: every applied/reverted proposal, newest
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
    // A finding's op indexes point into the card as staged, so an edit would re-aim every Keep and Skip.
    if (existing.kind === 'bible_audit' && (await findAuditReportForCard(this.db, existing.id))) throw AppErrorCode.AUD_007.create();
    if (existing.kind === 'organise') throw AppErrorCode.NTS_008.create();

    const errors = validateOps(existing.kind, changeSet);
    if (errors.length > 0) throw AppErrorCode.RFN_004.create();

    const ops = await stampApprovalRevisions(this.db, projectId, stampStartedEmpty(changeSet as ChangeOp[], existing.changeSet as ChangeOp[]), true);
    const baseline = await loadArtifactStates(this.db, projectId, changeSetRefs(ops));
    const diagnostics = proposalDiagnostics(
      [...(await this.reviewWarnings(this.db, projectId, ops)), ...(await this.revealClearWarnings(this.db, projectId, ops))],
      await this.planDiagnostics(this.db, projectId, existing.kind, ops),
    );
    const warnings = diagnostics.map(diagnostic => diagnostic.message);
    const [updated] = await this.db
      .update(schema.refinementProposals)
      .set({ changeSet: ops, baseline, warnings: warnings.length > 0 ? warnings : null, diagnostics: diagnostics.length > 0 ? diagnostics : null, updatedAt: new Date() })
      .where(and(eq(schema.refinementProposals.id, existing.id), eq(schema.refinementProposals.status, 'pending')))
      .returning();
    // An apply or discard that landed while the edit was being judged has settled the card; the edit must not rewrite it.
    if (!updated) throw AppErrorCode.RFN_002.create();
    return updated;
  }

  /** What reverting an applied proposal would leave relying on records it no longer backs — shown before the author undoes it. */
  async undoImpact(projectId: bigint, proposalId: bigint): Promise<UndoImpact> {
    const proposal = await this.get(projectId, proposalId);
    const inverseOps = proposal.inverseOps as ContentOp[] | null;
    if (proposal.status !== 'applied' || !inverseOps?.length) throw AppErrorCode.RFN_007.create();
    const refs = Object.keys((proposal.postState ?? {}) as Record<string, unknown>);
    return undoImpact(undoneChange(refs, inverseOps), await loadImpactRows(this.db, projectId, proposalId, refs));
  }

  async discard(projectId: bigint, proposalId: bigint): Promise<Refinement.Proposal> {
    const existing = await this.get(projectId, proposalId);
    if (!DISCARDABLE.includes(existing.status)) throw AppErrorCode.RFN_002.create();

    const [updated] = await this.db
      .update(schema.refinementProposals)
      .set({ status: 'discarded', updatedAt: new Date() })
      .where(and(eq(schema.refinementProposals.id, existing.id), inArray(schema.refinementProposals.status, DISCARDABLE)))
      .returning();
    if (!updated) throw AppErrorCode.RFN_002.create();
    return updated;
  }
}
