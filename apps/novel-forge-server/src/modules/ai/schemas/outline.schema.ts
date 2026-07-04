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

export const ChapterBriefSchema = z.object({
  chapter: z.number().int(),
  volumeKey: z.string().min(1),
  title: z.string().min(1),
  objective: z.string().min(1).describe('what this chapter must accomplish in the story arc'),
  events: z.array(z.string().min(1)).min(1).describe('key events in this chapter, in order'),
  requiredContext: z
    .array(z.string())
    .describe(
      'context ref strings this chapter needs (e.g. "entity:iron_covenant", "thread:heir_mystery", "chapter:12") — select from the catalog provided, most important first; ordering determines eviction priority',
    ),
  pov: z.string().optional().describe('entityKey of the POV character'),
});

export const OutlineSchema = z.array(ChapterBriefSchema);

export type OutlineOutput = z.infer<typeof OutlineSchema>;
export type ChapterBriefOutput = z.infer<typeof ChapterBriefSchema>;
