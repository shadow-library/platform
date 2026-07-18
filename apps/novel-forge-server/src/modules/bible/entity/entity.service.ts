/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { randomUUID } from 'node:crypto';

import { and, asc, desc, eq } from 'drizzle-orm';
import { Inject, Injectable } from '@shadow-library/app';
import { Logger, OffsetPaginationResult, utils } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Knowledge, type PrimaryDatabase, schema } from '@server/database';

import { IMAGE_STORAGE, type ImageStorageProvider } from '../../storage/image-storage.interface';
import { type CreateEntityBody, type ListEntitiesQuery, type UpdateEntityBody } from './entity.dto';

/**
 * Defining types
 */

export type EntityWithImages = Knowledge.Entity & { images: Knowledge.EntityImage[] };

type UploadMime = 'image/png' | 'image/jpeg' | 'image/webp';

/**
 * Declaring the constants
 */

@Injectable()
export class EntityService {
  private readonly logger = Logger.getLogger(APP_NAME, EntityService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    @Inject(IMAGE_STORAGE) private readonly imageStorage: ImageStorageProvider,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async create(projectId: bigint, body: CreateEntityBody): Promise<Knowledge.Entity> {
    const [entity] = await this.db
      .insert(schema.entities)
      .values({
        projectId,
        entityKey: body.entityKey,
        type: body.type,
        name: body.name,
        significance: body.significance,
        status: body.status,
        origin: body.origin,
        notes: body.notes,
        motivation: body.motivation,
        body: body.body,
      })
      .onConflictDoUpdate({
        target: [schema.entities.projectId, schema.entities.entityKey],
        set: {
          name: body.name,
          significance: body.significance,
          status: body.status,
          origin: body.origin,
          notes: body.notes,
          motivation: body.motivation,
          body: body.body,
          updatedAt: new Date(),
        },
      })
      .returning()
      .catch(err => this.databaseService.translateError(err));

    if (!entity) throw AppErrorCode.S001.create();
    return entity;
  }

  async list(projectId: bigint, filter: ListEntitiesQuery): Promise<OffsetPaginationResult<Knowledge.Entity>> {
    const query = utils.pagination.normalise(filter, {
      mode: 'offset',
      defaults: { limit: 20, offset: 0, sortBy: 'updatedAt', sortOrder: 'desc' },
    });

    const conditions = [eq(schema.entities.projectId, projectId)];
    if (filter.type) conditions.push(eq(schema.entities.type, filter.type));
    if (filter.origin) conditions.push(eq(schema.entities.origin, filter.origin));
    const where = and(...conditions);

    const column = query.sortBy === 'createdAt' ? schema.entities.createdAt : schema.entities.updatedAt;
    const order = query.sortOrder === 'asc' ? asc(column) : desc(column);

    const [total, items] = await Promise.all([
      this.db.$count(schema.entities, where),
      this.db.query.entities.findMany({ where, limit: query.limit, offset: query.offset, orderBy: order }),
    ]);

    return utils.pagination.createResult(query, items, total);
  }

  get(projectId: bigint, entityKey: string): Promise<EntityWithImages | null> {
    return this.db.query.entities
      .findFirst({
        where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, entityKey)),
        with: { images: { orderBy: (img, { asc: ascOrder }) => [ascOrder(img.sortOrder), ascOrder(img.id)] } },
      })
      .then(r => r ?? null);
  }

  async update(projectId: bigint, entityKey: string, update: UpdateEntityBody): Promise<Knowledge.Entity> {
    const [result] = await this.db
      .update(schema.entities)
      .set({ ...update, updatedAt: new Date() })
      .where(and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, entityKey)))
      .returning()
      .catch(err => this.databaseService.translateError(err));

    if (!result) throw AppErrorCode.ENT_001.create();
    return result;
  }

  async setImage(projectId: bigint, entityKey: string, image: string, mime: 'image/png' | 'image/jpeg' | 'image/webp'): Promise<Knowledge.Entity> {
    const entity = await this.get(projectId, entityKey);
    if (!entity) throw AppErrorCode.ENT_001.create();

    // Drop the previous file first so a different extension (png → jpg) never leaves an orphan behind.
    if (entity.imagePath) await this.imageStorage.delete(entity.imagePath);
    const ref = await this.imageStorage.save(projectId, entityKey, new Uint8Array(Buffer.from(image, 'base64')), mime);

    const [updated] = await this.db
      .update(schema.entities)
      .set({ imagePath: ref, updatedAt: new Date() })
      .where(and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, entityKey)))
      .returning();

    if (!updated) throw AppErrorCode.ENT_001.create();
    return updated;
  }

  async clearImage(projectId: bigint, entityKey: string): Promise<Knowledge.Entity> {
    const entity = await this.get(projectId, entityKey);
    if (!entity) throw AppErrorCode.ENT_001.create();
    if (entity.imagePath) await this.imageStorage.delete(entity.imagePath);

    const [updated] = await this.db
      .update(schema.entities)
      .set({ imagePath: null, updatedAt: new Date() })
      .where(and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, entityKey)))
      .returning();

    if (!updated) throw AppErrorCode.ENT_001.create();
    return updated;
  }

  async addImage(projectId: bigint, entityKey: string, image: string, mime: UploadMime, caption?: string): Promise<EntityWithImages> {
    const entity = await this.get(projectId, entityKey);
    if (!entity) throw AppErrorCode.ENT_001.create();

    // Gallery files get a random suffix so multiple images per entity never collide on the storage key.
    const key = `${entityKey}_g_${randomUUID().slice(0, 8)}`;
    const ref = await this.imageStorage.save(projectId, key, new Uint8Array(Buffer.from(image, 'base64')), mime);
    const nextOrder = entity.images.reduce((max, img) => Math.max(max, img.sortOrder + 1), 0);

    await this.db.insert(schema.entityImages).values({ entityId: entity.id, projectId, imagePath: ref, caption: caption ?? null, sortOrder: nextOrder });

    return this.getOrThrow(projectId, entityKey);
  }

  async deleteImageById(projectId: bigint, entityKey: string, imageId: bigint): Promise<EntityWithImages> {
    const entity = await this.get(projectId, entityKey);
    if (!entity) throw AppErrorCode.ENT_001.create();

    const image = entity.images.find(img => img.id === imageId);
    if (!image) throw AppErrorCode.ENT_002.create();

    await this.imageStorage.delete(image.imagePath);
    await this.db.delete(schema.entityImages).where(and(eq(schema.entityImages.id, imageId), eq(schema.entityImages.projectId, projectId)));

    return this.getOrThrow(projectId, entityKey);
  }

  private async getOrThrow(projectId: bigint, entityKey: string): Promise<EntityWithImages> {
    const entity = await this.get(projectId, entityKey);
    if (!entity) throw AppErrorCode.ENT_001.create();
    return entity;
  }

  async delete(projectId: bigint, entityKey: string): Promise<void> {
    const result = await this.db
      .delete(schema.entities)
      .where(and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, entityKey)))
      .returning();

    if (result.length === 0) throw AppErrorCode.ENT_001.create();
  }
}
