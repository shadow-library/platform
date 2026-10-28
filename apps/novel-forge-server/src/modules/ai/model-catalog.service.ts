import { eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { type PrimaryDatabase, type Project, schema } from '@server/database';

import { type AiModelsAdminResponse, type AiModelsResponse } from './ai.dto';
import { COST_TIERS } from './defaults';
import { type CatalogSelectionModels, NovelForgeCatalogService } from './novel-forge-catalog.service';

export interface ProjectModels extends CatalogSelectionModels {
  contentMode: Project.ContentMode;
  costTier: Project.CostTier;
}

export interface ModelSelectionPreview {
  contentMode?: Project.ContentMode;
  costTier?: Project.CostTier;
}

@Injectable()
export class ModelCatalogService {
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly catalog: NovelForgeCatalogService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async authorOptions(): Promise<AiModelsResponse> {
    return { paces: [...COST_TIERS], unrestrictedAvailable: await this.catalog.unrestrictedAvailable() };
  }

  adminModels(): Promise<AiModelsAdminResponse> {
    return this.catalog.modelsResponse();
  }

  async projectModels(projectId: bigint, preview: ModelSelectionPreview = {}): Promise<ProjectModels> {
    const row = await this.db.query.projects.findFirst({
      where: eq(schema.projects.id, projectId),
      columns: { contentMode: true, costTier: true },
    });
    if (!row) throw AppErrorCode.PRJ_001.create();
    const selection = { contentMode: preview.contentMode ?? row.contentMode, costTier: preview.costTier ?? row.costTier };
    return { ...selection, ...(await this.catalog.selectionModels(selection)) };
  }
}
