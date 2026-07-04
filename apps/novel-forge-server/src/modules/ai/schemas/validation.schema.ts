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

export const ValidationIssueSchema = z.object({
  chapter: z.number().int().optional().describe('chapter number where the issue appears, omit for novel-scope issues'),
  severity: z.enum(['error', 'warning']),
  category: z.string().min(1).describe('e.g. continuity, timeline, character_consistency, power_scaling, plot_thread'),
  description: z.string().min(1),
  canonReference: z.string().optional().describe('cite the specific canon fact or chapter that conflicts'),
});

export const ValidationSchema = z.object({
  issues: z.array(ValidationIssueSchema),
  summary: z.string().min(1).describe('overall assessment: what is healthy and what needs attention'),
});

export type ValidationOutput = z.infer<typeof ValidationSchema>;
