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

export const CharacterArcSchema = z.object({
  character: z.string().min(1).describe('entityKey or name of the character'),
  arc: z.string().min(1).describe('development journey from novel start to end — what they learn, lose, or become'),
});

export const SkeletonSchema = z.object({
  characterArcs: z.array(CharacterArcSchema).min(1).describe('arcs for all major characters'),
  powerCurve: z.string().min(1).describe('narrative of how protagonist(s) power/ability evolves across the entire novel — peaks, setbacks, final level'),
  thematicStatement: z.string().optional().describe('the central theme as a single declarative sentence'),
});

export type SkeletonOutput = z.infer<typeof SkeletonSchema>;
