import { and, asc, desc, eq, isNotNull, type SQL, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { DatabaseService, StorageErrorCode, StorageService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Illustration, type PrimaryDatabase, schema } from '@server/database';

import { ModelRouterService, type ProjectConfig } from '../ai/model-router.service';

export type ReferenceRequest = Illustration.AttachedReference;

export type ReferenceLoadMode = 'bytes' | 'metadata';

export interface ResolveReferencesInput {
  projectId: bigint;
  project?: ProjectConfig;
  subjectType: Illustration.SubjectType;
  subjectKey: string | null;
  /** Attached by this request: an unresolvable, unreadable or over-capacity entry is an error. */
  attached: ReferenceRequest[];
  /** Attached in an earlier round: re-resolved below `attached` and above auto references, and skipped with a warning rather than failing. */
  carried?: ReferenceRequest[];
  autoReferences: boolean;
  /** Storage ref of the candidate a refinement edits; sent first and never trimmed. */
  editSourceRef?: string;
  /** `metadata` validates and ranks from storage heads alone and leaves `dataUrls` empty. Defaults to `bytes`. */
  load?: ReferenceLoadMode;
}

export type ReferenceWarningCode = 'capacity-trimmed' | 'merged-with-edit-source' | 'missing-file' | 'too-large' | 'unsupported-format';

export interface ReferenceWarning {
  code: ReferenceWarningCode;
  source: Illustration.ReferenceSource;
  sourceId?: string;
  reason: string;
}

export interface ResolvedReferences {
  references: Illustration.Reference[];
  /** `data:` URLs for the image model, index-aligned with `references`; empty under the `metadata` load mode. */
  dataUrls: string[];
  warnings: ReferenceWarning[];
  capacity: number;
  totalBytes: number;
}

export interface ReferenceSummary {
  count: number;
  byRole: Partial<Record<Illustration.ReferenceRole, number>>;
  byOrigin: Partial<Record<Illustration.ReferenceOrigin, number>>;
  totalBytes: number;
  warnings: number;
}

export interface ReferenceOptionsInput {
  projectId: bigint;
  project?: ProjectConfig;
  subjectType: Illustration.SubjectType;
  subjectKey: string | null;
  /** Upper bound on each group. */
  limit: number;
}

export interface ReferenceOption {
  source: Illustration.ReferenceSource;
  sourceId?: string;
  label: string;
  url: string;
  entityKey?: string;
  chapter?: number;
  caption?: string;
  subjectType?: Illustration.SubjectType;
  subjectKey?: string | null;
}

export type ReferenceView = Illustration.Reference & { url: string };

export interface ReferenceOptions {
  capacity: number;
  cover?: ReferenceOption;
  portraits: ReferenceOption[];
  gallery: ReferenceOption[];
  chapterImages: ReferenceOption[];
  candidates: ReferenceOption[];
  /** True when any group hit `limit`. */
  truncated: boolean;
  autoPreview: ReferenceView[];
  autoPreviewWarnings: ReferenceWarning[];
}

type Inspection =
  { status: 'ok'; size: number; contentType: string } | { status: 'missing-file' } | { status: 'too-large'; size: number } | { status: 'unsupported-format'; contentType: string };

interface Slot {
  reference: Illustration.Reference;
  size: number;
  contentType: string;
  required: boolean;
}

interface SourceMatch {
  ref: string;
  label: string;
  name?: string;
}

// Raw bytes, before base64's ~4/3 inflation: the request cap keeps the JSON body near 11 MiB, and one reference may
// use half of it so a two-slot model can still take a second full-size image.
export const MAX_REFERENCE_BYTES = 4 * 1024 * 1024;
export const MAX_REFERENCE_REQUEST_BYTES = 8 * 1024 * 1024;
export const MAX_CHAPTER_CAST_REFERENCES = 3;

const REFERENCE_CONTENT_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const BIGINT_MAX = 2n ** 63n - 1n;
const ENTITY_PORTRAIT_REASON = 'auto:entity-portrait';
const CHAPTER_CAST_REASON = 'auto:chapter-cast';
const EDIT_SOURCE_REASON = 'auto:edit-source';
const COVER_LABEL = 'the project cover';
const EDIT_SOURCE_LABEL = 'the current image being refined';

@Injectable()
export class IllustrationReferenceService {
  private readonly logger = Logger.getLogger(APP_NAME, IllustrationReferenceService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly storage: StorageService,
    private readonly modelRouter: ModelRouterService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async resolve(input: ResolveReferencesInput): Promise<ResolvedReferences> {
    const capacity = await this.modelRouter.referenceCapacity(input.project, input.projectId);
    const warnings: ReferenceWarning[] = [];
    const attached = await this.attachedReferences(input, warnings);
    const count = attached.length + (input.editSourceRef ? 1 : 0);
    if (count > capacity) throw AppErrorCode.ILL_011.create({ capacity, count });

    const slots: Slot[] = input.editSourceRef ? [await this.editSourceSlot(input.editSourceRef)] : [];
    const attachedSlots: Slot[] = [];
    for (const reference of attached) attachedSlots.push(this.requireSlot(reference, await this.inspect(reference.ref, MAX_REFERENCE_BYTES)));
    const budget = remainingBudget(slots);
    const attachedBytes = sumBytes(attachedSlots);
    if (attachedBytes > budget) throw AppErrorCode.ILL_013.create({ size: attachedBytes, limit: budget });
    slots.push(...attachedSlots);

    const carried = await this.carriedReferences(input, warnings);
    const autos = input.autoReferences ? await this.autoReferences(input) : [];
    const seen = new Set(slots.map(slot => slot.reference.ref));
    await this.fillOptionalSlots([...carried, ...autos], slots, warnings, capacity, seen, input.editSourceRef);

    const loaded = input.load === 'metadata' ? { slots, dataUrls: [] } : await this.read(slots, warnings);
    const resolved: ResolvedReferences = {
      references: loaded.slots.map(slot => slot.reference),
      dataUrls: loaded.dataUrls,
      warnings,
      capacity,
      totalBytes: sumBytes(loaded.slots),
    };
    this.logger.debug('illustration references resolved', {
      projectId: input.projectId,
      subjectType: input.subjectType,
      subjectKey: input.subjectKey,
      capacity,
      load: input.load ?? 'bytes',
      ...summarizeReferences(resolved),
    });
    return resolved;
  }

  async options(input: ReferenceOptionsInput): Promise<ReferenceOptions> {
    const { projectId, limit } = input;
    const { entities, entityImages, chapterImages, illustrations, projects } = schema;
    const [project, portraits, gallery, chapterRows, candidateRows, preview] = await Promise.all([
      this.db.query.projects.findFirst({ where: eq(projects.id, projectId), columns: { coverImagePath: true } }),
      this.db.query.entities.findMany({
        where: and(eq(entities.projectId, projectId), isNotNull(entities.imagePath)),
        columns: { entityKey: true, name: true, imagePath: true },
        orderBy: [asc(entities.name), asc(entities.id)],
        limit: limit + 1,
      }),
      this.db
        .select({ id: entityImages.id, imagePath: entityImages.imagePath, caption: entityImages.caption, entityKey: entities.entityKey, name: entities.name })
        .from(entityImages)
        .innerJoin(entities, and(eq(entities.id, entityImages.entityId), eq(entities.projectId, projectId)))
        .where(eq(entityImages.projectId, projectId))
        .orderBy(desc(entityImages.id))
        .limit(limit + 1),
      this.db.query.chapterImages.findMany({ where: eq(chapterImages.projectId, projectId), orderBy: [desc(chapterImages.id)], limit: limit + 1 }),
      this.db
        .select({ id: illustrations.id, subjectType: illustrations.subjectType, subjectKey: illustrations.subjectKey, selectedRef: illustrations.selectedRef, name: entities.name })
        .from(illustrations)
        .leftJoin(entities, subjectEntityJoin())
        .where(and(eq(illustrations.projectId, projectId), isNotNull(illustrations.selectedRef)))
        .orderBy(desc(illustrations.id))
        .limit(limit + 1),
      this.resolve({ ...input, attached: [], autoReferences: true, load: 'metadata' }),
    ]);

    return {
      capacity: preview.capacity,
      ...(project?.coverImagePath ? { cover: { source: 'cover', label: COVER_LABEL, url: this.storage.getPublicUrl(project.coverImagePath) } } : {}),
      portraits: portraits.slice(0, limit).map(entity => ({
        source: 'portrait',
        sourceId: entity.entityKey,
        label: portraitLabel(entity.name),
        url: this.storage.getPublicUrl(entity.imagePath as string),
        entityKey: entity.entityKey,
      })),
      gallery: gallery.slice(0, limit).map(image => ({
        source: 'gallery',
        sourceId: String(image.id),
        label: withCaption(`gallery image of ${image.name}`, image.caption),
        url: this.storage.getPublicUrl(image.imagePath),
        entityKey: image.entityKey,
        ...(image.caption ? { caption: image.caption } : {}),
      })),
      chapterImages: chapterRows.slice(0, limit).map(image => ({
        source: 'chapter-image',
        sourceId: String(image.id),
        label: withCaption(`chapter ${image.chapter} scene image`, image.caption),
        url: this.storage.getPublicUrl(image.imagePath),
        chapter: image.chapter,
        ...(image.caption ? { caption: image.caption } : {}),
      })),
      candidates: candidateRows.slice(0, limit).map(row => ({
        source: 'candidate',
        sourceId: String(row.id),
        label: candidateLabel(row.subjectType, row.subjectKey, row.name),
        url: this.storage.getPublicUrl(row.selectedRef as string),
        subjectType: row.subjectType,
        subjectKey: row.subjectKey,
      })),
      truncated: [portraits, gallery, chapterRows, candidateRows].some(group => group.length > limit),
      autoPreview: preview.references.map(reference => this.view(reference)),
      autoPreviewWarnings: preview.warnings,
    };
  }

  view(reference: Illustration.Reference): ReferenceView {
    return { ...reference, url: this.storage.getPublicUrl(reference.ref) };
  }

  private async attachedReferences(input: ResolveReferencesInput, warnings: ReferenceWarning[]): Promise<Illustration.Reference[]> {
    const accepted: Illustration.Reference[] = [];
    const resolved = await Promise.all(input.attached.map(request => this.resolveAttached(input.projectId, request)));
    for (const reference of resolved) {
      if (reference.ref === input.editSourceRef) warnings.push(mergedWarning(reference));
      else if (!accepted.some(entry => entry.ref === reference.ref)) accepted.push(reference);
    }
    return accepted;
  }

  // The image being refined is exempt from the format allowlist and the size caps: refusing it would make the illustration unrefinable.
  private async editSourceSlot(ref: string): Promise<Slot> {
    const reference: Illustration.Reference = { source: 'candidate', ref, role: 'edit-source', origin: 'auto', reason: EDIT_SOURCE_REASON, label: EDIT_SOURCE_LABEL };
    try {
      const head = await this.storage.stat(ref);
      return { reference, size: head.size, contentType: normalizeContentType(head.contentType), required: true };
    } catch (error) {
      if (AppError.is(error, StorageErrorCode.OBJECT_NOT_FOUND)) throw AppErrorCode.ILL_010.create({ source: reference.source });
      throw error;
    }
  }

  private async carriedReferences(input: ResolveReferencesInput, warnings: ReferenceWarning[]): Promise<Illustration.Reference[]> {
    const carried: Illustration.Reference[] = [];
    for (const request of input.carried ?? []) {
      if (isEditSourceRole(request)) throw AppErrorCode.ILL_015.create({ source: request.source });
      const match = await this.lookupSource(input.projectId, request).catch((error: unknown) => {
        if (AppError.is(error, AppErrorCode.ILL_009)) return undefined;
        throw error;
      });
      if (match) carried.push(toAttached(request, match));
      else warnings.push({ code: 'missing-file', ...sourceOf(request), reason: 'the attached image no longer exists in this project' });
    }
    return carried;
  }

  private async fillOptionalSlots(
    candidates: Illustration.Reference[],
    slots: Slot[],
    warnings: ReferenceWarning[],
    capacity: number,
    seen: Set<string>,
    editSourceRef: string | undefined,
  ): Promise<void> {
    let castConsidered = 0;
    for (const reference of candidates) {
      if (reference.origin === 'attached' && reference.ref === editSourceRef) {
        warnings.push(mergedWarning(reference));
        continue;
      }
      if (seen.has(reference.ref)) continue;
      seen.add(reference.ref);

      const isCast = reference.reason === CHAPTER_CAST_REASON;
      if (isCast && castConsidered >= MAX_CHAPTER_CAST_REFERENCES) continue;
      if (slots.length >= capacity) {
        if (isCast) castConsidered++;
        warnings.push(toWarning(reference, 'capacity-trimmed', `the image model accepts at most ${capacity} reference image(s)`));
        continue;
      }

      const remaining = remainingBudget(slots);
      const inspection = await this.inspect(reference.ref, Math.min(MAX_REFERENCE_BYTES, remaining));
      if (inspection.status === 'ok') {
        if (isCast) castConsidered++;
        slots.push({ reference, size: inspection.size, contentType: inspection.contentType, required: false });
        continue;
      }

      warnings.push(this.skipWarning(reference, inspection, remaining));
    }
  }

  private async read(slots: Slot[], warnings: ReferenceWarning[]): Promise<{ slots: Slot[]; dataUrls: string[] }> {
    const kept: Slot[] = [];
    const dataUrls: string[] = [];
    for (const slot of slots) {
      const bytes = await this.storage.read(slot.reference.ref).then(
        object => object.bytes,
        (error: unknown) => {
          if (!AppError.is(error, StorageErrorCode.OBJECT_NOT_FOUND)) throw error;
          if (slot.required) throw AppErrorCode.ILL_010.create({ source: slot.reference.source });
          warnings.push(toWarning(slot.reference, 'missing-file', 'the image file is missing from storage'));
          return undefined;
        },
      );
      if (!bytes) continue;
      kept.push(slot);
      dataUrls.push(`data:${slot.contentType};base64,${Buffer.from(bytes).toString('base64')}`);
    }
    return { slots: kept, dataUrls };
  }

  private async resolveAttached(projectId: bigint, request: ReferenceRequest): Promise<Illustration.Reference> {
    if (isEditSourceRole(request)) throw AppErrorCode.ILL_015.create({ source: request.source });
    const match = await this.lookupSource(projectId, request);
    if (!match) throw AppErrorCode.ILL_010.create({ source: request.source });
    return toAttached(request, match);
  }

  private async lookupSource(projectId: bigint, request: ReferenceRequest): Promise<SourceMatch | undefined> {
    const { source, sourceId } = request;
    switch (source) {
      case 'cover': {
        if (sourceId !== undefined) throw AppErrorCode.ILL_009.create({ source });
        const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId), columns: { coverImagePath: true } });
        return project?.coverImagePath ? { ref: project.coverImagePath, label: COVER_LABEL } : undefined;
      }
      case 'portrait': {
        if (!sourceId?.trim()) throw AppErrorCode.ILL_009.create({ source });
        const entity = await this.db.query.entities.findFirst({
          where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, sourceId)),
          columns: { imagePath: true, name: true },
        });
        return entity?.imagePath ? { ref: entity.imagePath, label: portraitLabel(entity.name), name: entity.name } : undefined;
      }
      case 'gallery': {
        const id = parseRowId(source, sourceId);
        const { entityImages, entities } = schema;
        const [image] = await this.db
          .select({ imagePath: entityImages.imagePath, caption: entityImages.caption, name: entities.name })
          .from(entityImages)
          .innerJoin(entities, eq(entities.id, entityImages.entityId))
          .where(and(eq(entityImages.id, id), eq(entityImages.projectId, projectId)));
        return image ? { ref: image.imagePath, label: withCaption(`gallery image of ${image.name}`, image.caption) } : undefined;
      }
      case 'chapter-image': {
        const id = parseRowId(source, sourceId);
        const image = await this.db.query.chapterImages.findFirst({
          where: and(eq(schema.chapterImages.id, id), eq(schema.chapterImages.projectId, projectId)),
          columns: { imagePath: true, chapter: true, caption: true },
        });
        return image ? { ref: image.imagePath, label: withCaption(`chapter ${image.chapter} scene image`, image.caption) } : undefined;
      }
      case 'candidate': {
        const id = parseRowId(source, sourceId);
        const { illustrations } = schema;
        const [illustration] = await this.db
          .select({ selectedRef: illustrations.selectedRef, subjectType: illustrations.subjectType, subjectKey: illustrations.subjectKey, name: schema.entities.name })
          .from(illustrations)
          .leftJoin(schema.entities, subjectEntityJoin())
          .where(and(eq(illustrations.id, id), eq(illustrations.projectId, projectId)));
        return illustration?.selectedRef
          ? { ref: illustration.selectedRef, label: candidateLabel(illustration.subjectType, illustration.subjectKey, illustration.name) }
          : undefined;
      }
    }
  }

  private async autoReferences(input: ResolveReferencesInput): Promise<Illustration.Reference[]> {
    if (!input.subjectKey) return [];
    if (input.subjectType === 'entity') return this.entityPortrait(input.projectId, input.subjectKey);
    if (input.subjectType === 'chapter' && /^\d+$/.test(input.subjectKey)) return this.chapterCast(input.projectId, Number(input.subjectKey));
    return [];
  }

  private async entityPortrait(projectId: bigint, entityKey: string): Promise<Illustration.Reference[]> {
    const entity = await this.db.query.entities.findFirst({
      where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, entityKey)),
      columns: { imagePath: true, name: true },
    });
    if (!entity?.imagePath) return [];
    return [
      {
        source: 'portrait',
        sourceId: entityKey,
        ref: entity.imagePath,
        role: 'likeness',
        origin: 'auto',
        reason: ENTITY_PORTRAIT_REASON,
        label: portraitLabel(entity.name),
        name: entity.name,
      },
    ];
  }

  private async chapterCast(projectId: bigint, chapter: number): Promise<Illustration.Reference[]> {
    const { entities, entityAppearances } = schema;
    const cast = await this.db
      .select({ entityKey: entities.entityKey, name: entities.name, imagePath: entities.imagePath })
      .from(entityAppearances)
      .innerJoin(entities, and(eq(entities.id, entityAppearances.entityId), eq(entities.projectId, projectId)))
      .where(and(eq(entityAppearances.projectId, projectId), eq(entityAppearances.chapter, chapter), eq(entities.type, 'character'), isNotNull(entities.imagePath)))
      .orderBy(sql`CASE ${entities.significance} WHEN 'major' THEN 0 WHEN 'minor' THEN 1 ELSE 2 END`, asc(entities.id));

    return cast.map(member => ({
      source: 'portrait',
      sourceId: member.entityKey,
      ref: member.imagePath as string,
      role: 'likeness',
      origin: 'auto',
      reason: CHAPTER_CAST_REASON,
      label: portraitLabel(member.name),
      name: member.name,
    }));
  }

  // Heads only: every size and format decision is made before a single object is transferred.
  private async inspect(ref: string, maxBytes: number): Promise<Inspection> {
    try {
      const head = await this.storage.stat(ref);
      const contentType = normalizeContentType(head.contentType);
      if (!REFERENCE_CONTENT_TYPES.has(contentType)) return { status: 'unsupported-format', contentType };
      if (head.size > maxBytes) return { status: 'too-large', size: head.size };
      return { status: 'ok', size: head.size, contentType };
    } catch (error) {
      if (AppError.is(error, StorageErrorCode.OBJECT_NOT_FOUND)) return { status: 'missing-file' };
      throw error;
    }
  }

  private requireSlot(reference: Illustration.Reference, inspection: Inspection): Slot {
    const source = reference.source;
    switch (inspection.status) {
      case 'ok':
        return { reference, size: inspection.size, contentType: inspection.contentType, required: true };
      case 'missing-file':
        throw AppErrorCode.ILL_010.create({ source });
      case 'too-large':
        throw AppErrorCode.ILL_012.create({ source, size: inspection.size, limit: MAX_REFERENCE_BYTES });
      case 'unsupported-format':
        throw AppErrorCode.ILL_014.create({ source, contentType: inspection.contentType });
    }
  }

  private skipWarning(reference: Illustration.Reference, inspection: Exclude<Inspection, { status: 'ok' }>, remainingBytes: number): ReferenceWarning {
    switch (inspection.status) {
      case 'missing-file':
        return toWarning(reference, 'missing-file', 'the image file is missing from storage');
      case 'too-large': {
        const limit = Math.min(MAX_REFERENCE_BYTES, remainingBytes);
        const scope = limit < MAX_REFERENCE_BYTES ? 'remaining request budget' : 'per-reference limit';
        return toWarning(reference, 'too-large', `the image is ${inspection.size} bytes, over the ${limit} byte ${scope}`);
      }
      case 'unsupported-format':
        return toWarning(reference, 'unsupported-format', `${inspection.contentType} is not PNG, JPEG or WebP`);
    }
  }
}

export function summarizeReferences(resolved: ResolvedReferences): ReferenceSummary {
  const byRole: ReferenceSummary['byRole'] = {};
  const byOrigin: ReferenceSummary['byOrigin'] = {};
  for (const reference of resolved.references) {
    byRole[reference.role] = (byRole[reference.role] ?? 0) + 1;
    byOrigin[reference.origin] = (byOrigin[reference.origin] ?? 0) + 1;
  }
  return { count: resolved.references.length, byRole, byOrigin, totalBytes: resolved.totalBytes, warnings: resolved.warnings.length };
}

function portraitLabel(name: string): string {
  return `portrait of ${name}`;
}

function candidateLabel(subjectType: Illustration.SubjectType, subjectKey: string | null, entityName: string | null): string {
  if (subjectType === 'cover') return 'a selected cover illustration';
  if (subjectType === 'chapter') return `a selected chapter ${subjectKey} illustration`;
  return entityName ? `a selected illustration of ${entityName}` : 'a selected entity illustration';
}

function subjectEntityJoin(): SQL | undefined {
  const { illustrations, entities } = schema;
  return and(eq(entities.projectId, illustrations.projectId), eq(entities.entityKey, illustrations.subjectKey), eq(illustrations.subjectType, 'entity'));
}

function withCaption(label: string, caption: string | null): string {
  return caption ? `${label}, captioned "${caption}"` : label;
}

function toAttached(request: ReferenceRequest, match: SourceMatch): Illustration.Reference {
  const note = request.note?.trim();
  return {
    ...sourceOf(request),
    ref: match.ref,
    role: request.role,
    ...(note ? { note } : {}),
    origin: 'attached',
    reason: 'attached',
    label: match.label,
    ...(match.name ? { name: match.name } : {}),
  };
}

// Requests cross a trust boundary, so the narrowed role type is re-checked at runtime.
function isEditSourceRole(request: ReferenceRequest): boolean {
  return (request.role as Illustration.ReferenceRole) === 'edit-source';
}

function sourceOf(reference: { source: Illustration.ReferenceSource; sourceId?: string }): Pick<ReferenceWarning, 'source' | 'sourceId'> {
  return { source: reference.source, ...(reference.sourceId === undefined ? {} : { sourceId: reference.sourceId }) };
}

function parseRowId(source: Illustration.ReferenceSource, sourceId: string | undefined): bigint {
  if (!sourceId || !/^[1-9]\d{0,18}$/.test(sourceId)) throw AppErrorCode.ILL_009.create({ source });
  const id = BigInt(sourceId);
  if (id > BIGINT_MAX) throw AppErrorCode.ILL_009.create({ source });
  return id;
}

function normalizeContentType(contentType: string): string {
  return (contentType.split(';')[0] ?? '').trim().toLowerCase();
}

function sumBytes(slots: Slot[]): number {
  return slots.reduce((total, slot) => total + slot.size, 0);
}

function remainingBudget(slots: Slot[]): number {
  return Math.max(0, MAX_REFERENCE_REQUEST_BYTES - sumBytes(slots));
}

function mergedWarning(reference: Illustration.Reference): ReferenceWarning {
  const dropped = reference.note ? ' and its note was not applied' : '';
  return toWarning(reference, 'merged-with-edit-source', `this is the image being refined, so it is sent once as the edit source${dropped}`);
}

function toWarning(reference: Illustration.Reference, code: ReferenceWarningCode, reason: string): ReferenceWarning {
  return { code, ...sourceOf(reference), reason };
}
