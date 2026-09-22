import { Field, Schema } from '@shadow-library/class-schema';

export const PREMISE_PART_KINDS = ['setting', 'rule', 'protagonist', 'hook'] as const;
export const PREMISE_PART_MIN = 3;
export const PREMISE_PART_MAX = 6;
export const PREMISE_PART_TEXT_MAX = 200;
export const PREMISE_ALTERNATIVES_MIN = 2;
export const PREMISE_ALTERNATIVES_MAX = 3;
export const PREMISE_SENTENCE_MAX = 600;
export const PREMISE_WHY_MAX = 400;
export const PREMISE_WRITER_LINE_MAX = 240;

export type PremisePartKind = (typeof PREMISE_PART_KINDS)[number];

@Schema()
export class BlueprintPremisePartOut {
  @Field({ minLength: 1, maxLength: PREMISE_PART_TEXT_MAX, description: 'this part of the sentence, exactly as it reads in it, punctuation included' })
  text: string;

  @Field(() => String, {
    enum: [...PREMISE_PART_KINDS],
    description: "'setting' for where and when, 'rule' for what the world charges, 'protagonist' for who it happens to, 'hook' for what turns it personal",
  })
  kind: PremisePartKind;

  @Field(() => [String], {
    minItems: PREMISE_ALTERNATIVES_MIN,
    maxItems: PREMISE_ALTERNATIVES_MAX,
    description: 'replacements that fit the same sentence in the same grammatical shape and change what the novel is about — never rewordings of the part',
  })
  alternatives: string[];
}

@Schema()
export class BlueprintPremiseSchema {
  @Field(() => [BlueprintPremisePartOut], {
    minItems: PREMISE_PART_MIN,
    maxItems: PREMISE_PART_MAX,
    description: 'the premise in reading order; joined by single spaces the parts must read as one sentence',
  })
  parts: BlueprintPremisePartOut[];

  @Field({ minLength: 1, maxLength: PREMISE_WHY_MAX, description: 'which notebook entries this premise is built from, naming them' })
  why: string;

  @Field({ minLength: 1, maxLength: PREMISE_WRITER_LINE_MAX, description: 'one sentence on what this premise obliges whoever writes chapter one to do' })
  writerLine: string;

  @Field({ minLength: 1, maxLength: 400, description: 'one or two plain sentences on what the sentence commits the author to, and which part is the one worth arguing with' })
  coachMessage: string;
}

export type BlueprintPremiseOutput = BlueprintPremiseSchema;

export const PREMISE_PREVIEW_MIN = 200;
export const PREMISE_PREVIEW_MAX = 1200;

@Schema()
export class BlueprintPremisePreviewSchema {
  @Field({ minLength: PREMISE_PREVIEW_MIN, maxLength: PREMISE_PREVIEW_MAX, description: 'one paragraph of prose, 90 to 140 words, opening the novel this premise describes' })
  paragraph: string;
}

export type BlueprintPremisePreviewOutput = BlueprintPremisePreviewSchema;
