import { and, asc, desc, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger, OffsetPaginationResult, utils } from '@shadow-library/common';
import { DatabaseService, StorageService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type Knowledge, type PrimaryDatabase, schema } from '@server/database';

import { type CreateEntityBody, type ListEntitiesQuery, type UpdateEntityBody } from './entity.dto';

export type EntityWithImages = Knowledge.Entity & { images: Knowledge.EntityImage[] };

// An entity as surfaced to the API: every stored `imagePath` ref gains its resolved public URL, built from
// the server's runtime `storage.public-origin` so the origin never has to be baked into the client bundle.
// The refs stay on these types for internal callers; only the URLs are declared on the response DTOs, so
// the serialiser is what keeps the refs off the wire.
export type PresentedEntity = Knowledge.Entity & { imageUrl?: string };
export type PresentedEntityImage = Knowledge.EntityImage & { imageUrl: string };
export type PresentedEntityWithImages = PresentedEntity & { images: PresentedEntityImage[] };

type UploadMime = 'image/png' | 'image/jpeg' | 'image/webp';

@Injectable()
export class EntityService {
  private readonly logger = Logger.getLogger(APP_NAME, EntityService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly storage: StorageService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  private present(entity: Knowledge.Entity): PresentedEntity {
    return { ...entity, imageUrl: this.storage.getPublicUrl(entity.imagePath) };
  }

  private presentWithImages(entity: EntityWithImages): PresentedEntityWithImages {
    const images = entity.images.map(image => ({ ...image, imageUrl: this.storage.getPublicUrl(image.imagePath) }));
    return { ...this.present(entity), images };
  }

  async create(projectId: bigint, body: CreateEntityBody): Promise<PresentedEntity> {
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
    return this.present(entity);
  }

  async list(projectId: bigint, filter: ListEntitiesQuery): Promise<OffsetPaginationResult<PresentedEntity>> {
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

    return utils.pagination.createResult(
      query,
      items.map(item => this.present(item)),
      total,
    );
  }

  get(projectId: bigint, entityKey: string): Promise<PresentedEntityWithImages | null> {
    return this.db.query.entities
      .findFirst({
        where: and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, entityKey)),
        with: { images: { orderBy: (img, { asc: ascOrder }) => [ascOrder(img.sortOrder), ascOrder(img.id)] } },
      })
      .then(r => (r ? this.presentWithImages(r) : null));
  }

  async update(projectId: bigint, entityKey: string, update: UpdateEntityBody): Promise<PresentedEntity> {
    const [result] = await this.db
      .update(schema.entities)
      .set({ ...update, updatedAt: new Date() })
      .where(and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, entityKey)))
      .returning()
      .catch(err => this.databaseService.translateError(err));

    if (!result) throw AppErrorCode.ENT_001.create();
    return this.present(result);
  }

  async setImage(projectId: bigint, entityKey: string, image: string, mime: 'image/png' | 'image/jpeg' | 'image/webp'): Promise<PresentedEntity> {
    const entity = await this.get(projectId, entityKey);
    if (!entity) throw AppErrorCode.ENT_001.create();

    // Content-addressed refs are immutable and deduplicated, so the previous object is left in place
    // (it may still back another row); replacing the portrait only repoints this entity's ref.
    const ref = await this.storage.save(new Uint8Array(Buffer.from(image, 'base64')), { contentType: mime });

    const [updated] = await this.db
      .update(schema.entities)
      .set({ imagePath: ref, updatedAt: new Date() })
      .where(and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, entityKey)))
      .returning();

    if (!updated) throw AppErrorCode.ENT_001.create();
    return this.present(updated);
  }

  async clearImage(projectId: bigint, entityKey: string): Promise<PresentedEntity> {
    const entity = await this.get(projectId, entityKey);
    if (!entity) throw AppErrorCode.ENT_001.create();

    const [updated] = await this.db
      .update(schema.entities)
      .set({ imagePath: null, updatedAt: new Date() })
      .where(and(eq(schema.entities.projectId, projectId), eq(schema.entities.entityKey, entityKey)))
      .returning();

    if (!updated) throw AppErrorCode.ENT_001.create();
    return this.present(updated);
  }

  async addImage(projectId: bigint, entityKey: string, image: string, mime: UploadMime, caption?: string): Promise<PresentedEntityWithImages> {
    const entity = await this.get(projectId, entityKey);
    if (!entity) throw AppErrorCode.ENT_001.create();

    const ref = await this.storage.save(new Uint8Array(Buffer.from(image, 'base64')), { contentType: mime });
    const nextOrder = entity.images.reduce((max, img) => Math.max(max, img.sortOrder + 1), 0);

    await this.db.insert(schema.entityImages).values({ entityId: entity.id, projectId, imagePath: ref, caption: caption ?? null, sortOrder: nextOrder });

    return this.getOrThrow(projectId, entityKey);
  }

  async deleteImageById(projectId: bigint, entityKey: string, imageId: bigint): Promise<PresentedEntityWithImages> {
    const entity = await this.get(projectId, entityKey);
    if (!entity) throw AppErrorCode.ENT_001.create();

    const image = entity.images.find(img => img.id === imageId);
    if (!image) throw AppErrorCode.ENT_002.create();

    // The content-addressed object is retained (it may back another row); only the gallery row is removed.
    await this.db.delete(schema.entityImages).where(and(eq(schema.entityImages.id, imageId), eq(schema.entityImages.projectId, projectId)));

    return this.getOrThrow(projectId, entityKey);
  }

  private async getOrThrow(projectId: bigint, entityKey: string): Promise<PresentedEntityWithImages> {
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
