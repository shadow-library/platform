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

  @Field(() => [String], {
    optional: true,
    description:
      'concrete facts fixed on the page that later chapters must not contradict, one short entry each: exact figures and measurements, times, distances, injuries, ' +
      'possessions and where objects are, who knows or has been told what, promises made and questions left open. Carry forward every entry of the incoming ' +
      'CONTINUATION STATE that still holds, drop what this chapter changed, add what it newly fixed; at most 15 entries',
  })
  establishedFacts?: string[];
}

@Schema()
export class GenerationSchema {
  @Field({ minLength: 1, maxLength: 200, description: 'chapter title' })
  title: string;

  @Field({ minLength: 100, description: 'full chapter prose — scene content at the length the system prompt specifies' })
  body: string;

  @Field({ minLength: 1, description: '2-3 sentence summary of what happened, past tense' })
  summary: string;

  @Field(() => GenerationState, { optional: true })
  state?: GenerationState;
}

export type GenerationOutput = GenerationSchema;
