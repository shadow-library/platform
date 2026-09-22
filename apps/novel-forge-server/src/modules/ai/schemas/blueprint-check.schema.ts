import { Field, Integer, Schema } from '@shadow-library/class-schema';

export const CHECK_TITLE_MAX = 100;
export const CHECK_LINE_MAX = 300;
export const CHECK_REASON_MAX = 400;
export const CHECK_FINDINGS_MAX = 8;
export const CHECK_CHOICES_MIN = 2;
export const CHECK_CHOICES_MAX = 2;
export const CHECK_COACH_MAX = 400;

/** Arithmetic and contradictions are one click because there is a right answer; a story finding is a choice because there is not. */
export const CHECK_FINDING_KINDS = ['arithmetic', 'story'] as const;

export type CheckFindingKind = (typeof CHECK_FINDING_KINDS)[number];

@Schema()
export class BlueprintCheckChoiceOut {
  @Field({ minLength: 1, maxLength: CHECK_TITLE_MAX, description: 'the fix in a few words, as a button reads' })
  label: string;

  @Field({ minLength: 1, maxLength: CHECK_LINE_MAX, description: 'what taking it changes, and what it costs' })
  detail: string;

  @Field(() => [Object], { description: 'the change-set ops that apply this fix; empty when the fix is a decision the author records rather than content to rewrite' })
  changeSet: Record<string, unknown>[];
}

@Schema()
export class BlueprintCheckFindingOut {
  @Field(() => String, { enum: [...CHECK_FINDING_KINDS] })
  kind: CheckFindingKind;

  @Field({ minLength: 1, maxLength: CHECK_TITLE_MAX, description: 'what is wrong, named as the author would name it: “Ages don’t add up: Brannoc”' })
  title: string;

  @Field({ minLength: 1, maxLength: CHECK_LINE_MAX, description: 'the evidence — which two things disagree and where' })
  detail: string;

  @Field(() => [BlueprintCheckChoiceOut], { minItems: CHECK_CHOICES_MIN, maxItems: CHECK_CHOICES_MAX, description: 'exactly two ways out, which must not be the same way twice' })
  choices: BlueprintCheckChoiceOut[];
}

@Schema()
export class BlueprintCheckSchema {
  @Field(() => Integer, { minimum: 0, description: 'how many checks this slice ran and passed' })
  passed: number;

  @Field(() => [BlueprintCheckFindingOut], { maxItems: CHECK_FINDINGS_MAX, description: 'only what genuinely needs the author; an empty list is the good outcome' })
  findings: BlueprintCheckFindingOut[];

  @Field({ minLength: 1, maxLength: CHECK_COACH_MAX })
  coachMessage: string;
}

export type BlueprintCheckOutput = BlueprintCheckSchema;
