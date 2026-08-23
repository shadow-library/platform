import { and, desc, eq, ne, or, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService, StorageService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Illustration, type PrimaryDatabase, schema } from '@server/database';

import { ContextAssembler } from '../ai/context/context-assembler.service';
import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { type GeneratedImage, ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { illustrationComposePrompt } from '../ai/prompts/illustration-compose.prompt';
import { EntityService } from '../bible/entity/entity.service';
import { ChapterImageService } from '../generation/chapter-image.service';
import { ProjectService } from '../project/project/project.service';
import { applyInstructionEdit, hashInstructions, type InstructionEdit, renderPromptSpec } from './prompt-spec';

export interface StartIllustrationInput {
  subjectType: Illustration.SubjectType;
  subjectKey?: string | null;
  instruction?: string;
}

export interface PresentedCandidate {
  ref: string;
  imageUrl: string;
  createdAt: string;
  instructionsHash: string;
}

export interface PresentedIllustration {
  id: bigint;
  projectId: bigint;
  subjectType: Illustration.SubjectType;
  subjectKey: string | null;
  status: Illustration.Status;
  revision: number;
  instructions: string[];
  prompt: string;
  candidates: PresentedCandidate[];
  selectedRef: string | null;
  selectedUrl?: string;
  /** Set only when the composer had to invent the entity's appearance; the client decides whether to PATCH it onto the entity. */
  suggestedAppearance?: string;
  createdAt: Date;
  updatedAt: Date;
}

const CANDIDATE_COUNT = 2;

const TARGET_SUBJECT: Record<Illustration.SaveTarget, Illustration.SubjectType> = {
  portrait: 'entity',
  gallery: 'entity',
  chapter: 'chapter',
  cover: 'cover',
};

@Injectable()
export class IllustrationService {
  private readonly logger = Logger.getLogger(APP_NAME, IllustrationService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly storage: StorageService,
    private readonly modelRouter: ModelRouterService,
    private readonly assembler: ContextAssembler,
    private readonly workflowRuns: WorkflowRunService,
    private readonly entityService: EntityService,
    private readonly chapterImageService: ChapterImageService,
    private readonly projectService: ProjectService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async start(projectId: bigint, input: StartIllustrationInput): Promise<PresentedIllustration> {
    const subjectKey = this.normalizeSubjectKey(input.subjectType, input.subjectKey);
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();

    const instructions = input.instruction ? [input.instruction] : [];
    const target = `${input.subjectType}:${subjectKey ?? 'cover'}`;

    const { result } = await this.workflowRuns.runChain(projectId, 'illustration', target, { subjectType: input.subjectType, subjectKey, instructions }, async runId => {
      const promptSpec = await this.compose(projectId, project, input.subjectType, subjectKey, instructions, runId);
      const candidates = await this.generate(projectId, project, promptSpec, runId, []);
      return { promptSpec, candidates };
    });

    const [created] = await this.db
      .insert(schema.illustrations)
      .values({
        projectId,
        subjectType: input.subjectType,
        subjectKey,
        promptSpec: result.promptSpec,
        candidates: result.candidates,
        ownerId: project.ownerId,
      })
      .returning()
      .catch(err => this.databaseService.translateError(err));

    if (!created) throw AppErrorCode.S001.create();
    this.logger.info('illustration started', { projectId, illustrationId: created.id, target, candidates: result.candidates.length });
    return this.present(created);
  }

  /**
   * Regenerates from a structurally edited prompt spec. The currently selected candidate rides along as
   * an image-to-image reference so the refinement adjusts the picture the author is looking at rather
   * than rolling a fresh one; the appearance anchor holds the subject steady when the provider ignores it.
   */
  async refine(projectId: bigint, illustrationId: bigint, edit: InstructionEdit): Promise<PresentedIllustration> {
    const row = await this.getActive(projectId, illustrationId);
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();

    const promptSpec: Illustration.PromptSpec = { ...row.promptSpec, instructions: applyInstructionEdit(row.promptSpec.instructions, edit) };
    const referenceRef = row.selectedRef ?? row.candidates.at(-1)?.ref;

    const { result } = await this.workflowRuns.runChain(projectId, 'illustration', `refine:${illustrationId}`, { edit }, runId =>
      this.generate(projectId, project, promptSpec, runId, referenceRef ? [referenceRef] : []),
    );

    const [updated] = await this.db
      .update(schema.illustrations)
      .set({ promptSpec, candidates: [...row.candidates, ...result], revision: row.revision + 1, selectedRef: null, updatedAt: new Date() })
      .where(eq(schema.illustrations.id, illustrationId))
      .returning();

    if (!updated) throw AppErrorCode.ILL_001.create();
    this.logger.info('illustration refined', { projectId, illustrationId, revision: updated.revision });
    return this.present(updated);
  }

  async select(projectId: bigint, illustrationId: bigint, ref: string): Promise<PresentedIllustration> {
    const row = await this.getActive(projectId, illustrationId);
    if (!row.candidates.some(candidate => candidate.ref === ref)) throw AppErrorCode.ILL_004.create();

    const [updated] = await this.db.update(schema.illustrations).set({ selectedRef: ref, updatedAt: new Date() }).where(eq(schema.illustrations.id, illustrationId)).returning();
    if (!updated) throw AppErrorCode.ILL_001.create();
    return this.present(updated);
  }

  async save(projectId: bigint, illustrationId: bigint, target: Illustration.SaveTarget): Promise<PresentedIllustration> {
    const row = await this.getActive(projectId, illustrationId);
    if (!row.selectedRef) throw AppErrorCode.ILL_003.create();
    if (TARGET_SUBJECT[target] !== row.subjectType) throw AppErrorCode.ILL_005.create();

    await this.writeTarget(projectId, row, target, row.selectedRef);

    const [updated] = await this.db.update(schema.illustrations).set({ status: 'saved', updatedAt: new Date() }).where(eq(schema.illustrations.id, illustrationId)).returning();

    if (!updated) throw AppErrorCode.ILL_001.create();
    await this.collect(
      illustrationId,
      row.candidates.filter(candidate => candidate.ref !== row.selectedRef).map(candidate => candidate.ref),
    );

    this.logger.info('illustration saved', { projectId, illustrationId, target, ref: row.selectedRef });
    return this.present(updated);
  }

  async discard(projectId: bigint, illustrationId: bigint): Promise<PresentedIllustration> {
    const row = await this.getActive(projectId, illustrationId);

    const [updated] = await this.db
      .update(schema.illustrations)
      .set({ status: 'discarded', selectedRef: null, updatedAt: new Date() })
      .where(eq(schema.illustrations.id, illustrationId))
      .returning();

    if (!updated) throw AppErrorCode.ILL_001.create();
    await this.collect(
      illustrationId,
      row.candidates.map(candidate => candidate.ref),
    );

    this.logger.info('illustration discarded', { projectId, illustrationId });
    return this.present(updated);
  }

  /** Every illustration for a subject, newest first — a saved one can be re-rolled from its stored prompt spec. */
  async list(projectId: bigint, filter?: { subjectType?: Illustration.SubjectType; subjectKey?: string }): Promise<PresentedIllustration[]> {
    const conditions = [eq(schema.illustrations.projectId, projectId)];
    if (filter?.subjectType) conditions.push(eq(schema.illustrations.subjectType, filter.subjectType));
    if (filter?.subjectKey) conditions.push(eq(schema.illustrations.subjectKey, filter.subjectKey));

    const rows = await this.db.query.illustrations.findMany({ where: and(...conditions), orderBy: [desc(schema.illustrations.id)] });
    return rows.map(row => this.present(row));
  }

  private async compose(
    projectId: bigint,
    project: ProjectConfig,
    subjectType: Illustration.SubjectType,
    subjectKey: string | null,
    instructions: string[],
    runId: string,
  ): Promise<Illustration.PromptSpec> {
    const [pack, anchor] = await Promise.all([this.assembler.forIllustration(projectId, subjectType, subjectKey), this.loadAppearance(projectId, subjectType, subjectKey)]);

    const composed = await this.modelRouter.structured(
      illustrationComposePrompt,
      {
        contextPack: pack.rendered,
        subjectType,
        subjectLabel: subjectKey ?? 'project cover',
        instructions: instructions.length > 0 ? instructions.map((text, index) => `${index + 1}. ${text}`).join('\n') : '(none)',
      },
      { projectId, runId, node: 'compose', promptKey: illustrationComposePrompt.key, promptVersion: illustrationComposePrompt.version, role: 'illustration' },
      project,
    );

    return {
      basePrompt: composed.basePrompt,
      subjectFraming: composed.subjectFraming,
      styleNotes: composed.styleNotes,
      negativePrompt: composed.negativePrompt,
      appearanceAnchor: anchor ?? composed.appearance,
      appearanceDerived: !anchor && Boolean(composed.appearance),
      instructions,
      promptKey: illustrationComposePrompt.key,
      promptVersion: illustrationComposePrompt.version,
    };
  }

  private async generate(
    projectId: bigint,
    project: ProjectConfig,
    promptSpec: Illustration.PromptSpec,
    runId: string,
    referenceRefs: string[],
  ): Promise<Illustration.Candidate[]> {
    const inputReferences = await Promise.all(referenceRefs.map(ref => this.toDataUrl(ref)));
    const images = await this.modelRouter.images(
      { prompt: renderPromptSpec(promptSpec), n: CANDIDATE_COUNT, inputReferences },
      { projectId, runId, node: 'generate', promptKey: promptSpec.promptKey, promptVersion: promptSpec.promptVersion, role: 'image' },
      project,
    );

    const instructionsHash = hashInstructions(promptSpec.instructions);
    return Promise.all(images.map(image => this.persist(image, instructionsHash)));
  }

  private async persist(image: GeneratedImage, instructionsHash: string): Promise<Illustration.Candidate> {
    const ref = await this.storage.save(image.bytes, { contentType: image.contentType });
    return { ref, createdAt: new Date().toISOString(), instructionsHash };
  }

  private async toDataUrl(ref: string): Promise<string> {
    const object = await this.storage.read(ref);
    return `data:${object.contentType};base64,${Buffer.from(object.bytes).toString('base64')}`;
  }

  private loadAppearance(projectId: bigint, subjectType: Illustration.SubjectType, subjectKey: string | null): Promise<string | null> {
    if (subjectType !== 'entity' || !subjectKey) return Promise.resolve(null);
    return this.db.query.entities
      .findFirst({ where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, subjectKey)), columns: { appearance: true } })
      .then(entity => entity?.appearance ?? null);
  }

  private normalizeSubjectKey(subjectType: Illustration.SubjectType, subjectKey?: string | null): string | null {
    if (subjectType === 'cover') return null;
    if (!subjectKey) throw AppErrorCode.ILL_006.create();
    if (subjectType === 'chapter' && !/^\d+$/.test(subjectKey)) throw AppErrorCode.ILL_006.create();
    return subjectKey;
  }

  private async getActive(projectId: bigint, illustrationId: bigint): Promise<Illustration.Row> {
    const row = await this.db.query.illustrations.findFirst({ where: and(eq(schema.illustrations.id, illustrationId), eq(schema.illustrations.projectId, projectId)) });
    if (!row) throw AppErrorCode.ILL_001.create();
    if (row.status !== 'active') throw AppErrorCode.ILL_002.create();
    return row;
  }

  private writeTarget(projectId: bigint, row: Illustration.Row, target: Illustration.SaveTarget, ref: string): Promise<unknown> {
    switch (target) {
      case 'portrait':
        return this.entityService.setImageRef(projectId, row.subjectKey as string, ref);
      case 'gallery':
        return this.entityService.addImageRef(projectId, row.subjectKey as string, ref);
      case 'chapter':
        return this.chapterImageService.addRef(projectId, Number(row.subjectKey), ref);
      case 'cover':
        return this.projectService.setCoverRef(projectId, ref);
    }
  }

  /**
   * Deletes candidate objects nothing else points at. Storage is content-addressed and shared across
   * projects, so a ref is only removed once no saved target and no other live illustration references it.
   */
  private async collect(illustrationId: bigint, refs: string[]): Promise<void> {
    for (const ref of refs) {
      if (await this.isReferenced(ref, illustrationId)) continue;
      await this.storage.delete(ref).catch(err => this.logger.warn('Failed to delete an orphaned illustration object', { ref, err }));
    }
  }

  private async isReferenced(ref: string, excludeIllustrationId: bigint): Promise<boolean> {
    const counts = await Promise.all([
      this.db.$count(schema.entities, eq(schema.entities.imagePath, ref)),
      this.db.$count(schema.entityImages, eq(schema.entityImages.imagePath, ref)),
      this.db.$count(schema.chapterImages, eq(schema.chapterImages.imagePath, ref)),
      this.db.$count(schema.projects, eq(schema.projects.coverImagePath, ref)),
      this.db.$count(
        schema.illustrations,
        and(
          ne(schema.illustrations.id, excludeIllustrationId),
          ne(schema.illustrations.status, 'discarded'),
          // Unrolled rather than `@> '[{"ref":…}]'::jsonb`: the bun-sql driver binds a JSON-string
          // parameter in a form the containment operator never matches.
          or(eq(schema.illustrations.selectedRef, ref), sql`EXISTS (SELECT 1 FROM jsonb_array_elements(${schema.illustrations.candidates}) e WHERE e->>'ref' = ${ref})`),
        ),
      ),
    ]);
    return counts.some(count => count > 0);
  }

  private present(row: Illustration.Row): PresentedIllustration {
    return {
      id: row.id,
      projectId: row.projectId,
      subjectType: row.subjectType,
      subjectKey: row.subjectKey,
      status: row.status,
      revision: row.revision,
      instructions: row.promptSpec.instructions,
      prompt: renderPromptSpec(row.promptSpec),
      candidates: row.candidates.map(candidate => ({ ...candidate, imageUrl: this.storage.getPublicUrl(candidate.ref) })),
      selectedRef: row.selectedRef,
      selectedUrl: this.storage.getPublicUrl(row.selectedRef),
      suggestedAppearance: row.promptSpec.appearanceDerived ? row.promptSpec.appearanceAnchor : undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
