import { Field, Schema } from '@shadow-library/class-schema';

import { HookType } from './enums';

@Schema()
export class EndingContractSchema {
  @Field(() => HookType, { description: 'the kind of hook the closing scene must land on' })
  hookType: 'cliffhanger' | 'revelation' | 'quiet_dread' | 'promise' | 'turn' | 'closure_with_momentum' | 'earned_rest';

  @Field({ minLength: 1, description: 'what the reader should feel on the last line' })
  emotionalBeat: string;

  @Field({ minLength: 1, description: 'the question the ending must leave open' })
  openQuestion: string;

  @Field({ minLength: 1, description: 'the situation the next chapter picks up from — specific enough for a different author to continue' })
  handoffState: string;

  @Field(() => [String], { optional: true, description: 'refs (e.g. "thread:heir_mystery") the ending must NOT resolve' })
  mustNotResolve?: string[];
}

/** Renders a brief's stored ending contract for the generation/judge prompts; '' when there is none. */
export function renderEndingContract(contract: unknown): string {
  if (!contract || typeof contract !== 'object') return '';
  const c = contract as Partial<EndingContractSchema>;
  const lines = [`Hook type: ${c.hookType ?? ''}`, `Emotional beat: ${c.emotionalBeat ?? ''}`, `Open question: ${c.openQuestion ?? ''}`, `Handoff state: ${c.handoffState ?? ''}`];
  if (c.mustNotResolve && c.mustNotResolve.length > 0) lines.push(`Must NOT resolve: ${c.mustNotResolve.join(', ')}`);
  return lines.join('\n');
}
