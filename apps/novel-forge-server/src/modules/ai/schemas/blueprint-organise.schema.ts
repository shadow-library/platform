import { Field, Schema } from '@shadow-library/class-schema';
import { ORGANISE_RECORD_TYPES, ORGANISE_SOURCES, type OrganiseRecordType, type OrganiseSource, TIMELINE_BANDS, type TimelineBand } from '@shadow-library/sdk';

export const ORGANISE_READING_MAX = 1_200;
export const ORGANISE_EVENTS_MAX = 60;
export const ORGANISE_EVENT_MAX = 240;
export const ORGANISE_PAGES_MAX = 12;
export const ORGANISE_PAGE_SECTIONS_MAX = 6;
export const ORGANISE_SECTIONS_TOTAL_MAX = 50;
export const ORGANISE_TITLE_MAX = 80;
export const ORGANISE_SLUG_MAX = 60;
export const ORGANISE_SECTION_BODY_MAX = 1_500;
export const ORGANISE_RECORDS_MAX = 30;
export const ORGANISE_RECORD_SUMMARY_MAX = 300;
export const ORGANISE_RULES_MAX = 15;
export const ORGANISE_LINE_MAX = 300;
export const ORGANISE_QUESTIONS_MAX = 10;
export const ORGANISE_SUGGESTIONS_MAX = 8;
export const ORGANISE_SUGGESTION_MAX = 500;
export const ORGANISE_COACH_MAX = 1_600;

export const ORGANISE_PAGE_SECTIONS = ['project', 'world', 'power', 'plot'] as const;

export type OrganisePageSection = (typeof ORGANISE_PAGE_SECTIONS)[number];

@Schema()
export class BlueprintOrganiseEventOut {
  @Field(() => String, {
    enum: [...TIMELINE_BANDS],
    description:
      "where the notes place it: 'opening' for the situation the story opens in and its first scenes, 'early' for soon after, " +
      "'later' for a later turn, reveal, secret coming out or stage, 'ending' for the ending and the end goal, 'unplaced' when the notes do not say when",
  })
  band: TimelineBand;

  @Field({ minLength: 1, maxLength: ORGANISE_EVENT_MAX, description: "one moment of the story in a short sentence of under twenty words, in the author's words where possible" })
  event: string;
}

@Schema()
export class BlueprintOrganiseSectionOut {
  @Field({ minLength: 1, maxLength: ORGANISE_TITLE_MAX, description: 'a short heading naming what the section is about' })
  heading: string;

  @Field({
    minLength: 1,
    maxLength: ORGANISE_SECTION_BODY_MAX,
    description: 'what the notes state on it as the story opens, condensed, in the author’s terms — never what the notes place later, which belongs on the timeline',
  })
  body: string;

  @Field(() => String, {
    enum: [...ORGANISE_SOURCES],
    description: "'notes' when the notes state it; 'inferred' when it is your reading of what the notes imply but do not say",
  })
  source: OrganiseSource;
}

@Schema()
export class BlueprintOrganisePageOut {
  @Field(() => String, {
    enum: [...ORGANISE_PAGE_SECTIONS],
    description: "'project' for the cast (the page 'cast'), relationships and the story's kind and tone; 'world', 'power' or 'plot' for those subjects",
  })
  section: OrganisePageSection;

  @Field({ minLength: 1, maxLength: ORGANISE_SLUG_MAX, description: 'lowercase words joined by hyphens, naming the subject, e.g. "the-guild" or "how-magic-works"' })
  slug: string;

  @Field({ minLength: 1, maxLength: ORGANISE_TITLE_MAX })
  title: string;

  @Field(() => [BlueprintOrganiseSectionOut], { minItems: 1, maxItems: ORGANISE_PAGE_SECTIONS_MAX })
  sections: BlueprintOrganiseSectionOut[];
}

@Schema()
export class BlueprintOrganiseRecordOut {
  @Field({ minLength: 1, maxLength: ORGANISE_TITLE_MAX, description: 'the name exactly as the notes give it' })
  name: string;

  @Field(() => String, { enum: [...ORGANISE_RECORD_TYPES], description: "what it is; a place is a 'location', a rule of how power works is a 'power_rule'" })
  type: OrganiseRecordType;

  @Field({
    minLength: 1,
    maxLength: ORGANISE_RECORD_SUMMARY_MAX,
    description: 'one sentence of what a reader could know of it when it first appears — never a later reveal, a fate or what it becomes',
  })
  summary: string;

  @Field(() => String, { enum: [...ORGANISE_SOURCES] })
  source: OrganiseSource;
}

@Schema()
export class BlueprintOrganiseRuleOut {
  @Field({ minLength: 1, maxLength: ORGANISE_LINE_MAX, description: 'a hard constraint the notes state that holds from chapter one; never a secret' })
  rule: string;
}

@Schema()
export class BlueprintOrganiseQuestionOut {
  @Field({ minLength: 1, maxLength: ORGANISE_LINE_MAX, description: 'a gap the notes leave, or something they leave undecided, asked as a question to the author' })
  question: string;

  @Field({ minLength: 1, maxLength: ORGANISE_LINE_MAX, description: 'why it matters for writing the first chapters' })
  why: string;
}

@Schema()
export class BlueprintOrganiseSuggestionOut {
  @Field({ minLength: 1, maxLength: ORGANISE_SLUG_MAX + 10, description: 'the page it would go on, as "section/slug" of one of your pages' })
  page: string;

  @Field({ minLength: 1, maxLength: ORGANISE_TITLE_MAX, description: 'the heading of the section on that page it would go under' })
  section: string;

  @Field({ minLength: 1, maxLength: ORGANISE_SUGGESTION_MAX, description: 'what you would add, which the notes do not say' })
  text: string;

  @Field({ minLength: 1, maxLength: ORGANISE_LINE_MAX, description: 'why it would help the first chapters' })
  why: string;
}

@Schema()
export class BlueprintOrganiseSchema {
  @Field({
    minLength: 1,
    maxLength: ORGANISE_READING_MAX,
    description: 'one paragraph: the kind of story, its opening situation, its central conflict and where it is heading, as the author describes them',
  })
  reading: string;

  @Field(() => [BlueprintOrganiseEventOut], { maxItems: ORGANISE_EVENTS_MAX, description: 'the story as the notes place it in time, in story order' })
  timeline: BlueprintOrganiseEventOut[];

  @Field(() => [BlueprintOrganisePageOut], {
    maxItems: ORGANISE_PAGES_MAX,
    description: 'Story Bible pages holding what the notes state of the story as it opens, one page per subject',
  })
  pages: BlueprintOrganisePageOut[];

  @Field(() => [BlueprintOrganiseRecordOut], {
    maxItems: ORGANISE_RECORDS_MAX,
    description: 'the named people, places, factions, powers, items and ideas the pages describe, one each',
  })
  records: BlueprintOrganiseRecordOut[];

  @Field(() => [BlueprintOrganiseRuleOut], { maxItems: ORGANISE_RULES_MAX, description: 'rules the chapter writer must never break, only as the notes state them' })
  rules: BlueprintOrganiseRuleOut[];

  @Field(() => [BlueprintOrganiseQuestionOut], { maxItems: ORGANISE_QUESTIONS_MAX, description: 'gaps and undecided points the notes leave, most important first' })
  questions: BlueprintOrganiseQuestionOut[];

  @Field(() => [BlueprintOrganiseSuggestionOut], { maxItems: ORGANISE_SUGGESTIONS_MAX, description: 'everything you would add that the notes do not say; may be empty' })
  suggestions: BlueprintOrganiseSuggestionOut[];

  @Field({
    minLength: 1,
    maxLength: ORGANISE_COACH_MAX,
    description: 'a few plain sentences to the author: what you organised, what you left out to stay within the limits, what was least clear, and the question to answer first',
  })
  coachMessage: string;
}

export type BlueprintOrganiseOutput = BlueprintOrganiseSchema;

export function organiseOutputIssues(output: BlueprintOrganiseOutput): string[] {
  const issues: string[] = [];
  if (output.pages.length === 0 && output.timeline.length === 0) issues.push('return the notes organised into at least one page and the timeline they describe');
  const sections = output.pages.reduce((total, page) => total + page.sections.length, 0);
  if (sections > ORGANISE_SECTIONS_TOTAL_MAX)
    issues.push(`the pages hold ${sections} sections; keep to ${ORGANISE_SECTIONS_TOTAL_MAX} in all, keeping what the first chapters need`);
  return issues;
}
