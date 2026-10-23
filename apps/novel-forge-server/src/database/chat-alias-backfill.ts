import { and, inArray, sql } from 'drizzle-orm';
import { type PgDatabase, type PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { LEGACY_SLUG_ALIAS } from '@shadow-library/synapse';

import { chatSessions } from './schemas';

export type BackfillDatabase = Pick<PgDatabase<PgQueryResultHKT>, 'update'>;

export function slugsByAlias(aliases: Readonly<Record<string, string>> = LEGACY_SLUG_ALIAS): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const [slug, alias] of Object.entries(aliases)) grouped.set(alias, [...(grouped.get(alias) ?? []), slug]);
  return grouped;
}

/**
 * Corrects chats whose pin an older pod retargeted during the rollout (wrote `model_id` without `alias_key`); a rerun with nothing to correct changes nothing.
 * A pin cleared since also cleared `model_id`, so it is never brought back. Residual: a pin an older pod cleared nulls only `model_id` and stays pinned on Synapse.
 * `updated_at` is left alone so the chat list keeps its order.
 */
export async function backfillChatAliasKeys(db: BackfillDatabase, aliases: Readonly<Record<string, string>> = LEGACY_SLUG_ALIAS): Promise<number> {
  let filled = 0;
  for (const [alias, slugs] of slugsByAlias(aliases)) {
    const rows = await db
      .update(chatSessions)
      .set({ aliasKey: alias })
      .where(and(inArray(chatSessions.modelId, slugs), sql`${chatSessions.aliasKey} is distinct from ${alias}`))
      .returning({ id: chatSessions.id });
    filled += rows.length;
  }
  return filled;
}
