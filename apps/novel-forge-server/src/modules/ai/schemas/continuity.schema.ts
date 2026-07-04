/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { z } from 'zod';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export const ContinuitySchema = z.object({
  appeared: z.array(z.string()).describe('entityKeys of entities who appear in this chapter'),
  newEntities: z
    .array(
      z.object({
        entityKey: z.string().min(1),
        name: z.string().min(1),
        type: z.enum(['character', 'faction', 'location', 'power_rule', 'item', 'concept']),
        notes: z.string().optional(),
      }),
    )
    .describe('new entities introduced in this chapter not yet in the knowledge base'),
  threads: z.array(
    z.object({
      threadKey: z.string().min(1),
      status: z.enum(['open', 'closed']),
      summary: z.string().optional(),
    }),
  ),
  mysteries: z.array(
    z.object({
      mysteryKey: z.string().min(1),
      status: z.enum(['open', 'resolved']),
      question: z.string().optional(),
    }),
  ),
  timeline: z.array(
    z.object({
      whenText: z.string().optional(),
      event: z.string().min(1),
      significance: z.string().optional(),
    }),
  ),
  relationships: z.array(
    z.object({
      entityKey: z.string().min(1),
      targetKey: z.string().min(1),
      kind: z.string().min(1),
      note: z.string().optional(),
    }),
  ),
  power: z.array(
    z.object({
      character: z.string().min(1),
      stage: z.string().min(1),
      feat: z.string().optional(),
      next: z.string().optional(),
    }),
  ),
  chapterSummary: z.string().min(1).describe('2-3 sentence summary of what happened'),
});

export type ContinuityOutput = z.infer<typeof ContinuitySchema>;
