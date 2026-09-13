import { and, asc, eq, isNotNull, sql } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { AppError, Logger } from '@shadow-library/common';
import { DatabaseService, StorageErrorCode, StorageService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Illustration, type PrimaryDatabase, schema } from '@server/database';

import { ModelRouterService, type ProjectConfig } from '../ai/model-router.service';

export interface ReferenceRequest {
  source: Illustration.ReferenceSource;
  /** Entity key for `portrait`; numeric row id for `gallery`, `chapter-image` and `candidate` (an illustration id); absent for `cover`. */
  sourceId?: string;
  role: Illustration.ReferenceRole;
  note?: string;
}

export interface ResolveReferencesInput {
  projectId: bigint;
  project?: ProjectConfig;
  subjectType: Illustration.SubjectType;
  subjectKey: string | null;
  attached: ReferenceRequest[];
  autoReferences: boolean;
  /** Storage ref of the candidate a refinement edits; sent first and never trimmed. */
  editSourceRef?: string;
}

export type ReferenceWarningCode = 'capacity-trimmed' | 'missing-file' | 'too-large' | 'unsupported-format';

export interface ReferenceWarning {
  code: ReferenceWarningCode;
  source: Illustration.ReferenceSource;
  sourceId?: string;
  reason: string;
}

export interface ResolvedReferences {
  references: Illustration.Reference[];
  /** `data:` URLs for the image model, index-aligned with `references`. */
  dataUrls: string[];
  warnings: ReferenceWarning[];
  capacity: number;
  totalBytes: number;
}

type Inspection =
  | { status: 'ok'; bytes: Uint8Array; contentType: string }
  | { status: 'missing-file' }
  | { status: 'too-large'; size: number }
  | { status: 'unsupported-format'; contentType: string };

interface LoadedReference {
  reference: Illustration.Reference;
  dataUrl: string;
  size: number;
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
    const attached = await Promise.all(input.attached.map(request => this.resolveAttached(input.projectId, request)));

    const editSource: Illustration.Reference[] = input.editSourceRef
      ? [{ source: 'candidate', ref: input.editSourceRef, role: 'edit-source', origin: 'auto', reason: EDIT_SOURCE_REASON }]
      : [];
    const required = dedupeByRef([...editSource, ...attached]);
    if (required.length > capacity) throw AppErrorCode.ILL_011.create({ capacity, count: required.length });

    const loaded: LoadedReference[] = [];
    for (const reference of required) loaded.push(this.requireLoaded(reference, await this.inspect(reference.ref, MAX_REFERENCE_BYTES)));
    const requiredBytes = sumBytes(loaded);
    if (requiredBytes > MAX_REFERENCE_REQUEST_BYTES) throw AppErrorCode.ILL_013.create({ size: requiredBytes, limit: MAX_REFERENCE_REQUEST_BYTES });

    const warnings: ReferenceWarning[] = [];
    const autos = input.autoReferences ? await this.autoReferences(input) : [];
    await this.fillAutoSlots(autos, loaded, warnings, capacity, new Set(required.map(reference => reference.ref)));

    const resolved: ResolvedReferences = {
      references: loaded.map(entry => entry.reference),
      dataUrls: loaded.map(entry => entry.dataUrl),
      warnings,
      capacity,
      totalBytes: sumBytes(loaded),
    };
    this.logResolution(input, resolved);
    return resolved;
  }

  private async fillAutoSlots(autos: Illustration.Reference[], loaded: LoadedReference[], warnings: ReferenceWarning[], capacity: number, seen: Set<string>): Promise<void> {
    let castConsidered = 0;
    for (const reference of autos) {
      if (seen.has(reference.ref)) continue;
      seen.add(reference.ref);

      const isCast = reference.reason === CHAPTER_CAST_REASON;
      if (isCast && castConsidered >= MAX_CHAPTER_CAST_REFERENCES) continue;
      if (loaded.length >= capacity) {
        if (isCast) castConsidered++;
        warnings.push(toWarning(reference, 'capacity-trimmed', `the image model accepts at most ${capacity} reference image(s)`));
        continue;
      }

      const remaining = MAX_REFERENCE_REQUEST_BYTES - sumBytes(loaded);
      const inspection = await this.inspect(reference.ref, Math.min(MAX_REFERENCE_BYTES, remaining));
      if (inspection.status === 'ok') {
        if (isCast) castConsidered++;
        loaded.push(toLoaded(reference, inspection.bytes, inspection.contentType));
        continue;
      }

      warnings.push(this.skipWarning(reference, inspection, remaining));
    }
  }

  private async resolveAttached(projectId: bigint, request: ReferenceRequest): Promise<Illustration.Reference> {
    const ref = await this.lookupSource(projectId, request);
    if (!ref) throw AppErrorCode.ILL_010.create({ source: request.source });

    const note = request.note?.trim();
    return {
      source: request.source,
      ...(request.sourceId === undefined ? {} : { sourceId: request.sourceId }),
      ref,
      role: request.role,
      ...(note ? { note } : {}),
      origin: 'attached',
      reason: 'attached',
    };
  }

  private async lookupSource(projectId: bigint, request: ReferenceRequest): Promise<string | null | undefined> {
    const { source, sourceId } = request;
    switch (source) {
      case 'cover': {
        if (sourceId !== undefined) throw AppErrorCode.ILL_009.create({ source });
        const project = await this.db.query.projects.findFirst({ where: eq(schema.projects.id, projectId), columns: { coverImagePath: true } });
        return project?.coverImagePath;
      }
      case 'portrait': {
        if (!sourceId?.trim()) throw AppErrorCode.ILL_009.create({ source });
        const entity = await this.db.query.entities.findFirst({
          where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, sourceId)),
          columns: { imagePath: true },
        });
        return entity?.imagePath;
      }
      case 'gallery': {
        const id = parseRowId(source, sourceId);
        const image = await this.db.query.entityImages.findFirst({
          where: and(eq(schema.entityImages.id, id), eq(schema.entityImages.projectId, projectId)),
          columns: { imagePath: true },
        });
        return image?.imagePath;
      }
      case 'chapter-image': {
        const id = parseRowId(source, sourceId);
        const image = await this.db.query.chapterImages.findFirst({
          where: and(eq(schema.chapterImages.id, id), eq(schema.chapterImages.projectId, projectId)),
          columns: { imagePath: true },
        });
        return image?.imagePath;
      }
      case 'candidate': {
        const id = parseRowId(source, sourceId);
        const illustration = await this.db.query.illustrations.findFirst({
          where: and(eq(schema.illustrations.id, id), eq(schema.illustrations.projectId, projectId)),
          columns: { selectedRef: true },
        });
        return illustration?.selectedRef;
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
      columns: { imagePath: true },
    });
    if (!entity?.imagePath) return [];
    return [{ source: 'portrait', sourceId: entityKey, ref: entity.imagePath, role: 'likeness', origin: 'auto', reason: ENTITY_PORTRAIT_REASON }];
  }

  private async chapterCast(projectId: bigint, chapter: number): Promise<Illustration.Reference[]> {
    const { entities, entityAppearances } = schema;
    const cast = await this.db
      .select({ entityKey: entities.entityKey, imagePath: entities.imagePath })
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
    }));
  }

  // Stat before read so an oversized object is rejected without transferring it.
  private async inspect(ref: string, maxBytes: number): Promise<Inspection> {
    try {
      const head = await this.storage.stat(ref);
      const contentType = normalizeContentType(head.contentType);
      if (!REFERENCE_CONTENT_TYPES.has(contentType)) return { status: 'unsupported-format', contentType };
      if (head.size > maxBytes) return { status: 'too-large', size: head.size };
      const object = await this.storage.read(ref);
      return { status: 'ok', bytes: object.bytes, contentType };
    } catch (error) {
      if (AppError.is(error, StorageErrorCode.OBJECT_NOT_FOUND)) return { status: 'missing-file' };
      throw error;
    }
  }

  private requireLoaded(reference: Illustration.Reference, inspection: Inspection): LoadedReference {
    const source = reference.source;
    switch (inspection.status) {
      case 'ok':
        return toLoaded(reference, inspection.bytes, inspection.contentType);
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

  private logResolution(input: ResolveReferencesInput, resolved: ResolvedReferences): void {
    const byRole: Partial<Record<Illustration.ReferenceRole, number>> = {};
    const byOrigin: Partial<Record<Illustration.ReferenceOrigin, number>> = {};
    for (const reference of resolved.references) {
      byRole[reference.role] = (byRole[reference.role] ?? 0) + 1;
      byOrigin[reference.origin] = (byOrigin[reference.origin] ?? 0) + 1;
    }

    this.logger.info('illustration references resolved', {
      projectId: input.projectId,
      subjectType: input.subjectType,
      subjectKey: input.subjectKey,
      capacity: resolved.capacity,
      count: resolved.references.length,
      byRole,
      byOrigin,
      totalBytes: resolved.totalBytes,
      warnings: resolved.warnings.length,
    });
  }
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

function dedupeByRef(references: Illustration.Reference[]): Illustration.Reference[] {
  const byRef = new Map<string, Illustration.Reference>();
  for (const reference of references) if (!byRef.has(reference.ref)) byRef.set(reference.ref, reference);
  return [...byRef.values()];
}

function sumBytes(loaded: LoadedReference[]): number {
  return loaded.reduce((total, entry) => total + entry.size, 0);
}

function toLoaded(reference: Illustration.Reference, bytes: Uint8Array, contentType: string): LoadedReference {
  return { reference, dataUrl: `data:${contentType};base64,${Buffer.from(bytes).toString('base64')}`, size: bytes.byteLength };
}

function toWarning(reference: Illustration.Reference, code: ReferenceWarningCode, reason: string): ReferenceWarning {
  return { code, source: reference.source, ...(reference.sourceId === undefined ? {} : { sourceId: reference.sourceId }), reason };
}
