import { and, eq, getTableColumns } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { ownedBy, type OwnerFields, type OwnerRef } from '@server/common';
import { APP_NAME } from '@server/constants';
import { type AccountModelDefaultsData, type PrimaryDatabase, schema } from '@server/database';

import { ActorService } from '@modules/actor';

import { isRegisteredModel, type ResolvedModel } from './defaults';
import { MODEL_MAP } from './models';

export type AccountModelGroup = keyof AccountModelDefaultsData;

export const ACCOUNT_MODEL_GROUPS: readonly AccountModelGroup[] = ['writing', 'planning', 'review', 'chat', 'helper', 'image', 'ideation'];

@Injectable()
export class AccountSettingsService {
  private readonly logger = Logger.getLogger(APP_NAME, AccountSettingsService.name);
  private readonly db: PrimaryDatabase;

  constructor(
    databaseService: DatabaseService,
    private readonly actorService: ActorService,
  ) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  private owner(): OwnerRef {
    return this.actorService.current();
  }

  async getModels(): Promise<AccountModelDefaultsData> {
    const [row] = await this.db.select({ models: schema.accountSettings.models }).from(schema.accountSettings).where(ownedBy(schema.accountSettings, this.owner()));
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

    const owner = this.owner();
    const [row] = await this.db
      .insert(schema.accountSettings)
      .values({ ownerKind: owner.kind, ownerId: owner.id, models: cleaned })
      .onConflictDoUpdate({ target: [schema.accountSettings.ownerKind, schema.accountSettings.ownerId], set: { models: cleaned, updatedAt: new Date() } })
      .returning(getTableColumns(schema.accountSettings));
    return row?.models ?? cleaned;
  }

  /**
   * The owner's defaults for a project, read from the row it passed when that carries the owner, else looked up by id.
   * A read failure falls back to the platform defaults, as the quota check does: a database blip must not halt authoring.
   * A bot owner never has a row, so its projects resolve to the platform defaults by the same path.
   */
  async defaultsFor(project?: OwnerFields, projectId?: bigint): Promise<Partial<Record<AccountModelGroup, ResolvedModel>> | undefined> {
    try {
      if (project?.ownerId != null) {
        const [row] = await this.db
          .select({ models: schema.accountSettings.models })
          .from(schema.accountSettings)
          .where(ownedBy(schema.accountSettings, { kind: project.ownerKind, id: project.ownerId }));
        return row?.models;
      }
      if (projectId === undefined) return undefined;
      const [row] = await this.db
        .select({ models: schema.accountSettings.models })
        .from(schema.projects)
        .innerJoin(schema.accountSettings, and(eq(schema.accountSettings.ownerKind, schema.projects.ownerKind), eq(schema.accountSettings.ownerId, schema.projects.ownerId)))
        .where(eq(schema.projects.id, projectId));
      return row?.models;
    } catch (err) {
      this.logger.warn('account model defaults unavailable; using platform defaults', { projectId, error: err instanceof Error ? err.message : String(err) });
      return undefined;
    }
  }
}
