import { and, desc, eq, ne, type SQL, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { DatabaseService, StorageService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Illustration, type PrimaryDatabase, schema } from '@server/database';

import { AppearanceDescriberService, type AppearanceDescription } from '../ai/appearance-describer.service';
import { ContextAssembler } from '../ai/context/context-assembler.service';
import { WorkflowRunService } from '../ai/graphs/workflow-run.service';
import { type GeneratedImage, ModelRouterService, type ProjectConfig } from '../ai/model-router.service';
import { illustrationComposePrompt } from '../ai/prompts/illustration-compose.prompt';
import { EntityService } from '../bible/entity/entity.service';
import { ChapterImageService } from '../generation/chapter-image.service';
import { PluginPolicyService } from '../plugins/plugin-policy.service';
import { ProjectService } from '../project/project/project.service';
import {
  IllustrationReferenceService,
  type ReferenceOptions,
  type ReferenceRequest,
  type ReferenceView,
  type ReferenceWarning,
  type ResolvedReferences,
  summarizeReferences,
} from './illustration-reference.service';
import { applyInstructionEdit, hashInstructions, type InstructionEdit, renderPromptSpec, renderReferenceManifest } from './prompt-spec';
import { illustrationReferences, UPLOADED_COVER_PROMPT_KEY } from './uploaded-cover';

export interface StartIllustrationInput {
  subjectType: Illustration.SubjectType;
  subjectKey?: string | null;
  instruction?: string;
  references?: ReferenceRequest[];
  /** Defaults to true. */
  autoReferences?: boolean;
}

export interface UpdateReferencesInput {
  references: ReferenceRequest[];
  /** Keeps the stored flag when omitted. */
  autoReferences?: boolean;
}

export interface ReferenceOptionsRequest {
  subjectType: Illustration.SubjectType;
  subjectKey?: string | null;
  limit?: number;
}

interface PresentedCandidate {
  ref: string;
  imageUrl: string;
  createdAt: string;
  instructionsHash: string;
  referenceRefs: string[];
  references: ReferenceView[];
}

export interface PresentedIllustration {
  id: bigint;
  projectId: bigint;
  subjectType: Illustration.SubjectType;
  subjectKey: string | null;
  status: Illustration.Status;
  revision: number;
  origin: Illustration.Origin;
  instructions: string[];
  prompt: string;
  candidates: PresentedCandidate[];
  references: ReferenceView[];
  attachedReferences: ReferenceRequest[];
  autoReferences: boolean;
  selectedRef: string | null;
  selectedUrl?: string;
  /** Set only when the composer had to invent the entity's appearance; the client decides whether to PATCH it onto the entity. */
  suggestedAppearance?: string;
  appearanceDescription?: Illustration.AppearanceDescription;
  createdAt: Date;
  updatedAt: Date;
}

/** A presented illustration plus what resolving its references for this request skipped or merged; the warnings are never persisted. */
export interface IllustrationRound extends PresentedIllustration {
  referenceWarnings: ReferenceWarning[];
}

interface EntitySubject {
  name: string;
  appearance: string | null;
}

interface DescribedAppearance extends AppearanceDescription {
  referenceIndex: number;
}

interface ComposeRequest {
  subjectType: Illustration.SubjectType;
  subjectKey: string | null;
  instructions: string[];
  anchor: string | null;
  references: Illustration.Reference[];
  described?: DescribedAppearance;
}

const CANDIDATE_COUNT = 2;
const DEFAULT_REFERENCE_OPTIONS_LIMIT = 50;

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
    private readonly pluginPolicy: PluginPolicyService,
    private readonly referenceService: IllustrationReferenceService,
    private readonly describer: AppearanceDescriberService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async start(projectId: bigint, input: StartIllustrationInput): Promise<IllustrationRound> {
    const { subjectType } = input;
    const subjectKey = this.normalizeSubjectKey(subjectType, input.subjectKey);
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();

    const instructions = input.instruction ? [input.instruction] : [];
    const attachedReferences = normalizeAttached(input.references ?? []);
    const autoReferences = input.autoReferences ?? true;
    const target = `${subjectType}:${subjectKey ?? 'cover'}`;
    const entity = await this.loadEntity(projectId, subjectType, subjectKey);
    const anchor = entity?.appearance?.trim() || null;
    const resolved = await this.referenceService.resolve({ projectId, project, subjectType, subjectKey, attached: attachedReferences, autoReferences });

    const chainInput = { subjectType, subjectKey, instructions, references: attachedReferences, autoReferences };
    const { result } = await this.workflowRuns.runChain(projectId, 'illustration', target, chainInput, async runId => {
      const described = anchor ? undefined : await this.describeOnce(projectId, project, entity, resolved, runId);
      const composed = await this.compose(projectId, project, { subjectType, subjectKey, instructions, anchor, references: resolved.references, described }, runId);
      const promptSpec: Illustration.PromptSpec = { ...composed, attachedReferences, autoReferences };
      const candidates = await this.generate(projectId, project, promptSpec, runId, resolved);
      return { promptSpec, candidates, described: Boolean(described) };
    });

    const [created] = await this.db
      .insert(schema.illustrations)
      .values({
        projectId,
        subjectType,
        subjectKey,
        promptSpec: result.promptSpec,
        candidates: result.candidates,
        references: resolved.references,
        ownerKind: project.ownerKind,
        ownerId: project.ownerId,
      })
      .returning()
      .catch(err => this.databaseService.translateError(err));

    if (!created) throw AppErrorCode.S001.create();
    this.logger.info('illustration started', {
      projectId,
      illustrationId: created.id,
      target,
      candidates: result.candidates.length,
      references: summarizeReferences(resolved),
      described: result.described,
    });
    return { ...this.present(created), referenceWarnings: resolved.warnings };
  }

  /**
   * Regenerates from a structurally edited prompt spec. The currently selected candidate rides along as
   * an image-to-image reference so the refinement adjusts the picture the author is looking at rather
   * than rolling a fresh one; the appearance anchor holds the subject steady when the provider ignores it.
   */
  async refine(projectId: bigint, illustrationId: bigint, edit: InstructionEdit): Promise<IllustrationRound> {
    const row = await this.getActive(projectId, illustrationId);
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();

    const promptSpec: Illustration.PromptSpec = { ...row.promptSpec, instructions: applyInstructionEdit(row.promptSpec.instructions, edit) };
    const resolved = await this.referenceService.resolve({
      projectId,
      project,
      subjectType: row.subjectType,
      subjectKey: row.subjectKey,
      attached: [],
      carried: promptSpec.attachedReferences ?? [],
      autoReferences: promptSpec.autoReferences ?? true,
      editSourceRef: editSourceOf(row),
    });

    const { result } = await this.workflowRuns.runChain(projectId, 'illustration', `refine:${illustrationId}`, { edit }, runId =>
      this.generate(projectId, project, promptSpec, runId, resolved),
    );

    const [updated] = await this.db
      .update(schema.illustrations)
      .set({
        promptSpec: mergePromptSpec({ instructions: promptSpec.instructions }),
        candidates: [...row.candidates, ...result],
        references: mergeReferenceLedger(row.references, resolved.references),
        revision: row.revision + 1,
        selectedRef: null,
        updatedAt: new Date(),
      })
      .where(eq(schema.illustrations.id, illustrationId))
      .returning();

    if (!updated) throw AppErrorCode.ILL_001.create();
    this.logger.info('illustration refined', { projectId, illustrationId, revision: updated.revision, references: summarizeReferences(resolved) });
    return { ...this.present(updated), referenceWarnings: resolved.warnings };
  }

  /**
   * Replaces the author's attached references and auto flag without generating. References already attached are
   * carried, so they only warn when out of slots; newly attached ones must fit beside the edit source the next refinement sends.
   */
  async updateReferences(projectId: bigint, illustrationId: bigint, input: UpdateReferencesInput): Promise<IllustrationRound> {
    const row = await this.getActive(projectId, illustrationId);
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();

    const requested = normalizeAttached(input.references);
    const stored = row.promptSpec.attachedReferences ?? [];
    const isStored = (request: ReferenceRequest): boolean => stored.some(entry => entry.source === request.source && entry.sourceId === request.sourceId);
    const autoReferences = input.autoReferences ?? row.promptSpec.autoReferences ?? true;

    const resolved = await this.referenceService.resolve({
      projectId,
      project,
      subjectType: row.subjectType,
      subjectKey: row.subjectKey,
      attached: requested.filter(request => !isStored(request)),
      carried: requested.filter(isStored),
      autoReferences,
      editSourceRef: editSourceOf(row),
      load: 'metadata',
    });

    const [updated] = await this.db
      .update(schema.illustrations)
      .set({ promptSpec: mergePromptSpec({ attachedReferences: requested, autoReferences }), updatedAt: new Date() })
      .where(eq(schema.illustrations.id, illustrationId))
      .returning();

    if (!updated) throw AppErrorCode.ILL_001.create();
    this.logger.info('illustration references updated', { projectId, illustrationId, attached: requested.length, autoReferences, warnings: resolved.warnings.length });
    return { ...this.present(updated), referenceWarnings: resolved.warnings };
  }

  async referenceOptions(projectId: bigint, query: ReferenceOptionsRequest): Promise<ReferenceOptions> {
    const subjectKey = this.normalizeSubjectKey(query.subjectType, query.subjectKey);
    const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId) });
    if (!project) throw AppErrorCode.PRJ_001.create();
    return this.referenceService.options({ projectId, project, subjectType: query.subjectType, subjectKey, limit: query.limit ?? DEFAULT_REFERENCE_OPTIONS_LIMIT });
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

  private async compose(projectId: bigint, project: ProjectConfig, request: ComposeRequest, runId: string): Promise<Illustration.PromptSpec> {
    const { subjectType, subjectKey, instructions, anchor, described } = request;
    const policy = await this.pluginPolicy.resolve(projectId, { role: 'illustration' });
    const pack = await this.assembler.forIllustration(projectId, subjectType, subjectKey, { policy });

    const composed = await this.modelRouter.structured(
      illustrationComposePrompt,
      {
        contextPack: pack.rendered,
        subjectType,
        subjectLabel: subjectKey ?? 'project cover',
        references: composeReferenceInput(request.references, described),
        instructions: instructions.length > 0 ? instructions.map((text, index) => `${index + 1}. ${text}`).join('\n') : '(none)',
      },
      { projectId, runId, node: 'compose', promptKey: illustrationComposePrompt.key, promptVersion: illustrationComposePrompt.version, role: 'illustration' },
      project,
      policy,
    );

    const derived = described?.appearance ?? composed.appearance;
    const description = described ? { confidence: described.confidence, ...(described.ambiguity ? { ambiguity: described.ambiguity } : {}) } : undefined;
    return {
      basePrompt: composed.basePrompt,
      subjectFraming: composed.subjectFraming,
      styleNotes: composed.styleNotes,
      negativePrompt: composed.negativePrompt,
      appearanceAnchor: anchor ?? derived,
      appearanceDerived: !anchor && Boolean(derived),
      ...(description ? { appearanceDescription: description } : {}),
      instructions,
      promptKey: illustrationComposePrompt.key,
      promptVersion: illustrationComposePrompt.version,
    };
  }

  /** Best-effort: a failed description only costs the composer its anchor, so it never blocks the generation. */
  private async describeOnce(
    projectId: bigint,
    project: ProjectConfig,
    entity: EntitySubject | null,
    resolved: ResolvedReferences,
    runId: string,
  ): Promise<DescribedAppearance | undefined> {
    if (!entity) return undefined;
    const referenceIndex = resolved.references.findIndex(reference => reference.role === 'likeness');
    const reference = resolved.references[referenceIndex];
    const imageDataUrl = resolved.dataUrls[referenceIndex];
    if (!reference || !imageDataUrl) return undefined;

    try {
      const description = await this.describer.describe({ projectId, project, imageDataUrl, subjectLabel: entity.name, note: reference.note, runId });
      return { ...description, referenceIndex };
    } catch (error) {
      if (isProgrammingError(error)) throw error;
      const detail = AppError.is(error) ? { code: error.code } : { name: errorName(error), message: errorMessage(error) };
      this.logger.warn('appearance description failed; composing without it', { projectId, runId, source: reference.source, ...detail });
      return undefined;
    }
  }

  private async generate(
    projectId: bigint,
    project: ProjectConfig,
    promptSpec: Illustration.PromptSpec,
    runId: string,
    resolved: ResolvedReferences,
  ): Promise<Illustration.Candidate[]> {
    const images = await this.modelRouter.images(
      { prompt: renderPromptSpec(promptSpec, resolved.references), n: CANDIDATE_COUNT, inputReferences: resolved.dataUrls },
      { projectId, runId, node: 'generate', promptKey: promptSpec.promptKey, promptVersion: promptSpec.promptVersion, role: 'image' },
      project,
    );

    const instructionsHash = hashInstructions(promptSpec.instructions);
    return Promise.all(images.map(image => this.persist(image, instructionsHash, resolved.references)));
  }

  private async persist(image: GeneratedImage, instructionsHash: string, references: Illustration.Reference[]): Promise<Illustration.Candidate> {
    const ref = await this.storage.save(image.bytes, { contentType: image.contentType });
    return { ref, createdAt: new Date().toISOString(), instructionsHash, referenceRefs: references.map(reference => reference.ref), references };
  }

  private async loadEntity(projectId: bigint, subjectType: Illustration.SubjectType, subjectKey: string | null): Promise<EntitySubject | null> {
    if (subjectType !== 'entity' || !subjectKey) return null;
    const entity = await this.db.query.entities.findFirst({
      where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, subjectKey)),
      columns: { name: true, appearance: true },
    });
    return entity ?? null;
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
      this.db.$count(schema.illustrations, and(ne(schema.illustrations.id, excludeIllustrationId), ne(schema.illustrations.status, 'discarded'), illustrationReferences(ref))),
    ]);
    return counts.some(count => count > 0);
  }

  private present(row: Illustration.Row): PresentedIllustration {
    const { promptSpec } = row;
    return {
      id: row.id,
      projectId: row.projectId,
      subjectType: row.subjectType,
      subjectKey: row.subjectKey,
      status: row.status,
      revision: row.revision,
      origin: promptSpec.promptKey === UPLOADED_COVER_PROMPT_KEY ? 'uploaded' : 'generated',
      instructions: promptSpec.instructions,
      prompt: renderPromptSpec(promptSpec, row.candidates.at(-1)?.references ?? []),
      candidates: row.candidates.map(candidate => ({
        ...candidate,
        imageUrl: this.storage.getPublicUrl(candidate.ref),
        references: candidate.references.map(reference => this.referenceService.view(reference)),
      })),
      references: row.references.map(reference => this.referenceService.view(reference)),
      attachedReferences: promptSpec.attachedReferences ?? [],
      autoReferences: promptSpec.autoReferences ?? true,
      selectedRef: row.selectedRef,
      selectedUrl: this.storage.getPublicUrl(row.selectedRef),
      suggestedAppearance: promptSpec.appearanceDerived ? promptSpec.appearanceAnchor : undefined,
      appearanceDescription: promptSpec.appearanceDerived ? promptSpec.appearanceDescription : undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

function normalizeAttached(requests: ReferenceRequest[]): ReferenceRequest[] {
  const normalized: ReferenceRequest[] = [];
  for (const request of requests) {
    if (normalized.some(entry => entry.source === request.source && entry.sourceId === request.sourceId)) continue;
    const note = request.note?.trim();
    normalized.push({ source: request.source, ...(request.sourceId === undefined ? {} : { sourceId: request.sourceId }), role: request.role, ...(note ? { note } : {}) });
  }
  return normalized;
}

// Merges only the keys the caller owns, so a refinement and a references update racing on one row never undo each other.
function mergePromptSpec(patch: Partial<Illustration.PromptSpec>): SQL {
  return sql`${schema.illustrations.promptSpec} || ${JSON.stringify(patch)}::text::jsonb`;
}

function isProgrammingError(error: unknown): boolean {
  return error instanceof TypeError || error instanceof ReferenceError || error instanceof RangeError || error instanceof SyntaxError;
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : typeof error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function editSourceOf(row: Illustration.Row): string | undefined {
  return row.selectedRef ?? row.candidates.at(-1)?.ref;
}

function mergeReferenceLedger(ledger: Illustration.Reference[], sent: Illustration.Reference[]): Illustration.Reference[] {
  const byRef = new Map(ledger.map(reference => [reference.ref, reference]));
  for (const reference of sent) byRef.set(reference.ref, reference);
  return [...byRef.values()];
}

function composeReferenceInput(references: Illustration.Reference[], described: DescribedAppearance | undefined): string {
  if (references.length === 0) return '(none)';
  const manifest = renderReferenceManifest(references);
  if (!described) return manifest;
  return `${manifest}\n\nAppearance described from Reference ${described.referenceIndex + 1} (likeness): ${described.appearance}`;
}
