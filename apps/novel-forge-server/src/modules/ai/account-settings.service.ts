import { eq, getTableColumns } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { ContextService } from '@shadow-library/fastify';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { APP_NAME } from '@server/constants';
import { type AccountModelDefaultsData, type PrimaryDatabase, schema } from '@server/database';

import { isRegisteredModel, type ResolvedModel } from './defaults';
import { MODEL_MAP } from './models';

export type AccountModelGroup = keyof AccountModelDefaultsData;

export const ACCOUNT_MODEL_GROUPS: readonly AccountModelGroup[] = ['writing', 'planning', 'review', 'chat', 'helper', 'image', 'ideation'];

interface OwnedProject {
  ownerId?: bigint | null;
}

@Injectable()
export class AccountSettingsService {
  private readonly logger = Logger.getLogger(APP_NAME, AccountSettingsService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly context: ContextService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  private ownerId(): bigint {
    return BigInt(this.context.getAuthPrincipal().sub);
  }

  async getModels(): Promise<AccountModelDefaultsData> {
    const [row] = await this.db.select({ models: schema.accountSettings.models }).from(schema.accountSettings).where(eq(schema.accountSettings.ownerId, this.ownerId()));
    return row?.models ?? {};
  }

  async updateModels(models: AccountModelDefaultsData): Promise<AccountModelDefaultsData> {
    const cleaned: AccountModelDefaultsData = {};
    for (const group of ACCOUNT_MODEL_GROUPS) {
      const ref = models[group];
      if (!ref) continue;
      if (!isRegisteredModel(ref)) throw AppErrorCode.AI_002.create();
      if ((MODEL_MAP[ref.model]?.kind === 'image') !== (group === 'image')) throw AppErrorCode.AI_002.create();
      cleaned[group] = { provider: ref.provider, model: ref.model };
    }

    const ownerId = this.ownerId();
    const [row] = await this.db
      .insert(schema.accountSettings)
      .values({ ownerId, models: cleaned })
      .onConflictDoUpdate({ target: schema.accountSettings.ownerId, set: { models: cleaned, updatedAt: new Date() } })
      .returning(getTableColumns(schema.accountSettings));
    return row?.models ?? cleaned;
  }

  /**
   * The owner's defaults for a project, read from the row it passed when that carries the owner, else looked up by id.
   * A read failure falls back to the platform defaults, as the quota check does: a database blip must not halt authoring.
   */
  async defaultsFor(project?: OwnedProject, projectId?: bigint): Promise<Partial<Record<AccountModelGroup, ResolvedModel>> | undefined> {
    try {
      if (project?.ownerId != null) {
        const [row] = await this.db.select({ models: schema.accountSettings.models }).from(schema.accountSettings).where(eq(schema.accountSettings.ownerId, project.ownerId));
        return row?.models;
      }
      if (projectId === undefined) return undefined;
      const [row] = await this.db
        .select({ models: schema.accountSettings.models })
        .from(schema.projects)
        .innerJoin(schema.accountSettings, eq(schema.accountSettings.ownerId, schema.projects.ownerId))
        .where(eq(schema.projects.id, projectId));
      return row?.models;
    } catch (err) {
      this.logger.warn('account model defaults unavailable; using platform defaults', { projectId, error: err instanceof Error ? err.message : String(err) });
      return undefined;
    }
  }
}
