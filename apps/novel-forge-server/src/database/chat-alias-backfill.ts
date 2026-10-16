import { and, inArray, sql } from 'drizzle-orm';
import { type PgDatabase, type PgQueryResultHKT } from 'drizzle-orm/pg-core';
import { LEGACY_SLUG_ALIAS } from '@shadow-library/synapse';

import { chatSessions } from './schemas';

export type BackfillDatabase = Pick<PgDatabase<PgQueryResultHKT>, 'update'>;

/** The legacy slugs that map to each alias, so the backfill writes one plain value per statement. */
export function slugsByAlias(aliases: Readonly<Record<string, string>> = LEGACY_SLUG_ALIAS): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const [slug, alias] of Object.entries(aliases)) grouped.set(alias, [...(grouped.get(alias) ?? []), slug]);
  return grouped;
}

/**
 * Reconciles every chat pinned to a registry slug with the Synapse alias that slug maps to, so a pin an older pod retargeted during the rollout,
 * which wrote `model_id` without `alias_key`, is corrected on the next migrate. A rerun with nothing retargeted changes nothing. A pin cleared or
 * replaced on the Synapse backend clears `model_id` as well, so it is never brought back, and a slug the map does not know stays a legacy-only pin.
 * Accepted residual: a pin an older pod cleared during the rollout nulls only `model_id`, so it keeps its `alias_key` and stays pinned on Synapse.
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
