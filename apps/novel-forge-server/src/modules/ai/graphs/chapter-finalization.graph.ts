import { Annotation, type BaseCheckpointSaver, END, START, StateGraph } from '@langchain/langgraph';
import { and, eq, isNull, lt, ne, or, sql } from 'drizzle-orm';
import { AppError, Logger } from '@shadow-library/common';

import { AppErrorCode } from '@server/classes';
import {
  assertPlanRevealsHold,
  commitChapterKnowledge,
  discloseChapterReveals,
  lockProjectPlan,
  reachClaimedMilestones,
  refusedDraftWriteError,
  sanitizeMarkdown,
} from '@server/common';
import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, type Project } from '@server/database';
import * as schema from '@server/database/schemas';

import { chapterProjectConfig } from '../chapter-route';
import { type ContextAssembler } from '../context/context-assembler.service';
import { isolatedContinuityProposal, isolatedExtractionContext } from '../isolation-read-policy';
import { type ModelRouterService, type ProjectConfig } from '../model-router.service';
import { PROMPT_REGISTRY } from '../prompts';
import { type IndexingService } from '../retrieval/indexing.service';
import { type ContinuityOutput, type GenerationState } from '../schemas';
import { type TelemetryContext, type TelemetryHandler } from '../telemetry.handler';
import { applyReviewOnCommit, reviewedEntityKeys } from '../../finalize-review/finalize-review-gate';
import { type ToolRegistryService } from '../tools/tool-registry.service';
import { applyContinuityDelta, continuityHasHeldEntries, type ContinuityTransaction, filterToHeldEntries } from './apply-continuity';

export interface IsolatedContinuityInput {
  projectId: bigint;
  chapter: number;
  prose: string;
  contextPack: string;
}

/**
 * Walled-off prose is read only on the unrestricted route, and what it yields waits for the author as a pending proposal with its excerpts
 * withheld: finalize never applies it, and a replay never reopens one the author already settled. Staging is advisory, so a failure is
 * logged and the chapter still finalizes.
 */
export async function stageIsolatedContinuity(
  services: { db: PrimaryDatabase; modelRouter: Pick<ModelRouterService, 'structured' | 'resolveModel'> },
  input: IsolatedContinuityInput,
  ctx: TelemetryContext,
): Promise<void> {
  const { db, modelRouter } = services;
  try {
    const projectRow = await db.query.projects.findFirst({ where: eq(schema.projects.id, input.projectId) });
    const routed = chapterProjectConfig(projectRow as ProjectConfig | undefined, 'unrestricted');
    const extracted = (await modelRouter.structured(
      PROMPT_REGISTRY.continuity,
      { contextPack: isolatedExtractionContext(input.contextPack), chapterNumber: input.chapter, chapterProse: input.prose },
      ctx,
      routed,
    )) as ContinuityOutput;
    const proposal = isolatedContinuityProposal(extracted);
    const resolvedModel = modelRouter.resolveModel('continuity', routed);
    await db
      .insert(schema.continuityProposals)
      .values({ projectId: input.projectId, chapter: input.chapter, proposal: proposal as never, model: resolvedModel.model, status: 'pending' })
      .onConflictDoUpdate({
        target: [schema.continuityProposals.projectId, schema.continuityProposals.chapter],
        set: { proposal: sql`EXCLUDED.proposal`, model: sql`EXCLUDED.model`, updatedAt: new Date() },
        setWhere: eq(schema.continuityProposals.status, 'pending'),
      });
  } catch (err) {
    logger.warn('finalization: isolated continuity not staged', { projectId: input.projectId, chapter: input.chapter, err });
  }
}

export interface FinalizationServices {
  db: PrimaryDatabase;
  contextAssembler: ContextAssembler;
  modelRouter: ModelRouterService;
  telemetry: TelemetryHandler;
  toolRegistry: ToolRegistryService;
  indexingService: IndexingService;
  checkpointer: BaseCheckpointSaver;
}

const ChapterFinalizationAnnotation = Annotation.Root({
  projectId: Annotation<string>({ reducer: (_, n) => n, default: () => '0' }),
  chapter: Annotation<number>({ reducer: (_, n) => n, default: () => 0 }),
  runId: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  draftId: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  draftRevision: Annotation<number | null>({ reducer: (_, n) => n, default: () => null }),
  prose: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  summary: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  title: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  continuationState: Annotation<GenerationState>({ reducer: (_, n) => n, default: () => ({}) }),
  generator: Annotation<string>({ reducer: (_, n) => n, default: () => 'standard' }),
  isolated: Annotation<boolean>({ reducer: (_, n) => n, default: () => false }),
  continuityDelta: Annotation<ContinuityOutput | null>({ reducer: (_, n) => n, default: () => null }),
  outcome: Annotation<string | null>({ reducer: (_, n) => n, default: () => null }),
  nodeTrace: Annotation<string[]>({ reducer: (a, n) => [...a, ...n], default: () => [] }),
});

type FinalizationState = typeof ChapterFinalizationAnnotation.State;

const logger = Logger.getLogger(APP_NAME, 'chapter-finalization.graph');

// How long a continuity claim stays live before another run may steal it — long enough to outlast a slow
// extraction, short enough that a worker killed mid-extraction does not brick the chapter until a human looks.
const CONTINUITY_CLAIM_LEASE_MS = 5 * 60 * 1000;

export interface CommitProseInput {
  projectId: string;
  chapter: number;
  runId: string;
  draftId: string | null;
  draftRevision: number | null;
  prose: string;
  summary: string;
  title: string;
  generator: string;
  isolated: boolean;
}

/**
 * Writes the canonical chapter and marks its draft final in one transaction, bound to the draft revision finalize read and approved:
 * a revise or edit landing in between refuses the commit, so the locked chapter never holds prose the final draft does not. The commit
 * is refused while the chapter's plan reveals a locked fact. It commits the knowledge the approval ledgered, discloses the chapter's reveals
 * to the reader and reaches the milestones the plan claims — again on a resumed run, where each step finds nothing left to do.
 */
export async function commitFinalProse(db: PrimaryDatabase, state: CommitProseInput): Promise<void> {
  const projectId = BigInt(state.projectId);
  const content = sanitizeMarkdown(state.prose);
  const title = sanitizeMarkdown(state.title) || null;
  logger.debug('finalization commitProse', { runId: state.runId, chapter: state.chapter, proseLength: state.prose.length });

  await db.transaction(async tx => {
    // Locks in the order every plan write takes them (project, then chapter and draft rows, then milestones), so a claim cannot move
    // between the rule check below and the milestones this commit reaches.
    await lockProjectPlan(tx, projectId);
    await assertPlanRevealsHold(tx, projectId, state.chapter);
    // `setWhere` makes a finalized chapter immutable at the write path — a locked row is never overwritten, only (re)inserted once.
    await tx
      .insert(schema.chapters)
      .values({
        projectId,
        number: state.chapter,
        title,
        content,
        summary: state.summary || null,
        status: 'done',
        generator: (state.generator as Project.ContentGenerator) || 'standard',
        isolated: state.isolated,
        wordCount: content.split(/\s+/).length,
        locked: true,
      })
      .onConflictDoUpdate({
        target: [schema.chapters.projectId, schema.chapters.number],
        set: {
          content: sql`EXCLUDED.content`,
          summary: sql`EXCLUDED.summary`,
          title: sql`EXCLUDED.title`,
          status: sql`EXCLUDED.status`,
          generator: sql`EXCLUDED.generator`,
          isolated: sql`EXCLUDED.isolated`,
          wordCount: sql`EXCLUDED.word_count`,
          locked: true,
          updatedAt: new Date(),
        },
        setWhere: ne(schema.chapters.locked, true),
      });

    const draftId = state.draftId ? BigInt(state.draftId) : null;
    if (!draftId) return discloseChapterReveals(tx, projectId, state.chapter);
    const draftRevision = state.draftRevision;
    if (draftRevision === null) throw AppError.internal(`[commitProse] Finalization of chapter ${state.chapter} carries no draft revision`);
    // A reviewed chapter reaches only the milestones the author kept; one approved before reviews existed reaches what its plan claims.
    const commitKnowledge = async (): Promise<void> => {
      await commitChapterKnowledge(tx, projectId, state.chapter, draftRevision);
      const reviewed = await applyReviewOnCommit(tx, { projectId, chapter: state.chapter, draftRevision, prose: state.prose });
      if (!reviewed) await reachClaimedMilestones(tx, projectId, state.chapter, draftRevision);
    };
    // A summary save on an already-approved draft doesn't bump its revision, so `state.summary` can be stale —
    // `returning` gets the true value from the same write that finalizes the draft, not a racing unlocked read.
    const [finalized] = await tx
      .update(schema.drafts)
      .set({ status: 'final', reviewStatus: 'final', updatedAt: new Date() })
      .where(and(eq(schema.drafts.id, draftId), eq(schema.drafts.revision, draftRevision), eq(schema.drafts.reviewStatus, 'approved'), ne(schema.drafts.status, 'final')))
      .returning({ summary: schema.drafts.summary });
    if (finalized) {
      if (finalized.summary !== state.summary) {
        await tx
          .update(schema.chapters)
          .set({ summary: finalized.summary || null, updatedAt: new Date() })
          .where(and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, state.chapter)));
      }
      return commitKnowledge();
    }

    const current = await tx.query.drafts.findFirst({ columns: { status: true, revision: true }, where: eq(schema.drafts.id, draftId) });
    if (current?.status === 'final' && current.revision === draftRevision) return commitKnowledge();
    logger.warn('finalization commitProse refused: the draft moved after finalize read it', {
      runId: state.runId,
      chapter: state.chapter,
      readRevision: draftRevision,
      currentRevision: current?.revision,
    });
    if (current && current.status !== 'final' && current.revision === draftRevision) throw AppErrorCode.DRF_004.create();
    throw await refusedDraftWriteError(tx, projectId, state.chapter);
  });
}

export async function continuityRoster(db: Pick<PrimaryDatabase, 'query'>, projectId: bigint): Promise<string> {
  const entityRows = await db.query.entities.findMany({
    where: eq(schema.entities.projectId, projectId),
    with: { aliases: true },
    columns: { entityKey: true, name: true, type: true },
  });
  const entityRoster = entityRows.map(e => `${e.entityKey} (${e.type}): ${e.name}`).join('\n');

  // Thread and mystery keys are model-authored and upserted by key, so without the existing vocabulary the
  // extractor coins a fresh key for a thread it already tracks and the same thread splits into two records.
  const threadRows = await db.query.plotThreads.findMany({ where: eq(schema.plotThreads.projectId, projectId), columns: { threadKey: true, status: true, summary: true } });
  const mysteryRows = await db.query.mysteries.findMany({ where: eq(schema.mysteries.projectId, projectId), columns: { mysteryKey: true, status: true, question: true } });
  const threadRoster = threadRows.map(t => `${t.threadKey} (${t.status}): ${t.summary ?? ''}`).join('\n');
  const mysteryRoster = mysteryRows.map(m => `${m.mysteryKey} (${m.status}): ${m.question}`).join('\n');
  return [`## ENTITY ROSTER\n${entityRoster || 'none'}`, `## EXISTING THREADS\n${threadRoster || 'none'}`, `## EXISTING MYSTERIES\n${mysteryRoster || 'none'}`].join('\n\n');
}

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
export function createChapterFinalizationGraph(services: FinalizationServices) {
  const { db, modelRouter, indexingService, checkpointer } = services;

  async function guard(state: FinalizationState) {
    const projectId = BigInt(state.projectId);
    const [draftRow, projectRow] = await Promise.all([
      state.draftId ? db.query.drafts.findFirst({ where: and(eq(schema.drafts.projectId, projectId), eq(schema.drafts.chapter, state.chapter)) }) : null,
      db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
    ]);

    // `final` is accepted alongside `approved` so a run resumed after a mid-pipeline failure gets past
    // its own commitProse, which already flipped the draft. The service layer establishes that a `final`
    // draft is a genuine resume and not a duplicate finalize before it invokes the graph again.
    if (!draftRow || (draftRow.reviewStatus !== 'approved' && draftRow.reviewStatus !== 'final'))
      throw AppError.internal(`[guard] Draft for chapter ${state.chapter} is not approved (status: ${draftRow?.reviewStatus ?? 'missing'})`);

    const currentChapter = projectRow?.storyCurrentChapter ?? 0;
    if (state.chapter !== currentChapter + 1) {
      throw AppError.internal(`[guard] Chapter ${state.chapter} is not next in sequence (current: ${currentChapter})`);
    }

    logger.debug('finalization guard passed', { runId: state.runId, chapter: state.chapter, currentChapter });
    return { nodeTrace: ['guard'] };
  }

  async function commitProse(state: FinalizationState) {
    await commitFinalProse(db, state);
    return { nodeTrace: ['commitProse'] };
  }

  // Conditioned on the caller still owning the claim: once the lease expired and another run took over, a late
  // unwind from the previous owner is a no-op instead of wiping the new owner's live claim mid-extraction.
  async function releaseClaim(projectId: bigint, chapter: number, ownerRunId: string) {
    await db
      .update(schema.chapters)
      .set({ continuityClaimedAt: null, continuityClaimedBy: null })
      .where(and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, chapter), eq(schema.chapters.continuityClaimedBy, ownerRunId)));
  }

  // An UPDATE rather than a SELECT because it must take the `chapters` row lock and hold it for the rest of the
  // enclosing transaction: no takeover UPDATE on that row can commit until this transaction resolves, which is
  // what turns a check-then-act read into an atomic fence. Call it as the transaction's first statement, with
  // that transaction's own `tx`, so the lock covers every authoritative write that follows; throwing here rolls
  // the transaction back, so a lost claim can never leave partial canon behind.
  async function assertOwnsClaim(tx: ContinuityTransaction, projectId: bigint, chapter: number, runId: string, node: string): Promise<void> {
    const [owned] = await tx
      .update(schema.chapters)
      .set({ updatedAt: new Date() })
      .where(
        and(
          eq(schema.chapters.projectId, projectId),
          eq(schema.chapters.number, chapter),
          eq(schema.chapters.continuityClaimedBy, runId),
          eq(schema.chapters.continuityApplied, false),
        ),
      )
      .returning({ id: schema.chapters.id });
    if (!owned) throw AppError.internal(`[${node}] Lost the continuity claim for chapter ${chapter}; another run took ownership`);
  }

  function continuityContext(state: FinalizationState, projectId: bigint): TelemetryContext {
    return {
      projectId,
      runId: state.runId,
      node: 'extractContinuity',
      promptKey: 'continuity',
      promptVersion: PROMPT_REGISTRY.continuity.version,
      role: 'continuity',
      chapter: state.chapter,
    };
  }

  async function extractContinuity(state: FinalizationState) {
    const projectId = BigInt(state.projectId);
    const chapterWhere = and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, state.chapter));
    if (state.isolated) {
      const reviewed = await db.query.chapters.findFirst({ where: chapterWhere, columns: { continuityApplied: true } });
      if (reviewed?.continuityApplied) return { continuityDelta: null, nodeTrace: ['extractContinuity'] };
      await stageIsolatedContinuity(
        { db, modelRouter },
        { projectId, chapter: state.chapter, prose: state.prose, contextPack: await continuityRoster(db, projectId) },
        continuityContext(state, projectId),
      );
      return { continuityDelta: null, nodeTrace: ['extractContinuity'] };
    }

    // Claiming the row is the only thing that grants the right to extract. A plain `continuityApplied` read
    // would be a check-then-act: two concurrent finalizes of the same chapter both see `false`, both call the
    // (non-deterministic) extractor, and both apply contradictory canon. The lease is compared against the app
    // clock because the claim timestamp is written by the app clock too — mixing in `now()` would compare
    // across two clocks. A resumed run re-enters from START and takes the same path.
    const staleBefore = new Date(Date.now() - CONTINUITY_CLAIM_LEASE_MS);
    const [claimed] = await db
      .update(schema.chapters)
      .set({ continuityClaimedAt: new Date(), continuityClaimedBy: state.runId })
      .where(and(chapterWhere, eq(schema.chapters.continuityApplied, false), or(isNull(schema.chapters.continuityClaimedAt), lt(schema.chapters.continuityClaimedAt, staleBefore))))
      .returning({ id: schema.chapters.id });

    if (!claimed) {
      const chapterRow = await db.query.chapters.findFirst({ where: chapterWhere, columns: { continuityApplied: true } });
      if (!chapterRow?.continuityApplied) throw AppError.internal(`[extractContinuity] Continuity finalization for chapter ${state.chapter} is already in progress`);
      logger.debug('finalization extractContinuity skipped: continuity already applied', { runId: state.runId, chapter: state.chapter });
      return { continuityDelta: null, nodeTrace: ['extractContinuity'] };
    }

    const contextPack = await continuityRoster(db, projectId);
    const ctx = continuityContext(state, projectId);
    const projectRow = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    // Containment decides the route here, not the plan: this prose is not walled off, so it goes to the standard map.
    const routed = chapterProjectConfig(projectRow as ProjectConfig | undefined, 'standard');

    // A failure that surfaces fast releases the claim immediately, so the next retry starts at once instead of
    // waiting out the whole lease; only a worker that dies without unwinding leaves the lease to expire.
    try {
      const delta = (await modelRouter.structured(
        PROMPT_REGISTRY.continuity,
        { contextPack, chapterNumber: state.chapter, chapterProse: state.prose },
        ctx,
        routed,
      )) as ContinuityOutput;

      // Upsert continuity proposal.
      const resolvedModel = modelRouter.resolveModel('continuity', routed);
      await db.transaction(async tx => {
        await assertOwnsClaim(tx, projectId, state.chapter, state.runId, 'extractContinuity');
        await tx
          .insert(schema.continuityProposals)
          .values({ projectId, chapter: state.chapter, proposal: delta as never, model: resolvedModel.model, status: 'pending' })
          .onConflictDoUpdate({
            target: [schema.continuityProposals.projectId, schema.continuityProposals.chapter],
            set: { proposal: sql`EXCLUDED.proposal`, model: sql`EXCLUDED.model`, status: 'pending', updatedAt: new Date() },
          });
      });

      return { continuityDelta: delta, nodeTrace: ['extractContinuity'] };
    } catch (err) {
      await releaseClaim(projectId, state.chapter, state.runId);
      throw err;
    }
  }

  async function applyContinuity(state: FinalizationState) {
    if (!state.continuityDelta) return { nodeTrace: ['applyContinuity'] };

    const projectId = BigInt(state.projectId);
    const delta = state.continuityDelta;

    // Apply every canon mutation, mark the proposal applied, and flag the chapter in one transaction. A
    // single failed row rolls the whole delta back and leaves the proposal `pending` — never a partial
    // canon that reports success. Errors propagate so the run fails (and resumes) rather than silently
    // swallowing.
    // A proposal holding low-confidence entries stays `pending` so it remains reachable for review — only a
    // delta that applied in full becomes `applied`.
    const hasHeldEntries = continuityHasHeldEntries(delta);

    // The claim taken in extractContinuity is released here on failure only: a committed transaction leaves
    // `continuityApplied` true, which makes the claim columns moot for every later read.
    try {
      await db.transaction(async tx => {
        await assertOwnsClaim(tx, projectId, state.chapter, state.runId, 'applyContinuity');
        await applyContinuityDelta(tx, projectId, state.chapter, delta);

        await tx
          .update(schema.continuityProposals)
          .set(hasHeldEntries ? { proposal: filterToHeldEntries(delta) as never, updatedAt: new Date() } : { status: 'applied', appliedAt: new Date(), updatedAt: new Date() })
          .where(and(eq(schema.continuityProposals.projectId, projectId), eq(schema.continuityProposals.chapter, state.chapter)));

        await tx
          .update(schema.chapters)
          .set({ continuityApplied: true, updatedAt: new Date() })
          .where(and(eq(schema.chapters.projectId, projectId), eq(schema.chapters.number, state.chapter)));
      });
    } catch (err) {
      await releaseClaim(projectId, state.chapter, state.runId);
      throw err;
    }

    return { nodeTrace: ['applyContinuity'] };
  }

  async function updateIndexes(state: FinalizationState) {
    const projectId = BigInt(state.projectId);

    // Best-effort — never fails the run.
    try {
      await indexingService.addProse(projectId, state.chapter, state.prose, state.isolated);
    } catch (err) {
      logger.warn('updateIndexes: addProse failed (non-fatal)', { err });
    }

    const touchedKeys = state.continuityDelta
      ? [...(state.continuityDelta.appeared ?? []), ...(state.continuityDelta.newEntities?.map(e => e.entityKey) ?? [])]
      : await reviewedEntityKeys(db, projectId, state.chapter).catch(err => {
          logger.warn('updateIndexes: reviewed entities not read (non-fatal)', { err });
          return [];
        });
    for (const key of touchedKeys) {
      try {
        const entity = await db.query.entities.findFirst({ where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, key)) });
        if (entity) {
          const text = [entity.name, entity.notes, entity.body].filter(Boolean).join('\n');
          if (text) await indexingService.addLore(projectId, 'character', key, text, new Date());
        }
      } catch (err) {
        logger.warn('updateIndexes: addLore failed (non-fatal)', { err, key });
      }
    }

    return { nodeTrace: ['updateIndexes'] };
  }

  async function advanceCursor(state: FinalizationState) {
    const projectId = BigInt(state.projectId);
    const project = await db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    const currentChapter = project?.storyCurrentChapter ?? 0;

    if (state.chapter > currentChapter) {
      await db.update(schema.projects).set({ storyCurrentChapter: state.chapter, updatedAt: new Date() }).where(eq(schema.projects.id, projectId));
      logger.debug('finalization advanceCursor', { runId: state.runId, chapter: state.chapter, previousCurrent: currentChapter });
    }

    return { nodeTrace: ['advanceCursor'] };
  }

  function finish() {
    return { outcome: 'completed', nodeTrace: ['finish'] };
  }

  return new StateGraph(ChapterFinalizationAnnotation)
    .addNode('guard', guard)
    .addNode('commitProse', commitProse)
    .addNode('extractContinuity', extractContinuity)
    .addNode('applyContinuity', applyContinuity)
    .addNode('updateIndexes', updateIndexes)
    .addNode('advanceCursor', advanceCursor)
    .addNode('finish', finish)
    .addEdge(START, 'guard')
    .addEdge('guard', 'commitProse')
    .addEdge('commitProse', 'extractContinuity')
    .addEdge('extractContinuity', 'applyContinuity')
    .addEdge('applyContinuity', 'updateIndexes')
    .addEdge('updateIndexes', 'advanceCursor')
    .addEdge('advanceCursor', 'finish')
    .addEdge('finish', END)
    .compile({ checkpointer });
}
