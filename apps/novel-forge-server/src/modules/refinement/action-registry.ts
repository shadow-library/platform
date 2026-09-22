import { Injectable } from '@shadow-library/app';

import { type ActionOp, type ActionType } from './change-set';

export interface ActionExecutionResult {
  summary: string;
  jobId?: string;
  runId?: string;
  proposalId?: string;
}

export interface ActionExecutionContext {
  // True when the action runs from an auto-mode turn — chain-producing executors then auto-apply the
  // proposal they staged; manual applies leave it pending for review.
  autoApplied: boolean;
  /**
   * True when the action is the tail of an author's Blueprint lock. The lock itself is the deliberate approval the pipeline's
   * never-auto-applied actions ask for, so it runs them directly rather than staging them — but it is not an auto-mode turn, and an
   * executor that stages a proposal of its own must still leave it for review.
   */
  blueprintLock?: boolean;
}

export type ActionExecutor = (projectId: bigint, action: ActionOp, ctx: ActionExecutionContext) => Promise<ActionExecutionResult>;

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
