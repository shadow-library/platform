import { Field, Integer, Schema } from '@shadow-library/class-schema';

import { TranslationAuditIssueType, TranslationAuditVerdict, TranslationTermCategory, TranslationTreatment } from './enums';

@Schema()
export class TranslationTermAlternative {
  @Field({ minLength: 1, maxLength: 300, description: 'an alternative English rendering of the source term' })
  target: string;

  @Field({ minLength: 1, description: 'why a reviewer might prefer this rendering over the proposed one' })
  rationale: string;
}

@Schema()
export class TranslationTermSuggestion {
  @Field({ minLength: 1, maxLength: 300, description: 'the term exactly as it appears in the original text' })
  sourceTerm: string;

  @Field(() => [String], { optional: true, description: 'other spellings the original uses for the same thing, e.g. a full name and its short form' })
  variants?: string[];

  @Field({ minLength: 1, maxLength: 300, description: 'the proposed English rendering' })
  target: string;

  @Field(() => [TranslationTermAlternative], { optional: true, description: 'other renderings worth considering, each with the reason it might win' })
  alternatives?: TranslationTermAlternative[];

  @Field(() => TranslationTermCategory)
  category: 'character' | 'place' | 'organization' | 'profession' | 'title' | 'rank' | 'ability' | 'item' | 'creature' | 'term';

  @Field(() => TranslationTreatment, { description: 'translate the sense, localize to an English equivalent, transliterate the sound, or preserve the original characters' })
  treatment: 'translate' | 'localize' | 'transliterate' | 'preserve';

  @Field({ minLength: 1, description: 'what this is, in one phrase — so a reviewer can judge the rendering without reading the chapter' })
  meaning: string;

  @Field({ optional: true, description: 'the sentence the term first appears in, quoted from the original' })
  contextExcerpt?: string;
}

@Schema()
export class TranslationSeedSchema {
  @Field({
    minLength: 100,
    description:
      'the style guide a translator will follow: narrative voice and tense, honorific policy, name order, units and currency, system-window formatting, dialogue punctuation',
  })
  styleNotes: string;

  @Field(() => [TranslationTermSuggestion], {
    description: 'one entry per novel-specific term found in the sample chapters; empty is a valid answer when the sample contains none',
  })
  terms: TranslationTermSuggestion[];
}

@Schema()
export class TranslateSegmentSchema {
  @Field({ optional: true, maxLength: 500, description: 'the translated chapter title — only on the first segment of a chapter' })
  title?: string;

  @Field({ minLength: 1, description: 'the translated prose of this segment, paragraph breaks preserved' })
  body: string;

  @Field(() => [TranslationTermSuggestion], { optional: true, description: 'novel-specific terms met in this segment that the glossary does not already cover' })
  discoveredTerms?: TranslationTermSuggestion[];

  @Field({ optional: true, description: 'anything a reviewer should know about a choice made here — a pun, an ambiguity, an untranslatable idiom' })
  translatorNotes?: string;
}

@Schema()
export class TranslationAuditIssue {
  @Field(() => TranslationAuditIssueType)
  type: 'omission' | 'addition' | 'meaning_shift' | 'tone_shift' | 'terminology' | 'censorship' | 'untranslated';

  @Field(() => Integer, { optional: true, minimum: 1, description: 'the 1-based segment the issue is in; omit when it spans the chapter' })
  segmentIndex?: number;

  @Field({ minLength: 1, description: 'what is wrong, naming the original text and what the translation did with it' })
  detail: string;

  @Field({ optional: true, description: 'a short quote of the offending translation' })
  excerpt?: string;
}

@Schema()
export class TranslationAuditSchema {
  @Field(() => TranslationAuditVerdict)
  verdict: 'clean' | 'issues';

  @Field(() => [TranslationAuditIssue], { description: 'every fidelity issue found; empty when the verdict is clean' })
  issues: TranslationAuditIssue[];
}

export type TranslationSeedOutput = TranslationSeedSchema;
export type TranslateSegmentOutput = TranslateSegmentSchema;
export type TranslationAuditOutput = TranslationAuditSchema;
