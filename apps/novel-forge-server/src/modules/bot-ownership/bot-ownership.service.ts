import { and, count, eq } from 'drizzle-orm';
import { Injectable } from '@shadow-library/app';
import { Logger } from '@shadow-library/common';
import { DatabaseService } from '@shadow-library/modules';

import { APP_NAME } from '@server/constants';
import { type PrimaryDatabase, schema } from '@server/database';

import { type BotOwnershipResponse, type TransferOwnershipResponse } from './bot-ownership.dto';

@Injectable()
export class BotOwnershipService {
  private readonly logger = Logger.getLogger(APP_NAME, BotOwnershipService.name);
  private readonly db: PrimaryDatabase;

  constructor(databaseService: DatabaseService) {
    this.db = databaseService.getPostgresClient() as PrimaryDatabase;
  }

  async countOwned(botId: bigint): Promise<BotOwnershipResponse> {
    const [projects, illustrations] = await Promise.all([
      this.db
        .select({ total: count() })
        .from(schema.projects)
        .where(and(eq(schema.projects.ownerKind, 'bot'), eq(schema.projects.ownerId, botId))),
      this.db
        .select({ total: count() })
        .from(schema.illustrations)
        .where(and(eq(schema.illustrations.ownerKind, 'bot'), eq(schema.illustrations.ownerId, botId))),
    ]);
    return { projects: projects[0]?.total ?? 0, illustrations: illustrations[0]?.total ?? 0 };
  }

  /**
   * `organisation_id` is deliberately left as it is: it is what `shared_with_org` shares into, so
   * clearing it would silently drop the organisation's access to a project the bot had opened to it.
   *
   * `toUserId` is not validated — this service knows no users. Identity owns the bot, the organisation and
   * its membership, and the scope is granted to identity alone, so it is trusted to name a member of the
   * organisation the bot acted for.
   */
  async transferToUser(botId: bigint, toUserId: bigint): Promise<TransferOwnershipResponse> {
    const owner = { ownerKind: 'user', ownerId: toUserId } as const;
    const transferred = await this.db.transaction(async tx => {
      const projects = await tx
        .update(schema.projects)
        .set(owner)
        .where(and(eq(schema.projects.ownerKind, 'bot'), eq(schema.projects.ownerId, botId)))
        .returning({ id: schema.projects.id });
      const illustrations = await tx
        .update(schema.illustrations)
        .set(owner)
        .where(and(eq(schema.illustrations.ownerKind, 'bot'), eq(schema.illustrations.ownerId, botId)))
        .returning({ id: schema.illustrations.id });
      return { projects: projects.length, illustrations: illustrations.length };
    });

    this.logger.info('transferred bot-owned records to a user', { botId: botId.toString(), toUserId: toUserId.toString(), ...transferred });
    return transferred;
  }
}
