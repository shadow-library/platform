import { Field, Schema } from '@shadow-library/class-schema';

@Schema()
export class EpitomeSchema {
  @Field({
    minLength: 1,
    maxLength: 4000,
    description: 'volume epitome — roughly 200 tokens (about 150 words) of prose recording what this volume settled, changed, and left open for later volumes',
  })
  epitome: string;
}

export type EpitomeOutput = EpitomeSchema;
