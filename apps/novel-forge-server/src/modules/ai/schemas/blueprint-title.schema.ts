import { Field, Schema } from '@shadow-library/class-schema';

export const TITLE_STYLES = ['short_literary', 'web_novel_descriptive', 'first_person_hook', 'title_and_subtitle'] as const;
export const TITLE_TEXT_MAX = 120;
export const TITLE_FROM_MAX = 80;
export const TITLE_GROUP_MIN = 2;
export const TITLE_GROUP_MAX = 4;
export const TITLES_PER_GROUP_MIN = 2;
export const TITLES_PER_GROUP_MAX = 4;

export type TitleStyle = (typeof TITLE_STYLES)[number];

export const TITLE_STYLE_LABELS: Record<TitleStyle, string> = {
  short_literary: 'Short and literary',
  web_novel_descriptive: 'Web-novel descriptive',
  first_person_hook: 'First-person hook',
  title_and_subtitle: 'Title and subtitle',
};

@Schema()
export class BlueprintTitleCandidateOut {
  @Field({ minLength: 1, maxLength: TITLE_TEXT_MAX, description: 'the title as it would appear on a catalog card' })
  text: string;

  @Field({
    minLength: 1,
    maxLength: TITLE_FROM_MAX,
    description: 'the decision it came from, named as the author would recognise it: “the cost rule”, “the theme”, “the premise’s hook”',
  })
  from: string;
}

@Schema()
export class BlueprintTitleGroupOut {
  @Field(() => String, { enum: [...TITLE_STYLES] })
  style: string;

  @Field(() => [BlueprintTitleCandidateOut], { minItems: TITLES_PER_GROUP_MIN, maxItems: TITLES_PER_GROUP_MAX })
  titles: BlueprintTitleCandidateOut[];
}

@Schema()
export class BlueprintTitleSchema {
  @Field(() => [BlueprintTitleGroupOut], { minItems: TITLE_GROUP_MIN, maxItems: TITLE_GROUP_MAX, description: 'candidates grouped by style, each style at most once' })
  groups: BlueprintTitleGroupOut[];

  @Field({ minLength: 1, maxLength: 400, description: 'one or two plain sentences: what these styles are trading against each other on this shelf' })
  coachMessage: string;
}

export type BlueprintTitleOutput = BlueprintTitleSchema;
