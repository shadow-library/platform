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

export const FixSchema = z
  .object({
    action: z.enum(['patch', 'rewrite']).describe('patch = targeted find/replace; rewrite = full chapter replacement'),
    patches: z
      .array(
        z.object({
          find: z.string().min(1).describe('exact verbatim text to find in the draft — must be unique within the chapter'),
          replace: z.string().min(1).describe('replacement text; preserves surrounding prose style'),
        }),
      )
      .optional(),
    body: z.string().optional().describe('for rewrite only: complete replacement chapter prose'),
  })
  .refine(p => (p.action === 'patch' && p.patches && p.patches.length > 0) || (p.action === 'rewrite' && !!p.body), {
    message: 'patch requires at least one patches entry; rewrite requires body',
  });

export type FixOutput = z.infer<typeof FixSchema>;
