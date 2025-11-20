/**
 * Importing npm packages
 */

/**
 * Importing user defined packages
 */
import { InternalError } from '@lib/errors';

import { FlowDefinition, FlowManager, FlowState } from './flow-manager';

/**
 * Defining types
 */

interface ParsedSnapshot<StateNames extends string = string, Context extends Record<string, any> = Record<string, any>> {
  flowName: string;
  state: FlowState<StateNames, Context>;
}

/**
 * Declaring the constants
 */

export class FlowRegistry {
  private readonly flows = new Map<string, FlowDefinition<any, any>>();

  register(definition: FlowDefinition<any, any>): this {
    if (this.flows.has(definition.name)) throw new InternalError(`Flow definition '${definition.name}' is already registered`);
    this.flows.set(definition.name, definition);
    return this;
  }

  registerAll(definitions: FlowDefinition<any, any>[]): this {
    definitions.forEach(def => this.register(def));
    return this;
  }

  unregister(flowName: string): boolean {
    return this.flows.delete(flowName);
  }

  clear(): void {
    this.flows.clear();
  }

  has(flowName: string): boolean {
    return this.flows.has(flowName);
  }

  get<StateNames extends string = string, Context extends Record<string, any> = Record<string, any>>(flowName: string): FlowDefinition<StateNames, Context> {
    const definition = this.flows.get(flowName);
    if (!definition) throw new InternalError(`Flow definition '${flowName}' is not registered`);
    return definition as FlowDefinition<StateNames, Context>;
  }

  getRegisteredFlows(): string[] {
    return Array.from(this.flows.keys());
  }

  create<StateNames extends string = string, Context extends Record<string, any> = Record<string, any>>(
    flowName: string,
    initialContext: Context = {} as Context,
  ): FlowManager<StateNames, Context> {
    const definition = this.get<StateNames, Context>(flowName);
    return FlowManager.create(definition, initialContext);
  }

  restore<StateNames extends string = string, Context extends Record<string, any> = Record<string, any>>(snapshot: string): FlowManager<StateNames, Context> {
    const parsed: ParsedSnapshot<StateNames, Context> = JSON.parse(snapshot);
    if (!parsed.flowName) throw new InternalError('Snapshot missing flowName field');
    const definition = this.get<StateNames, Context>(parsed.flowName);
    return FlowManager.from(definition, parsed.state);
  }

  getFlowName(snapshot: string): string {
    const match = snapshot.match(/"flowName"\s*:\s*"([^"]+)"/);
    if (!match) throw new InternalError('Snapshot missing flowName field');
    return match[1] as string;
  }
}
