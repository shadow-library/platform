/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { InternalError } from '@lib/errors';

/**
 * Defining types
 */

export interface FlowStateDefinition<StateName extends string = string, Context extends Record<string, any> = Record<string, any>> {
  getNextStates?: (state: FlowState<StateName, Context>) => StateName[];
  isFinal?: boolean;
}

export interface FlowState<StateName extends string = string, Context extends Record<string, any> = Record<string, any>> {
  currentState: StateName;
  history: StateName[];
  context: Context;
}

export interface FlowDefinition<StateNames extends string = string, Context extends Record<string, any> = Record<string, any>> {
  name: string;
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
    return new FlowManager(definition, initialState);
  }

  static from<StateNames extends string = string, Context extends Record<string, any> = Record<string, any>>(
    definition: FlowDefinition<StateNames, Context>,
    stateOrSnapshot: FlowState<StateNames, Context> | string,
  ): FlowManager<StateNames, Context> {
    if (typeof stateOrSnapshot === 'string') {
      const parsed = JSON.parse(stateOrSnapshot);
      if (parsed.flowName !== definition.name) throw new InternalError(`Snapshot definition '${parsed.flowName}' does not match provided definition '${definition.name}'`);
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

  updateContext(updates: Partial<Context>): this {
    Object.assign(this.state.context, updates);
    return this;
  }

  getAvailableTransitions(): StateNames[] {
    const stateDefinition = this.definition.states[this.state.currentState];
    return stateDefinition.getNextStates ? stateDefinition.getNextStates(this.state) : [];
  }

  canTransitionTo(targetState: StateNames): boolean {
    const availableStates = this.getAvailableTransitions();
    return availableStates.includes(targetState);
  }

  transitionTo(nextState: StateNames, contextUpdates: Partial<Context> = {}): this {
    const availableTransitions = this.getAvailableTransitions();
    if (!availableTransitions.includes(nextState)) {
      const from = this.state.currentState;
      const flowName = this.definition.name;
      const transitions = availableTransitions.join(', ');
      throw new InternalError(`Invalid transition from '${from}' to '${nextState}' in flow '${flowName}'. Available transitions: [${transitions}]`);
    }

    this.state.history.push(this.state.currentState);
    this.state.currentState = nextState;
    this.updateContext(contextUpdates);
    return this;
  }
}
