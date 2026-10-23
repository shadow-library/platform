import assert from 'node:assert';

import { and, desc, eq, InferInsertModel, max } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { PrimaryDatabase, type PrimaryTransaction, schema, Template } from '@server/database';

import { buildRenderGlobals } from './render-context';
import { TemplateEngineService } from './rendering/template-engine.service';
import { TemplateResolverService } from './template-resolver.service';
import { buildSampleData, parseUndefinedVariable } from './variable-schema.util';
import { lockVersionedParent, rethrowTransactionError } from './version-transaction.util';

export type CreateLayout = Omit<InferInsertModel<typeof schema.layouts>, 'id' | 'createdAt' | 'updatedAt'>;
export type UpdateLayout = Partial<Pick<CreateLayout, 'name' | 'description' | 'isActive'>>;
export type LayoutWithVersions = Template.Layout & { versions: Template.LayoutVersion[] };

export interface SaveLayoutDraftData {
  body: string;
  notes?: string;
}

export interface LayoutPublishOptions {
  notes?: string;
  editedBy?: string;
}

const PROBE_CONTENT = '<p>preview</p>';

@Injectable()
export class LayoutService {
  private readonly logger = Logger.getLogger(APP_NAME, LayoutService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly resolver: TemplateResolverService,
    private readonly engine: TemplateEngineService,
  ) {
    this.db = this.databaseService.getPostgresClient();
  }

  async createLayout(data: CreateLayout): Promise<Template.Layout> {
    const [layout] = await this.db
      .insert(schema.layouts)
      .values(data)
      .returning()
      .catch(err => this.databaseService.translateError(err));
    assert(layout, 'Failed to create layout');
    this.logger.info(`Created layout '${layout.layoutKey}'`, { layoutId: layout.id });
    return layout;
  }

  listLayouts(): Promise<Template.Layout[]> {
    return this.db.query.layouts.findMany({ orderBy: desc(schema.layouts.updatedAt) });
  }

  async getLayout(idOrKey: bigint | string): Promise<LayoutWithVersions | null> {
    const layout = await this.db.query.layouts.findFirst({
      where: typeof idOrKey === 'bigint' ? eq(schema.layouts.id, idOrKey) : eq(schema.layouts.layoutKey, idOrKey),
      with: { versions: { orderBy: desc(schema.layoutVersions.version) } },
    });
    return layout ?? null;
  }

  async getLayoutOrThrow(id: bigint): Promise<Template.Layout> {
    const layout = await this.db.query.layouts.findFirst({ where: eq(schema.layouts.id, id) });
    if (!layout) throw AppErrorCode.TPL_LYT_001.create();
    return layout;
  }

  async updateLayout(id: bigint, update: UpdateLayout): Promise<Template.Layout> {
    const [layout] = await this.db
      .update(schema.layouts)
      .set({ ...update, updatedAt: new Date() })
      .where(eq(schema.layouts.id, id))
      .returning();
    if (!layout) throw AppErrorCode.TPL_LYT_001.create();
    return layout;
  }

  getDraft(layoutId: bigint): Promise<Template.LayoutVersion | undefined> {
    return this.findVersion(this.db, layoutId, 'DRAFT');
  }

  async saveDraft(layoutId: bigint, data: SaveLayoutDraftData, editedBy?: string): Promise<Template.LayoutVersion> {
    return this.db
      .transaction(async tx => {
        await this.lockLayout(tx, layoutId);
        const existing = await this.findVersion(tx, layoutId, 'DRAFT');
        if (existing) {
          const [row] = await tx
            .update(schema.layoutVersions)
            .set({ body: data.body, notes: data.notes, editedBy, updatedAt: new Date() })
            .where(eq(schema.layoutVersions.id, existing.id))
            .returning();
          assert(row, 'Failed to update layout draft');
          return row;
        }
        const [maxRow] = await tx
          .select({ value: max(schema.layoutVersions.version) })
          .from(schema.layoutVersions)
          .where(eq(schema.layoutVersions.layoutId, layoutId));
        const [row] = await tx
          .insert(schema.layoutVersions)
          .values({ layoutId, version: (maxRow?.value ?? 0) + 1, status: 'DRAFT', body: data.body, notes: data.notes, editedBy })
          .returning();
        assert(row, 'Failed to open layout draft');
        return row;
      })
      .catch(err => rethrowTransactionError(this.databaseService, err));
  }

  async publishLayout(layoutId: bigint, options: LayoutPublishOptions = {}): Promise<Template.LayoutVersion> {
    await this.getLayoutOrThrow(layoutId);
    const gated = await this.getDraft(layoutId);
    if (!gated) throw AppErrorCode.TPL_PUB_001.create();
    await this.assertLayoutRenders(gated.body);

    const published = await this.db
      .transaction(async tx => {
        await this.lockLayout(tx, layoutId);
        const draft = await this.findVersion(tx, layoutId, 'DRAFT');
        if (!draft) throw AppErrorCode.TPL_PUB_001.create();
        if (draft.id !== gated.id || draft.body !== gated.body) throw AppErrorCode.TPL_PUB_005.create();
        await tx
          .update(schema.layoutVersions)
          .set({ status: 'ARCHIVED', updatedAt: new Date() })
          .where(and(eq(schema.layoutVersions.layoutId, layoutId), eq(schema.layoutVersions.status, 'PUBLISHED')));
        const [row] = await tx
          .update(schema.layoutVersions)
          .set({ status: 'PUBLISHED', publishedAt: new Date(), notes: options.notes ?? draft.notes, editedBy: options.editedBy ?? draft.editedBy, updatedAt: new Date() })
          .where(eq(schema.layoutVersions.id, draft.id))
          .returning();
        assert(row, 'Failed to publish layout');
        return row;
      })
      .catch(err => rethrowTransactionError(this.databaseService, err));
    this.resolver.invalidateLayouts();
    this.logger.info(`Published layout ${layoutId} as v${published.version}`);
    return published;
  }

  private async lockLayout(tx: PrimaryTransaction, layoutId: bigint): Promise<void> {
    if (!(await lockVersionedParent(tx, schema.layouts, layoutId))) throw AppErrorCode.TPL_LYT_001.create();
  }

  private findVersion(executor: PrimaryDatabase | PrimaryTransaction, layoutId: bigint, status: 'DRAFT' | 'PUBLISHED'): Promise<Template.LayoutVersion | undefined> {
    return executor.query.layoutVersions.findFirst({
      where: and(eq(schema.layoutVersions.layoutId, layoutId), eq(schema.layoutVersions.status, status)),
      orderBy: desc(schema.layoutVersions.version),
    });
  }

  private async assertLayoutRenders(body: string): Promise<void> {
    const partials = await this.resolver.publishedPartials();
    try {
      await this.engine.render({
        channel: 'EMAIL',
        subject: null,
        body: PROBE_CONTENT,
        layout: body,
        partials,
        data: { ...buildRenderGlobals(), ...buildSampleData({ variables: {} }) },
      });
    } catch (error) {
      const variable = parseUndefinedVariable(error);
      this.logger.warn('Layout publish validation failed', { error });
      throw AppErrorCode.TPL_PUB_003.create({ variable: variable ?? 'unknown', channel: 'EMAIL', locale: 'layout' });
    }
  }
}
