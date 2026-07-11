/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Injectable } from '@shadow-library/app';

/**
 * Importing user defined packages
 */
import { type ActionOp, type ActionType } from './change-set';

/**
 * Defining types
 */

export interface ActionExecutionResult {
  summary: string;
  jobId?: string;
  runId?: string;
  proposalId?: string;
}

export interface ActionExecutionContext {
  // True when the action runs from an auto-mode turn — chain-producing executors then auto-apply the
  // proposal they staged (chat-hub design §4.2); manual applies leave it pending for review.
  autoApplied: boolean;
}

export type ActionExecutor = (projectId: bigint, action: ActionOp, ctx: ActionExecutionContext) => Promise<ActionExecutionResult>;

/**
 * Declaring the constants
 */

/**
 * Maps action ops to the service calls that perform them. The registry lives here (dependency-free)
 * because GenerationModule already imports RefinementModule — the executors, which need the
 * generation/bible services, are registered by HubActionsModule at bootstrap (chat-hub design §5.3).
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
