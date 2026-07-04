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

export const TitleSchema = z.object({
  title: z.string().min(1).max(200).describe('chapter title, evocative and consistent with established chapter title style'),
  alternatives: z.array(z.string().max(200)).optional().describe('2-3 alternatives if uncertain'),
});

export type TitleOutput = z.infer<typeof TitleSchema>;
