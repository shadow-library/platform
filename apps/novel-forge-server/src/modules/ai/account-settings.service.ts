import { getTableColumns } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { DatabaseService } from '@shadow-library/modules';

import { AppErrorCode } from '@server/classes';
import { type OwnerRef } from '@server/common';
import { type PrimaryDatabase, type Project, schema } from '@server/database';

import { ActorService } from '@modules/actor';

import { ownerDefaultCostTier } from '../project/project/project-defaults';

export interface AccountSettingsData {
  defaultCostTier: Project.CostTier;
}

@Injectable()
export class AccountSettingsService {
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

  async get(): Promise<AccountSettingsData> {
    return { defaultCostTier: await ownerDefaultCostTier(this.db, this.owner()) };
  }

  async update(settings: AccountSettingsData): Promise<AccountSettingsData> {
    const owner = this.owner();
    if (owner.kind === 'bot') throw AppErrorCode.AI_016.create();
    const [row] = await this.db
      .insert(schema.accountSettings)
      .values({ ownerKind: owner.kind, ownerId: owner.id, defaultCostTier: settings.defaultCostTier })
      .onConflictDoUpdate({ target: [schema.accountSettings.ownerKind, schema.accountSettings.ownerId], set: { defaultCostTier: settings.defaultCostTier, updatedAt: new Date() } })
      .returning(getTableColumns(schema.accountSettings));
    return { defaultCostTier: row?.defaultCostTier ?? settings.defaultCostTier };
  }
}
