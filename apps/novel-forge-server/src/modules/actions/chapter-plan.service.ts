import { and, asc, eq, gte, lte, ne } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { loadPlanState, nearestVolumeKey, type PlanClaims } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type DbExecutor, type PrimaryDatabase, schema } from '@server/database';

import { ContextAssembler } from '../ai/context/context-assembler.service';
import { ModelRouterService } from '../ai/model-router.service';
import { chapterPlanPrompt, outlineWordTargetVars } from '../ai/prompts';
import { type ChapterPlanOutput } from '../ai/schemas/chapter-plan.schema';
import { resolveWordTarget } from '../eval/deterministic-metrics';
import { PluginPolicyService } from '../plugins/plugin-policy.service';
import {
  chapterPlanOp,
  emptyPlanOp,
  planAdvice,
  type PlanCardOp,
  type PlanFact,
  planRationale,
  renderObligations,
  renderPlanMilestones,
  resolveScenePovs,
  selectObligations,
  vetPlan,
} from './chapter-plan';

export interface ChapterPlanRequest {
  chapter: number;
  /** What the author says happens in the chapter, found in their own message; it outranks a chosen direction. */
  intent?: string;
  /** The direction the author picked from those the chat offered. */
  direction?: string;
  /** An empty plan for the author to fill in: no model call, and only for a chapter with no plan yet. */
  empty?: boolean;
}

const NONE = '(none)';
const ENDING = 'The author plans this chapter as the ending of the book: the ending may be planned into it.';
const NOT_ENDING = 'This chapter is not the ending.';

/** An empty plan is for a chapter with nothing planned: over an existing plan it would only blank what the author can edit instead. */
export async function assertEmptyPlanAllowed(db: Pick<DbExecutor, 'query'>, projectId: bigint, chapter: number): Promise<void> {
  const existing = await db.query.briefs.findFirst({ columns: { id: true }, where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) });
  if (existing) throw AppErrorCode.PLN_007.create({ chapter: String(chapter) });
}

/** Plans the next chapter as one card: the obligations recap, per-scene points of view, and only the milestone claims and reveals the rule allows. */
@Injectable()
export class ChapterPlanService {
  private readonly logger = Logger.getLogger(APP_NAME, ChapterPlanService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly modelRouter: ModelRouterService,
    private readonly contextAssembler: ContextAssembler,
    private readonly pluginPolicy: PluginPolicyService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async plan(projectId: bigint, request: ChapterPlanRequest, runId: string): Promise<PlanCardOp> {
    const { chapter } = request;
    const intent = request.intent?.trim() || null;
    const direction = request.direction?.trim() || null;
    const [existing, previous, threads, mysteries, state, milestoneStateRows, volumeStateRows] = await Promise.all([
      this.db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) }),
      this.db.query.briefs.findFirst({ columns: { endingContract: true }, where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter - 1)) }),
      this.db.query.plotThreads.findMany({ where: eq(schema.plotThreads.projectId, projectId) }),
      this.db.query.mysteries.findMany({ where: eq(schema.mysteries.projectId, projectId) }),
      loadPlanState(this.db, projectId),
      this.db.query.milestones.findMany({ columns: { milestoneKey: true, state: true }, where: eq(schema.milestones.projectId, projectId) }),
      this.db.query.volumes.findMany({ columns: { volumeKey: true, state: true }, where: eq(schema.volumes.projectId, projectId) }),
    ]);
    if (request.empty && existing) throw AppErrorCode.PLN_007.create({ chapter: String(chapter) });
    const volumeKey = existing?.volumeKey ?? (await nearestVolumeKey(this.db, projectId, chapter));
    const volume = volumeKey ? await this.db.query.volumes.findFirst({ where: and(eq(schema.volumes.projectId, projectId), eq(schema.volumes.volumeKey, volumeKey)) }) : undefined;
    const milestoneStates = new Map(milestoneStateRows.map(row => [row.milestoneKey, row.state]));
    const volumeStates = new Map(volumeStateRows.map(row => [row.volumeKey, row.state]));
    const obligations = selectObligations({ chapter, previousEnding: previous?.endingContract, threads, mysteries, volume: volume ?? null, milestoneStates, volumeStates });
    const steer = intent ?? direction;
    if (request.empty) return emptyPlanOp({ chapter, steer, rationale: planRationale(obligations) });

    const isEnding = existing?.isEnding ?? false;
    const claims: PlanClaims = { chapter, volumeKey, isEnding, claimedMilestones: [] };
    const [facts, milestones, characters, project, catalog] = await Promise.all([
      this.db.query.canonFacts.findMany({
        columns: { factKey: true, revealChapter: true, unlock: true, source: true, terms: true, writerNote: true },
        where: eq(schema.canonFacts.projectId, projectId),
      }),
      this.db.query.milestones.findMany({ where: eq(schema.milestones.projectId, projectId), orderBy: asc(schema.milestones.milestoneKey) }),
      this.db.query.entities.findMany({ columns: { entityKey: true }, where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.type, 'character')) }),
      this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) }),
      this.catalog(projectId, chapter, volumeKey),
    ]);

    const planFacts = facts as PlanFact[];
    const prompt = { ...chapterPlanPrompt, advise: (output: ChapterPlanOutput) => planAdvice(output, claims, planFacts, state) };
    const vars = {
      catalog: catalog.rendered,
      obligations: renderObligations(obligations),
      milestones: renderPlanMilestones(milestones, planFacts, claims, state),
      chapterNumber: String(chapter),
      endingNote: isEnding ? ENDING : NOT_ENDING,
      ...outlineWordTargetVars(resolveWordTarget(project)),
      authorIntent: intent ?? NONE,
      chosenDirection: direction ?? NONE,
    };
    const ctx = { projectId, runId, promptKey: prompt.key, promptVersion: prompt.version, role: 'outline', chapter };
    const raw = await this.modelRouter.structured(prompt, vars, ctx, project as never, catalog.policy);

    const vetted = vetPlan(raw, claims, planFacts, state);
    if (vetted.droppedClaims.length > 0 || vetted.sanitised.length > 0)
      this.logger.warn('plan: kept the plan within the reveal rule', { projectId, chapter, droppedClaims: vetted.droppedClaims, sanitised: vetted.sanitised });
    const plan = resolveScenePovs(vetted.plan, new Set(characters.map(character => character.entityKey)));
    const { kept: contextRefs, dropped } = await this.contextAssembler.sanitizeOutlinedRefs(projectId, plan.requiredContext ?? []);
    if (dropped.length > 0) this.logger.warn('plan: dropped context refs', { projectId, chapter, dropped });

    const rationale = planRationale(obligations, vetted.moves);
    return chapterPlanOp({ chapter, steer, rationale, existing: existing ?? null, vetted: { ...vetted, plan }, contextRefs });
  }

  private async catalog(projectId: bigint, chapter: number, volumeKey: string | null) {
    const policy = await this.pluginPolicy.resolve(projectId, { role: 'outline', chapter });
    const [pack, neighbours] = await Promise.all([
      this.contextAssembler.forOutline(projectId, chapter, { policy, span: { start: chapter, end: chapter }, volumeKey }),
      this.db.query.briefs.findMany({
        where: and(eq(schema.briefs.projectId, projectId), gte(schema.briefs.chapter, chapter - 1), lte(schema.briefs.chapter, chapter + 1), ne(schema.briefs.chapter, chapter)),
        orderBy: asc(schema.briefs.chapter),
      }),
    ]);
    const surrounding = neighbours.map(brief => `## Chapter ${brief.chapter}: ${brief.title ?? ''}\n${brief.body}`).join('\n\n');
    return { policy, rendered: [pack.rendered, surrounding && `## Surrounding chapters\n${surrounding}`].filter(Boolean).join('\n\n') };
  }
}
