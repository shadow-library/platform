import { and, desc, eq, ne } from 'drizzle-orm';
import { z } from 'zod';

import { type Knowledge } from '@server/database';
import * as schema from '@server/database/schemas';

import { type RegisteredTool } from '../types';

const inputSchema = z.object({
  entityKey: z.string(),
});

const outputSchema = z.string();

const MAX_EVENTS = 20;

function describeEvents(events: Knowledge.CharacterEvent[]): string {
  return events
    .map(row => {
      const provisional = row.status === 'provisional' ? ' (pending finalize)' : '';
      return `- ch ${row.chapter} [${row.kind}]${provisional}: ${JSON.stringify(row.after)}`;
    })
    .join('\n');
}

export const getCharacterTimelineTool: RegisteredTool = {
  allowedNodes: ['chat-hub'],
  description: 'Retrieve how a character has changed, newest chapter first (location, condition, relationships — not mere appearances).',
  handler: async (input: unknown, ctx): Promise<unknown> => {
    const parsed = inputSchema.parse(input);
    const entity = await ctx.db.query.entities.findFirst({
      where: (e, { and: andFn, eq: eqFn }) => andFn(eqFn(e.projectId, ctx.projectId), eqFn(e.entityKey, parsed.entityKey)),
    });
    if (!entity) return `Entity not found: ${parsed.entityKey}`;

    const events = await ctx.db.query.characterEvents.findMany({
      where: and(eq(schema.characterEvents.projectId, ctx.projectId), eq(schema.characterEvents.entityId, entity.id), ne(schema.characterEvents.kind, 'appearance')),
      orderBy: [desc(schema.characterEvents.chapter), desc(schema.characterEvents.createdAt)],
      limit: MAX_EVENTS,
    });
    if (events.length === 0) return `No recorded changes for ${entity.name} yet.`;

    return [`**How ${entity.name} has changed:**`, describeEvents(events)].join('\n');
  },
  inputSchema,
  maxCallsPerRun: 10,
  name: 'get_character_timeline',
  outputSchema,
  tokensBudget: 2000,
};
