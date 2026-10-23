import assert from 'node:assert';

import { and, desc, eq, InferInsertModel, max } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { PrimaryDatabase, type PrimaryTransaction, schema, Template } from '@server/database';

import { TemplateResolverService } from './template-resolver.service';
import { lockVersionedParent, rethrowTransactionError } from './version-transaction.util';

export type CreatePartial = Omit<InferInsertModel<typeof schema.partials>, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdatePartial = Partial<Pick<CreatePartial, 'name' | 'description' | 'isActive'>>;
export type PartialWithVersions = Template.Partial & { versions: Template.PartialVersion[] };

export interface SavePartialDraftData {
  body: string;
  notes?: string;
}

export interface PartialPublishOptions {
  notes?: string;
  editedBy?: string;
}

@Injectable()
export class PartialService {
  private readonly logger = Logger.getLogger(APP_NAME, PartialService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly resolver: TemplateResolverService,
  ) {
    this.db = this.databaseService.getPostgresClient();
  }

  async createPartial(data: CreatePartial): Promise<Template.Partial> {
    const [partial] = await this.db
      .insert(schema.partials)
      .values(data)
      .returning()
      .catch(err => this.databaseService.translateError(err));
    assert(partial, 'Failed to create partial');
    this.logger.info(`Created partial '${partial.partialKey}'`, { partialId: partial.id });
    return partial;
  }

  listPartials(): Promise<Template.Partial[]> {
    return this.db.query.partials.findMany({ orderBy: desc(schema.partials.updatedAt) });
  }

  async getPartial(idOrKey: bigint | string): Promise<PartialWithVersions | null> {
    const partial = await this.db.query.partials.findFirst({
      where: typeof idOrKey === 'bigint' ? eq(schema.partials.id, idOrKey) : eq(schema.partials.partialKey, idOrKey),
      with: { versions: { orderBy: desc(schema.partialVersions.version) } },
    });
    return partial ?? null;
  }

  async getPartialOrThrow(id: bigint): Promise<Template.Partial> {
    const partial = await this.db.query.partials.findFirst({ where: eq(schema.partials.id, id) });
    if (!partial) throw AppErrorCode.TPL_PRT_001.create();
    return partial;
  }

  async updatePartial(id: bigint, update: UpdatePartial): Promise<Template.Partial> {
    const [partial] = await this.db
      .update(schema.partials)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(schema.partials.id, id))
      .returning();
    if (!partial) throw AppErrorCode.TPL_PRT_001.create();
    return partial;
  }

  getDraft(partialId: bigint): Promise<Template.PartialVersion | undefined> {
    return this.findVersion(this.db, partialId, 'DRAFT');
  }

  async saveDraft(partialId: bigint, data: SavePartialDraftData, editedBy?: string): Promise<Template.PartialVersion> {
    return this.db
      .transaction(async tx => {
        await this.lockPartial(tx, partialId);
        const existing = await this.findVersion(tx, partialId, 'DRAFT');
        if (existing) {
          const [row] = await tx
            .update(schema.partialVersions)
            .set({ body: data.body, notes: data.notes, editedBy, updatedAt: new Date() })
            .where(eq(schema.partialVersions.id, existing.id))
            .returning();
          assert(row, 'Failed to update partial draft');
          return row;
        }
        const [maxRow] = await tx
          .select({ value: max(schema.partialVersions.version) })
          .from(schema.partialVersions)
          .where(eq(schema.partialVersions.partialId, partialId));
        const [row] = await tx
          .insert(schema.partialVersions)
          .values({ partialId, version: (maxRow?.value ?? 0) + 1, status: 'DRAFT', body: data.body, notes: data.notes, editedBy })
          .returning();
        assert(row, 'Failed to open partial draft');
        return row;
      })
      .catch(err => rethrowTransactionError(this.databaseService, err));
  }

  async publishPartial(partialId: bigint, options: PartialPublishOptions = {}): Promise<Template.PartialVersion> {
    const published = await this.db
      .transaction(async tx => {
        await this.lockPartial(tx, partialId);
        const draft = await this.findVersion(tx, partialId, 'DRAFT');
        if (!draft) throw AppErrorCode.TPL_PUB_001.create();
        await tx
          .update(schema.partialVersions)
          .set({ status: 'ARCHIVED', updatedAt: new Date() })
          .where(and(eq(schema.partialVersions.partialId, partialId), eq(schema.partialVersions.status, 'PUBLISHED')));
        const [row] = await tx
          .update(schema.partialVersions)
          .set({ status: 'PUBLISHED', publishedAt: new Date(), notes: options.notes ?? draft.notes, editedBy: options.editedBy ?? draft.editedBy, updatedAt: new Date() })
          .where(eq(schema.partialVersions.id, draft.id))
          .returning();
        assert(row, 'Failed to publish partial');
        return row;
      })
      .catch(err => rethrowTransactionError(this.databaseService, err));
    this.resolver.invalidatePartials();
    this.logger.info(`Published partial ${partialId} as v${published.version}`);
    return published;
  }

  private async lockPartial(tx: PrimaryTransaction, partialId: bigint): Promise<void> {
    if (!(await lockVersionedParent(tx, schema.partials, partialId))) throw AppErrorCode.TPL_PRT_001.create();
  }

  private findVersion(executor: PrimaryDatabase | PrimaryTransaction, partialId: bigint, status: 'DRAFT' | 'PUBLISHED'): Promise<Template.PartialVersion | undefined> {
    return executor.query.partialVersions.findFirst({
      where: and(eq(schema.partialVersions.partialId, partialId), eq(schema.partialVersions.status, status)),
      orderBy: desc(schema.partialVersions.version),
    });
  }
}
