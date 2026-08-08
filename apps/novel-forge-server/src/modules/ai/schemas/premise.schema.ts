import { Field, Schema } from '@shadow-library/class-schema';

@Schema()
export class PremiseEnhanceSchema {
  @Field({
    minLength: 1,
    description:
      'the enhanced premise as an enticing back-cover-style summary (2-3 paragraphs) — the hook that makes a reader start; NOT a plot synopsis and never reveals how the story ends',
  })
  enhancedPremise: string;

  @Field({ minLength: 1, description: 'the opening hook — why a reader clicks chapter 1' })
  hook: string;

  @Field({ minLength: 1, description: 'what the protagonist stands to lose, and why it matters' })
  stakes: string;

  @Field({ minLength: 1, description: 'what drives the protagonist forward chapter after chapter' })
  protagonistDrive: string;

  @Field({ minLength: 1, description: 'the progression/power system and its visible ladder' })
  progressionSystem: string;

  @Field({ minLength: 1, description: 'how the premise sustains hundreds of serialized chapters — escalation room, arc seeds, reader-promise' })
  serializationNotes: string;

  @Field({ minLength: 1, description: 'primary genre and its conventions the story leans on' })
  genre: string;

  @Field(() => [String], { minItems: 1, description: 'core themes' })
  themes: string[];

  @Field(() => [Object], { minItems: 1, description: 'change-set ops: premise.update and bible_document.upsert only' })
  changeSet: Record<string, unknown>[];
}

export type PremiseEnhanceOutput = PremiseEnhanceSchema;
