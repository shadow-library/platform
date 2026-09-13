import { and, eq, ne } from 'drizzle-orm';

import { AppErrorCode } from '@server/classes';
import { type AuthzReader } from '@server/modules/authz';
import { type Bot, schema } from '@server/modules/infrastructure/datastore';

export const MANAGEABLE_BOT_STATUSES: Bot.Status[] = ['ACTIVE', 'SUSPENDED'];

/** Absent, deleted and foreign bots are all BOT_009, so the endpoints leak no cross-organisation existence. */
export async function findBot(db: AuthzReader, organisationId: bigint, botId: bigint): Promise<Bot> {
  const bot = await db.query.bots.findFirst({ where: and(eq(schema.bots.id, botId), eq(schema.bots.organisationId, organisationId), ne(schema.bots.status, 'DELETED')) });
  if (!bot) throw AppErrorCode.BOT_009.create();
  return bot;
}

export async function assertOrganisationActive(db: AuthzReader, organisationId: bigint): Promise<void> {
  const organisation = await db.query.organisations.findFirst({ where: eq(schema.organisations.id, organisationId), columns: { status: true } });
  if (organisation?.status !== 'ACTIVE') throw AppErrorCode.BOT_013.create();
}

export async function findManageableBot(db: AuthzReader, organisationId: bigint, botId: bigint): Promise<Bot> {
  const bot = await findBot(db, organisationId, botId);
  if (!MANAGEABLE_BOT_STATUSES.includes(bot.status)) throw AppErrorCode.BOT_010.create();
  await assertOrganisationActive(db, organisationId);
  return bot;
}
