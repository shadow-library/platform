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

export const ReviewSchema = z.object({
  disposition: z.enum(['approve', 'revision_requested']),
  note: z.string().optional().describe('overall note to the author'),
  findings: z
    .array(
      z.object({
        severity: z.enum(['blocking', 'suggestion']),
        text: z.string().min(1).describe('specific finding with location if possible'),
      }),
    )
    .optional(),
});

export type ReviewOutput = z.infer<typeof ReviewSchema>;
