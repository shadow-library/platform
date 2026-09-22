import { Field, Schema } from '@shadow-library/class-schema';

import { PROMISE_DRIVERS, PROMISE_LENGTHS } from '@server/common';

export const PROMISE_FIT_MAX = 200;
export const PROMISE_NOTE_MAX = 200;
export const PROMISE_TONE_MAX = 60;
export const PROMISE_TONES_MIN = 3;
export const PROMISE_TONES_MAX = 5;
export const PROMISE_TEXT_MAX = 200;
export const PROMISES_MIN = 3;
export const PROMISES_MAX = 5;
export const PROMISE_WRITER_LINE_MAX = 240;

@Schema()
export class BlueprintPromiseDriverOut {
  @Field(() => String, { enum: [...PROMISE_DRIVERS] })
  id: string;

  @Field({ minLength: 1, maxLength: PROMISE_FIT_MAX, description: 'one line on what this driver would mean for THIS novel, not what the word means in general' })
  fit: string;

  @Field({ optional: true, description: 'true on the at most two drivers the premise and the notebook already point at' })
  recommended?: boolean;
}

@Schema()
export class BlueprintPromiseLengthOut {
  @Field(() => String, { enum: [...PROMISE_LENGTHS] })
  id: string;

  @Field({ minLength: 1, maxLength: PROMISE_NOTE_MAX, description: 'what this length would cost and buy this novel: volumes, pacing, how much of the premise it spends' })
  note: string;
}

@Schema()
export class BlueprintPromiseToneOut {
  @Field({ minLength: 1, maxLength: PROMISE_TONE_MAX, description: 'a tone in two or three words, e.g. “hopeful but costly”' })
  label: string;

  @Field({ minLength: 1, maxLength: PROMISE_NOTE_MAX, description: 'what a reader would feel at the end of a typical chapter in this tone' })
  note: string;
}

@Schema()
export class BlueprintPromiseSchema {
  @Field(() => [BlueprintPromiseDriverOut], {
    minItems: PROMISE_DRIVERS.length,
    maxItems: PROMISE_DRIVERS.length,
    description: 'every driver, once, in the order given — the author sees them all and must see what each would do here',
  })
  drivers: BlueprintPromiseDriverOut[];

  @Field(() => [BlueprintPromiseLengthOut], { minItems: PROMISE_LENGTHS.length, maxItems: PROMISE_LENGTHS.length, description: 'all three lengths, once each' })
  lengths: BlueprintPromiseLengthOut[];

  @Field(() => [BlueprintPromiseToneOut], { minItems: PROMISE_TONES_MIN, maxItems: PROMISE_TONES_MAX })
  tones: BlueprintPromiseToneOut[];

  @Field(() => [String], {
    minItems: PROMISES_MIN,
    maxItems: PROMISES_MAX,
    description: 'promises to the reader: what every chapter owes them, concrete enough that breaking one would be noticed',
  })
  promises: string[];

  @Field({ minLength: 1, maxLength: PROMISE_WRITER_LINE_MAX, description: 'what the recommended promise would mean for whoever writes chapter one' })
  writerLine: string;

  @Field({ minLength: 1, maxLength: 400, description: 'one or two plain sentences: which drivers you would pick and what the premise says so' })
  coachMessage: string;
}

export type BlueprintPromiseOutput = BlueprintPromiseSchema;
