/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Inject, Injectable } from '@shadow-library/app';
import { Logger, OffsetPaginationResult, utils } from '@shadow-library/common';
import { ServerError } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';
import { and, asc, desc, eq } from 'drizzle-orm';

/**
 * Importing user defined packages
 */
import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Knowledge, type PrimaryDatabase, schema } from '@server/database';

import { type CreateEntityBody, type ListEntitiesQuery, type UpdateEntityBody } from './entity.dto';
import { IMAGE_STORAGE, type ImageStorageProvider } from '../../storage/image-storage.interface';

/**
 * Defining types
 */

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

    if (!entity) throw new ServerError(AppErrorCode.PRJ_002);
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

  get(projectId: bigint, entityKey: string): Promise<Knowledge.Entity | null> {
    return this.db.query.entities.findFirst({ where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, entityKey)) }).then(r => r ?? null);
  }

  async update(projectId: bigint, entityKey: string, update: UpdateEntityBody): Promise<Knowledge.Entity> {
    const [result] = await this.db
      .update(schema.entities)
      .set({ ...update, updatedAt: new Date() })
      .where(and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, entityKey)))
      .returning()
      .catch(err => this.databaseService.translateError(err));

    if (!result) throw new ServerError(AppErrorCode.ENT_001);
    return result;
  }

  async setImage(projectId: bigint, entityKey: string, image: string, mime: 'image/png' | 'image/jpeg' | 'image/webp'): Promise<Knowledge.Entity> {
    const entity = await this.get(projectId, entityKey);
    if (!entity) throw new ServerError(AppErrorCode.ENT_001);

    // Drop the previous file first so a different extension (png → jpg) never leaves an orphan behind.
    if (entity.imagePath) await this.imageStorage.delete(entity.imagePath);
    const ref = await this.imageStorage.save(projectId, entityKey, new Uint8Array(Buffer.from(image, 'base64')), mime);

    const [updated] = await this.db
      .update(schema.entities)
      .set({ imagePath: ref, updatedAt: new Date() })
      .where(and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, entityKey)))
      .returning();

    if (!updated) throw new ServerError(AppErrorCode.ENT_001);
    return updated;
  }

  async clearImage(projectId: bigint, entityKey: string): Promise<Knowledge.Entity> {
    const entity = await this.get(projectId, entityKey);
    if (!entity) throw new ServerError(AppErrorCode.ENT_001);
    if (entity.imagePath) await this.imageStorage.delete(entity.imagePath);

    const [updated] = await this.db
      .update(schema.entities)
      .set({ imagePath: null, updatedAt: new Date() })
      .where(and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, entityKey)))
      .returning();

    if (!updated) throw new ServerError(AppErrorCode.ENT_001);
    return updated;
  }

  async delete(projectId: bigint, entityKey: string): Promise<void> {
    const result = await this.db
      .delete(schema.entities)
      .where(and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, entityKey)))
      .returning();

    if (result.length === 0) throw new ServerError(AppErrorCode.ENT_001);
  }
}
