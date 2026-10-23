import { and, asc, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import {
  briefContentHash,
  composePlanBody,
  enforcePlanWrite,
  lockProjectPlan,
  nearestVolumeKey,
  normalizeBriefScenes,
  normalizeStringList,
  planFrontier,
  resetApprovalForPlanChange,
  validateBriefScenes,
  withParsedContract,
  type WithParsedContract,
} from '@server/common';
import { type Generation, type PrimaryDatabase, schema } from '@server/database';

import { defaultChapterMode } from '../ai/chapter-route';
import { type EndingContractSchema } from '../ai/schemas/ending-contract.schema';
import { type UpdateBriefBody } from './generation.dto';

function handEditedEndingContract(contract: EndingContractSchema): EndingContractSchema {
  const emotionalBeat = contract.emotionalBeat.trim();
  const openQuestion = contract.openQuestion.trim();
  const handoffState = contract.handoffState.trim();
  const missing = Object.entries({ emotionalBeat, openQuestion, handoffState }).flatMap(([key, value]) => (value ? [] : [key]));
  if (missing.length > 0) throw AppErrorCode.BRF_003.create({ fields: missing.join(', ') });
  const mustNotResolve = (contract.mustNotResolve ?? []).map(entry => entry.trim()).filter(Boolean);
  return { hookType: contract.hookType, emotionalBeat, openQuestion, handoffState, mustNotResolve };
}

@Injectable()
export class BriefService {
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  listBriefs(projectId: bigint): Promise<Pick<Generation.Brief, 'chapter' | 'volumeKey' | 'title' | 'staleReason' | 'densityRisk' | 'writeMode' | 'insertedAt' | 'updatedAt'>[]> {
    return this.db.query.briefs.findMany({
      where: eq(schema.briefs.projectId, projectId),
      columns: { chapter: true, volumeKey: true, title: true, staleReason: true, densityRisk: true, writeMode: true, insertedAt: true, updatedAt: true },
      orderBy: asc(schema.briefs.chapter),
    });
  }

  async getBrief(projectId: bigint, chapter: number): Promise<WithParsedContract<Generation.Brief>> {
    const brief = await this.db.query.briefs.findFirst({ where: and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)) });
    if (!brief) throw AppErrorCode.DRF_001.create();
    return withParsedContract(brief);
  }

  async updateBrief(projectId: bigint, chapter: number, body: UpdateBriefBody): Promise<WithParsedContract<Generation.Brief>> {
    const sceneErrors = body.scenes ? validateBriefScenes(body.scenes) : [];
    if (sceneErrors.length > 0) throw AppErrorCode.BRF_004.create({ reason: sceneErrors.join('; ') });
    const scenes = body.scenes === undefined ? undefined : body.scenes && normalizeBriefScenes(body.scenes);
    const planBody = scenes === undefined ? body.body : composePlanBody(body.body, scenes ?? []);
    const edits: Partial<typeof schema.briefs.$inferInsert> = { body: planBody, densityRisk: null };
    const title = body.title?.trim();
    if (title) edits.title = title;
    if (body.knowledgeContract) edits.knowledgeContract = { pov: body.knowledgeContract.pov, learns: body.knowledgeContract.learns ?? [] };
    if (body.endingContract !== undefined) edits.endingContract = body.endingContract && handEditedEndingContract(body.endingContract);
    if (body.chapterPurpose !== undefined) edits.chapterPurpose = body.chapterPurpose.trim() || null;
    if (body.pov !== undefined) edits.pov = body.pov.trim() || null;
    if (body.guidance !== undefined) edits.guidance = body.guidance.trim() || null;
    if (body.direction !== undefined) edits.direction = body.direction?.trim() || null;
    if (body.contentMode !== undefined) edits.contentMode = body.contentMode;
    if (scenes !== undefined) edits.scenes = scenes;
    if (body.claimedMilestones !== undefined) edits.claimedMilestones = body.claimedMilestones && normalizeStringList(body.claimedMilestones);
    if (body.isEnding !== undefined) edits.isEnding = body.isEnding;

    const result = await this.db.transaction(async tx => {
      await lockProjectPlan(tx, projectId);
      if (chapter <= (await planFrontier(tx, projectId))) throw AppErrorCode.PLN_005.create({ chapter });
      const [existing] = await tx
        .select()
        .from(schema.briefs)
        .where(and(eq(schema.briefs.projectId, projectId), eq(schema.briefs.chapter, chapter)))
        .for('update');
      const approvedTerms = existing && { knowledgeContract: existing.knowledgeContract, claimedMilestones: existing.claimedMilestones };
      const revision = (existing?.revision ?? 0) + 1;
      const volumeKey = existing ? existing.volumeKey : await nearestVolumeKey(tx, projectId, chapter);
      const created = existing ? {} : { contentMode: await defaultChapterMode(tx, projectId) };
      const contentHash = briefContentHash({ ...existing, ...created, chapter, volumeKey, ...edits });
      const [upserted] = await tx
        .insert(schema.briefs)
        .values({ knowledgeContract: null, ...created, ...edits, projectId, chapter, volumeKey, body: planBody, revision, contentHash, handEdited: true })
        .onConflictDoUpdate({
          target: [schema.briefs.projectId, schema.briefs.chapter],
          set: { ...edits, revision, contentHash, handEdited: true, updatedAt: new Date() },
        })
        .returning();
      await enforcePlanWrite(tx, projectId, [chapter]);
      if (upserted) await resetApprovalForPlanChange(tx, projectId, chapter, approvedTerms, upserted);
      return upserted;
    });
    if (!result) throw AppErrorCode.DRF_001.create();
    return withParsedContract(result);
  }
}
