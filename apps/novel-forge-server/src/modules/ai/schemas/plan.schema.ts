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

export const VolumeSpecSchema = z.object({
  volumeKey: z.string().min(1).describe('snake_case identifier, e.g. vol_01_awakening'),
  ordinal: z.number().int().min(1),
  title: z.string().min(1),
  objective: z.string().min(1).describe('what this volume arc must accomplish in the novel'),
  conflict: z.string().min(1).describe('the central conflict or obstacle of this volume'),
  payoff: z.string().min(1).describe('how the conflict resolves at the end of this volume'),
  startChapter: z.number().int().min(1),
  endChapter: z.number().int().min(1),
  cast: z.array(z.string()).optional().describe('entityKeys of primary characters in this volume'),
});

export const PlanSchema = z
  .array(VolumeSpecSchema)
  .min(1)
  .refine(
    vols => {
      const sorted = [...vols].sort((a, b) => a.ordinal - b.ordinal);
      return sorted.every((v, i) => i === 0 || v.startChapter === (sorted[i - 1]?.endChapter ?? 0) + 1);
    },
    { message: 'volume chapter spans must be contiguous' },
  );

export type PlanOutput = z.infer<typeof PlanSchema>;
