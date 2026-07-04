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

export const BibleStageSchema = z.object({
  body: z.string().min(1).describe('prose content for this bible section'),
  entities: z
    .array(
      z.object({
        entityKey: z.string().min(1),
        name: z.string().min(1),
        type: z.enum(['character', 'faction', 'location', 'power_rule', 'item', 'concept']),
        significance: z.enum(['major', 'minor']).optional(),
        notes: z.string().optional(),
      }),
    )
    .optional()
    .describe('entities introduced in this section, if applicable'),
});

export type BibleStageOutput = z.infer<typeof BibleStageSchema>;
