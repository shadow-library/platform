/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { eq } from 'drizzle-orm';
import { z } from 'zod';

/**
 * Importing user defined packages
 */
import * as schema from '@server/database/schemas';

import { type RegisteredTool } from '../types';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

const inputSchema = z.object({
  entityKey: z.string(),
});

const outputSchema = z.string();

export const getEntityTool: RegisteredTool = {
  allowedNodes: ['judge', 'review', 'validateWindow'],
  description: 'Retrieve a full entity card by entity key, including name, type, status, body, notes, aliases, and relationships.',
  handler: async (input: unknown, ctx): Promise<unknown> => {
    const parsed = inputSchema.parse(input);
    const entity = await ctx.db.query.entities.findFirst({
      where: (e, { and, eq: eqFn }) => and(eq(e.projectId, ctx.projectId), eqFn(e.entityKey, parsed.entityKey)),
    });
    if (!entity) return `Entity not found: ${parsed.entityKey}`;

    const [aliases, relationships] = await Promise.all([
      ctx.db.select().from(schema.entityAliases).where(eq(schema.entityAliases.entityId, entity.id)),
      ctx.db.query.entityRelationships.findMany({
        where: (r, { eq: eqFn }) => eqFn(r.entityId, entity.id),
      }),
    ]);

    const lines: string[] = [`**${entity.name}** (${entity.type}, ${entity.status ?? 'active'})`, `First seen: ch ${entity.firstSeenChapter ?? '?'}`];

    const body = entity.body ?? entity.notes ?? '';
    if (body) lines.push(body);
    if (aliases.length > 0) lines.push(`Aliases: ${aliases.map(a => a.alias).join(', ')}`);
    if (relationships.length > 0) {
      lines.push('Relationships:');
      for (const rel of relationships) {
        lines.push(`- ${rel.kind} → ${rel.targetKey}${rel.note ? `: ${rel.note}` : ''}`);
      }
    }
    return lines.join('\n');
  },
  inputSchema,
  maxCallsPerRun: 15,
  name: 'get_entity',
  outputSchema,
  tokensBudget: 3500,
};
