import { Field, Schema } from '@shadow-library/class-schema';

@Schema({ additionalProperties: true })
class ChatLookupItem {
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

  // class-schema has no "any JSON value" type: every declared field is ajv-validated against its declared
  // shape whenever it's present, optional or not — `question: null`, `answers` sent as a string, a numeric
  // `why`, a string `recommended`, any of it would fail ajv validation for the WHOLE schema and take a
  // perfectly good reply and changeSet down with it into the repair ladder. `type: undefined` isn't exposed
  // by @Field's typed overloads, but it does reach the underlying JSON Schema merge — the field ends up with
  // no `type` keyword at all, so ajv accepts literally anything here. sanitizeChatQuestion (chat-question.ts)
  // is the only real validator, run once the model's output has already parsed.
  @Field({
    optional: true,
    type: undefined,
    description:
      "An identity decision the author has not made yet: 2-4 example answers with trade-offs and a recommendation, 'undecided for now' always accepted. Never alongside lookups. " +
      '{ question: string, why?: string, answers: [{ title: string, why?: string, tradeOff?: string, recommended?: boolean }], progressKey?: string } — any shape is accepted here, ' +
      "the server drops what doesn't fit.",
  } as never)
  question?: unknown;
}

export type ChatRefineOutput = ChatRefineSchema;

@Schema()
export class ChatCompactSchema {
  @Field({ minLength: 1, description: 'the folded summary: decisions made, directions rejected, open questions — dense, factual, no prose flourish' })
  summary: string;
}

export type ChatCompactOutput = ChatCompactSchema;
