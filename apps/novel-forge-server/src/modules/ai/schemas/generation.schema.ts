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

export const GenerationSchema = z.object({
  title: z.string().min(1).max(200).describe('chapter title'),
  body: z.string().min(100).describe('full chapter prose — target 1800-2200 words of scene content'),
  summary: z.string().min(1).describe('2-3 sentence summary of what happened, past tense'),
  state: z
    .object({
      storyMoment: z.string().optional().describe('brief phrase describing the narrative moment at chapter end'),
    })
    .optional(),
});

export type GenerationOutput = z.infer<typeof GenerationSchema>;
