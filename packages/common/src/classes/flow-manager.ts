/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { AppError, ErrorCode, InternalError } from '@lib/errors';

/**
 * Defining types
 */

export type ContextUpdater<Context> = Partial<Context> | ((currentContext: Context) => Partial<Context>);

export interface ActionResult<StateName extends string, Context> {
  nextState: StateName;
  contextUpdates?: Partial<Context>;
}

export interface FlowStateDefinition<StateName extends string = string, Context extends Record<string, any> = Record<string, any>> {
  /** Function to determine the next possible states from the current state and context. */
  getNextStates?: (state: FlowState<StateName, Context>) => StateName[];

  /** Marks this state as a final state in the flow. */
  isFinal?: boolean;

  /** Called when leaving the state. Can return false to prevent transition, or partial context updates. */
  /* eslint-disable-next-line @typescript-eslint/no-invalid-void-type */
  onLeave?: (context: Context, nextState: StateName) => void | boolean | Partial<Context>;

  /** Called when entering the state. Can return partial context updates. */
  /* eslint-disable-next-line @typescript-eslint/no-invalid-void-type */
  onEnter?: (context: Context, prevState: StateName) => void | Partial<Context>;

  /** Action to be performed in this state. Can return the next state to transition to, or an object with nextState and context updates. */
  /* eslint-disable-next-line @typescript-eslint/no-invalid-void-type */
  action?: (context: Context) => void | ActionResult<StateName, Context>;
}

export interface FlowState<StateName extends string = string, Context extends Record<string, any> = Record<string, any>> {
  currentState: StateName;
  history: StateName[];
  context: Context;
}

export interface FlowDefinition<StateNames extends string = string, Context extends Record<string, any> = Record<string, any>> {
  name: string;
  maxDepth?: number;
  startState: StateNames;
  states: Record<StateNames, FlowStateDefinition<StateNames, Context>>;
}

export interface FlowStatus<StateNames extends string = string> {
  name: string;
  currentState: StateNames;
  availableTransitions: StateNames[];
  isComplete: boolean;
  history: StateNames[];
}

/**
 * Declaring the constants
 */

export class FlowManager<StateNames extends string = string, Context extends Record<string, any> = Record<string, any>> {
  private constructor(
    private readonly definition: FlowDefinition<StateNames, Context>,
    private readonly state: FlowState<StateNames, Context>,
  ) {}

  static create<StateNames extends string = string, Context extends Record<string, any> = Record<string, any>>(
    definition: FlowDefinition<StateNames, Context>,
    initialContext: Context = {} as Context,
  ): FlowManager<StateNames, Context> {
    const initialState: FlowState<StateNames, Context> = { currentState: definition.startState, history: [], context: initialContext };
    const flow = new FlowManager(definition, initialState);
    flow.settle();
    return flow;
  }

  static from<StateNames extends string = string, Context extends Record<string, any> = Record<string, any>>(
    definition: FlowDefinition<StateNames, Context>,
    stateOrSnapshot: FlowState<StateNames, Context> | string,
  ): FlowManager<StateNames, Context> {
    if (typeof stateOrSnapshot === 'string') {
      const parsed = JSON.parse(stateOrSnapshot);
      if (parsed.flowName !== definition.name) {
        const error = new AppError(ErrorCode.FLOW_SNAPSHOT_MISMATCH, { snapshotFlowName: parsed.flowName, currentFlowName: definition.name });
        /** Throwing an internal error for backward compatibility, need to remove in next major version */
        throw new InternalError(error.getMessage()).setCause(error);
      }
      stateOrSnapshot = parsed.state as FlowState<StateNames, Context>;
    }

    return new FlowManager(definition, stateOrSnapshot);
  }

  toSnapshot(): string {
    return JSON.stringify({ flowName: this.definition.name, state: this.state });
  }

  getCurrentState(): StateNames {
    return this.state.currentState;
  }

  getDefinition(): FlowDefinition<StateNames, Context> {
    return this.definition;
  }

  getHistory(): StateNames[] {
    return [...this.state.history];
  }

  isComplete(): boolean {
    return this.definition.states[this.state.currentState]?.isFinal === true;
  }

  getStatus(): FlowStatus<StateNames> {
    return {
      name: this.definition.name,
      currentState: this.getCurrentState(),
      availableTransitions: this.getAvailableTransitions(),
      isComplete: this.isComplete(),
      history: this.getHistory(),
    };
  }

  getContext(): Context {
    return this.state.context;
  }

  updateContext(updates: ContextUpdater<Context>): this {
    const actualUpdates = typeof updates === 'function' ? updates(this.state.context) : updates;
    Object.assign(this.state.context, actualUpdates);
    return this;
  }

  getAvailableTransitions(): StateNames[] {
    const stateDefinition = this.definition.states[this.state.currentState];
    return stateDefinition.getNextStates ? stateDefinition.getNextStates(this.state) : [];
  }

  peekTransitions(targetState: StateNames): StateNames[] {
    const stateDefinition = this.definition.states[targetState];
    if (!stateDefinition) {
      const error = new AppError(ErrorCode.UNKNOWN_FLOW_STATE, { targetState, flowName: this.definition.name });
      /** Throwing an internal error for backward compatibility, need to remove in next major version */
      throw new InternalError(error.getMessage()).setCause(error);
    }

    if (!stateDefinition.getNextStates) return [];
    const hypotheticalState: FlowState<StateNames, Context> = { currentState: targetState, history: this.state.history, context: this.state.context };
    return stateDefinition.getNextStates(hypotheticalState);
  }

  canTransitionTo(targetState: StateNames): boolean {
    const availableStates = this.getAvailableTransitions();
    return availableStates.includes(targetState);
  }

  private executeTransition(nextState: StateNames, contextUpdates?: ContextUpdater<Context>): this {
    const { currentState } = this.state;
    const currentStateDef = this.definition.states[currentState];
    const nextStateDef = this.definition.states[nextState];

    /** Validate next state */
    const availableTransitions = this.getAvailableTransitions();
    if (!availableTransitions.includes(nextState)) {
      const flowName = this.definition.name;
      const transitions = availableTransitions.join(', ');
      const error = new AppError(ErrorCode.INVALID_FLOW_TRANSITION, { currentState, targetState: nextState, flowName, allowed: transitions });
      /** Throwing an internal error for backward compatibility, need to remove in next major version */
      throw new InternalError(error.getMessage()).setCause(error);
    }

    /** Handle onLeave hook */
    let onLeaveUpdates: Partial<Context> | null = null;
    if (currentStateDef.onLeave) {
      const result = currentStateDef.onLeave(this.state.context, nextState);
      if (result === false) {
        const error = new AppError(ErrorCode.FLOW_GUARD_VIOLATION, { currentState, targetState: nextState });
        /** Throwing an internal error for backward compatibility, need to remove in next major version */
        throw new InternalError(error.getMessage()).setCause(error);
      } else if (typeof result === 'object') onLeaveUpdates = result;
    }

    /** Perform the transition */
    this.state.history.push(currentState);
    this.state.currentState = nextState;
    if (onLeaveUpdates) this.updateContext(onLeaveUpdates);
    if (contextUpdates) this.updateContext(contextUpdates);

    /** Handle onEnter hook */
    if (nextStateDef && nextStateDef.onEnter) {
      const result = nextStateDef.onEnter(this.state.context, currentState);
      if (typeof result === 'object') this.updateContext(result);
    }

    return this;
  }

  transitionTo(nextState: StateNames, contextUpdates?: ContextUpdater<Context>): this {
    this.executeTransition(nextState, contextUpdates);
    this.settle();
    return this;
  }

  private settle(): void {
    let depth = 0;
    const maxDepth = this.definition.maxDepth ?? 10;
    while (depth < maxDepth) {
      const stateDef = this.definition.states[this.state.currentState];
      if (!stateDef.action) return;

      const result = stateDef.action(this.state.context);
      if (!result) return;

      this.executeTransition(result.nextState, result.contextUpdates);
      depth += 1;
    }

    const error = new AppError(ErrorCode.FLOW_MAX_DEPTH_EXCEEDED, { maxDepth });
    /** Throwing an internal error for backward compatibility, need to remove in next major version */
    throw new InternalError(error.getMessage()).setCause(error);
  }
}
