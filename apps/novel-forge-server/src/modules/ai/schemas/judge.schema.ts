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

export const JudgeSchema = z
  .object({
    verdict: z.enum(['consistent', 'contradiction']),
    findings: z.array(
      z.object({
        severity: z.enum(['hard', 'soft']).describe('hard = contradicts established canon and blocks acceptance; soft = wrinkle worth noting'),
        text: z.string().describe('one finding, citing the canon it conflicts with (chapter or tracker)'),
      }),
    ),
  })
  .refine(j => j.verdict === 'consistent' || j.findings.some(f => f.severity === 'hard'), {
    message: 'a contradiction verdict must include at least one hard finding',
  });

export type JudgeOutput = z.infer<typeof JudgeSchema>;
