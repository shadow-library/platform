import { type Ai, type Job } from '@server/database';

/** Tells a client what to refetch, never what the state now is — a missed event costs a refetch, not a stale screen. */
export type ProjectEvent =
  | { type: 'run'; runId: string; graph: string; target: string; status: Ai.WorkflowRunStatus }
  | { type: 'job'; jobId: string; kind: Job.Kind; status: Job.Status }
  | { type: 'chat'; sessionId: string };

export type ProjectEventListener = (event: ProjectEvent) => void;
