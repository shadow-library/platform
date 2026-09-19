import { z } from 'zod';

import * as schema from '@server/database/schemas';

import { type RegisteredTool } from '../types';

const inputSchema = z.object({
  section: z.enum(schema.bibleSection.enumValues),
  slug: z.string(),
});

const outputSchema = z.string();

export const getBibleDocumentTool: RegisteredTool = {
  allowedNodes: ['chat-hub'],
  description: 'Retrieve the full body of a bible document by section and slug, including its frontmatter and revision. Use before proposing bible_document.upsert.',
  handler: async (input: unknown, ctx): Promise<unknown> => {
    const parsed = inputSchema.parse(input);
    const doc = await ctx.db.query.bibleDocuments.findFirst({
      where: (d, { and, eq }) => and(eq(d.projectId, ctx.projectId), eq(d.section, parsed.section), eq(d.slug, parsed.slug)),
    });
    if (!doc) return `Bible document not found: ${parsed.section}/${parsed.slug}`;

    const lines: string[] = [`**${doc.section}/${doc.slug}** (rev ${doc.revision})`];
    if (doc.frontmatter && Object.keys(doc.frontmatter).length > 0) lines.push(`Frontmatter: ${JSON.stringify(doc.frontmatter)}`);
    lines.push(doc.body ?? '(empty)');
    return lines.join('\n');
  },
  inputSchema,
  maxCallsPerRun: 10,
  name: 'get_bible_document',
  outputSchema,
  tokensBudget: 6000,
};
