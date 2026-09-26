import { Injectable } from '@shadow-library/app';

import { type ActionOp, type ActionType } from './change-set';

export interface ActionExecutionResult {
  summary: string;
  jobId?: string;
  runId?: string;
  proposalId?: string;
}

/** The card an action was accepted from, so a job it starts can report back to that chat. */
export interface ActionContext {
  proposalId: bigint;
  opIndex: number;
  sessionId: string | null;
  messageId: bigint | null;
}

export type ActionExecutor = (projectId: bigint, action: ActionOp, context: ActionContext) => Promise<ActionExecutionResult>;

/**
 * Maps action ops to the service calls that perform them. The registry lives here (dependency-free)
 * because GenerationModule already imports RefinementModule — the executors, which need the
 * generation/bible services, are registered by HubActionsModule at bootstrap.
 */
@Injectable()
export class ActionExecutorRegistry {
  private readonly executors = new Map<ActionType, ActionExecutor>();

  register(action: ActionType, executor: ActionExecutor): void {
    this.executors.set(action, executor);
  }

  has(action: ActionType): boolean {
    return this.executors.has(action);
  }

  get(action: ActionType): ActionExecutor | undefined {
    return this.executors.get(action);
  }
}
