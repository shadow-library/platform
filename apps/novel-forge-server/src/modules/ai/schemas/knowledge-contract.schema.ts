import { Field, Schema } from '@shadow-library/class-schema';

const KEY_PATTERN = '^[a-z0-9_]+$';

@Schema()
export class KnowledgeRevealSchema {
  @Field({ pattern: KEY_PATTERN, description: 'entity key of the character who learns the fact on-page this chapter' })
  entityKey: string;

  @Field({ pattern: KEY_PATTERN, description: 'key of the canon fact being revealed' })
  factKey: string;
}

/** A brief's epistemic contract (character-knowledge design §3) — absent, the chapter is unfiltered. */
@Schema()
export class KnowledgeContractSchema {
  @Field(() => [String], { minItems: 1, description: 'entity keys whose ledgered knowledge bounds what the chapter may state' })
  pov: string[];

  @Field(() => [KnowledgeRevealSchema], { optional: true, description: 'facts discovered on-page during this chapter; ledgered when the draft is approved' })
  learns?: KnowledgeRevealSchema[];
}
