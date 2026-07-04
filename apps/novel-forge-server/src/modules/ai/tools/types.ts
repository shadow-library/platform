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
import { type PrimaryDatabase } from '@server/database';

import { type RetrievalService } from '../retrieval';

/**
 * Defining types
 */

// ReadonlyDb enforces at compile time that tool handlers cannot call db.insert/update/delete.
export type ReadonlyDb = Pick<PrimaryDatabase, 'query' | 'select'>;

export interface ToolContext {
  chapter: number | null;
  db: ReadonlyDb;
  node: string;
  projectId: bigint;
  retrieval: RetrievalService;
  runId: string;
}

export interface RegisteredTool {
  allowedNodes: string[];
  description: string;
  handler: (input: unknown, ctx: ToolContext) => Promise<unknown>;
  inputSchema: z.ZodType;
  maxCallsPerRun: number;
  name: string;
  outputSchema: z.ZodType;
  tokensBudget: number;
}

/**
 * Declaring the constants
 */
