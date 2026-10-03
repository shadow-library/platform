import { z } from 'zod';

import { type PrimaryDatabase } from '@server/database';

import { type RetrievalService } from '../retrieval';
import { type WebLookups } from '../web';

// ReadonlyDb enforces at compile time that tool handlers cannot call db.insert/update/delete.
type ReadonlyDb = Pick<PrimaryDatabase, 'query' | 'select'>;

export interface ToolContext {
  chapter: number | null;
  db: ReadonlyDb;
  node: string;
  projectId: bigint;
  retrieval: RetrievalService;
  runId: string;
  /** Set only for a chat turn while web search runs through Brave; the web tools refuse without it. */
  web?: WebLookups;
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
