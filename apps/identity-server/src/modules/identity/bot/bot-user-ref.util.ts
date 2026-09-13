import { inArray } from 'drizzle-orm';

import { type AuthzReader } from '@server/modules/authz';
import { schema } from '@server/modules/infrastructure/datastore';

import { type BotUserRef } from './bot.types';

export type BotUserRefLookup = (id: bigint | null) => BotUserRef | null;

export async function resolveUserRefs(db: AuthzReader, userIds: (bigint | null)[]): Promise<BotUserRefLookup> {
  const ids = [...new Set(userIds.filter((id): id is bigint => id !== null))];
  const profiles =
    ids.length === 0
      ? []
      : await db.query.userProfiles.findMany({
          where: inArray(schema.userProfiles.userId, ids),
          columns: { userId: true, displayName: true, firstName: true, lastName: true },
        });
  const names = new Map(profiles.map(profile => [profile.userId, profile.displayName ?? ([profile.firstName, profile.lastName].filter(Boolean).join(' ') || null)]));
  // The fastify response transformer mutates a structuredClone that preserves aliasing, so a shared ref instance fails serialisation the second time it is visited.
  return id => (id === null ? null : { id, displayName: names.get(id) ?? null });
}
