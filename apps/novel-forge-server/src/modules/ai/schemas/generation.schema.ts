import { Field, Schema } from '@shadow-library/class-schema';

@Schema()
export class GenerationState {
  @Field({ optional: true, description: 'the unresolved conflict/tension active at chapter end, if any' })
  openConflict?: string;

  @Field({ optional: true, description: 'where each on-scene character is, physically, at the cutoff' })
  characterPositions?: string;

  @Field({ optional: true, description: 'the exact last action, line, or decision — what the next chapter must resume from' })
  lastBeat?: string;

  @Field({ optional: true, description: 'POV character emotional state at cutoff' })
  emotionalState?: string;
}

@Schema()
export class GenerationSchema {
  @Field({ minLength: 1, maxLength: 200, description: 'chapter title' })
  title: string;

  @Field({ minLength: 100, description: 'full chapter prose — target 1,800-2,600 words of scene content' })
  body: string;

  @Field({ minLength: 1, description: '2-3 sentence summary of what happened, past tense' })
  summary: string;

  @Field(() => GenerationState, { optional: true })
  state?: GenerationState;
}

export type GenerationOutput = GenerationSchema;
