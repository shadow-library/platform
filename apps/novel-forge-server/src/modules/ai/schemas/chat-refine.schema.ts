/**
 * Importing packages with side effects
 */

/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema({ additionalProperties: true })
export class ChatLookupItem {
  @Field({ description: 'the lookup tool name, exactly as listed in the playbook' })
  tool: string;

  @Field(() => Object, { optional: true, additionalProperties: true, description: 'the arguments for the tool' })
  args?: Record<string, unknown>;
}

@Schema()
export class ChatRefineSchema {
  @Field({ minLength: 1, description: 'the conversational reply to the user — ideas, critique, rationale for any proposed changes' })
  reply: string;

  @Field(() => [Object], { optional: true, description: 'change-set ops from the scope allowlist; omit entirely when the turn is discussion only' })
  changeSet?: Record<string, unknown>[];

  @Field(() => [ChatLookupItem], { optional: true, description: 'lookups to run before answering — hub scope only, never alongside a changeSet' })
  lookups?: { tool: string; args?: Record<string, unknown> }[];
}

export type ChatRefineOutput = ChatRefineSchema;

@Schema()
export class ChatCompactSchema {
  @Field({ minLength: 1, description: 'the folded summary: decisions made, directions rejected, open questions — dense, factual, no prose flourish' })
  summary: string;
}

export type ChatCompactOutput = ChatCompactSchema;
