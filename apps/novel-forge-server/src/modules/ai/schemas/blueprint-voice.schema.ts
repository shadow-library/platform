import { Field, Schema } from '@shadow-library/class-schema';

export const VOICE_LABEL_MAX = 60;
export const VOICE_LINE_MAX = 240;
export const VOICE_NOTES_MAX = 600;
export const VOICE_SAMPLE_MAX = 1_200;
export const VOICE_SAMPLES_MIN = 3;
export const VOICE_SAMPLES_MAX = 3;
export const VOICE_COACH_MAX = 400;

@Schema()
export class BlueprintVoiceSampleOut {
  @Field({ minLength: 1, maxLength: VOICE_LABEL_MAX, description: 'the voice in a few words, e.g. “Close third, dry”, “First person, present”' })
  label: string;

  @Field({ minLength: 1, maxLength: VOICE_LINE_MAX, description: 'what this voice buys the novel and what it costs it, in one line' })
  tradeoff: string;

  @Field({ minLength: 1, maxLength: VOICE_SAMPLE_MAX, description: 'the opening of chapter one written in this voice — two or three paragraphs, no more' })
  opening: string;
}

@Schema()
export class BlueprintVoiceSchema {
  @Field(() => [BlueprintVoiceSampleOut], { minItems: VOICE_SAMPLES_MIN, maxItems: VOICE_SAMPLES_MAX, description: 'the same opening in three genuinely different voices' })
  samples: BlueprintVoiceSampleOut[];

  @Field({ minLength: 1, maxLength: VOICE_COACH_MAX })
  coachMessage: string;
}

export type BlueprintVoiceOutput = BlueprintVoiceSchema;
