import { Field, Integer, Schema } from '@shadow-library/class-schema';

import { EndingContractSchema } from './ending-contract.schema';

@Schema()
export class ChapterBriefSchema {
  @Field(() => Integer)
  chapter: number;

  @Field({ minLength: 1 })
  volumeKey: string;

  @Field({ minLength: 1 })
  title: string;

  @Field({ minLength: 1, description: 'what this chapter must accomplish in the story arc' })
  objective: string;

  @Field(() => [String], { minItems: 1, description: 'key events in this chapter, in order' })
  events: string[];

  @Field(() => [String], {
    description:
      'context ref strings this chapter needs (e.g. "entity:iron_covenant", "thread:heir_mystery", "chapter:12") — select from the catalog provided, most important first; ordering determines eviction priority',
  })
  requiredContext: string[];

  @Field({ optional: true, description: 'entityKey of the POV character' })
  pov?: string;

  @Field({
    optional: true,
    default: false,
    description: 'this chapter should end without resolving its central action/tension — expected and desirable for serialized pacing, not a fallback',
  })
  continuesIntoNextChapter?: boolean;

  @Field({ optional: true, default: false, description: 'this chapter must open in the exact beat the previous chapter handed off' })
  startsFromPreviousChapter?: boolean;

  @Field({
    optional: true,
    description: 'the specific moment/action/line where continuation picks up — required when continuesIntoNextChapter or startsFromPreviousChapter is true',
  })
  handoffBeat?: string;

  @Field(() => EndingContractSchema, {
    description:
      'how the chapter must end — end in the contracted hookType; closure modes (closure_with_momentum, earned_rest) still hand off momentum rather than fully resolving the arc',
  })
  endingContract: EndingContractSchema;
}

export const OutlineSchema = [ChapterBriefSchema] as [typeof ChapterBriefSchema];

export type OutlineOutput = ChapterBriefSchema[];
export type ChapterBriefOutput = ChapterBriefSchema;

/**
 * Cross-item rules JSON Schema can't express: the returned briefs must exactly, contiguously cover
 * the requested span with no gaps, no out-of-range chapters, and no duplicates, and the
 * continuesIntoNextChapter/startsFromPreviousChapter flags must chain across every adjacent pair the
 * prompt already promises will chain.
 */
export function validateOutlineCoverage(briefs: ChapterBriefOutput[], startChapter: number, endChapter: number): string[] {
  const errors: string[] = [];
  const byChapter = new Map<number, ChapterBriefOutput>();

  for (const brief of briefs) {
    if (byChapter.has(brief.chapter)) errors.push(`chapter ${brief.chapter} appears more than once in the outline`);
    else byChapter.set(brief.chapter, brief);
    if (brief.chapter < startChapter || brief.chapter > endChapter) errors.push(`chapter ${brief.chapter} is outside the requested span ${startChapter}-${endChapter}`);
  }

  for (let chapter = startChapter; chapter <= endChapter; chapter++) {
    if (!byChapter.has(chapter)) errors.push(`chapter ${chapter} is missing from the outline`);
  }

  for (let chapter = startChapter; chapter < endChapter; chapter++) {
    const current = byChapter.get(chapter);
    const next = byChapter.get(chapter + 1);
    if (!current || !next) continue;
    if (current.continuesIntoNextChapter && !next.startsFromPreviousChapter) {
      errors.push(`chapter ${chapter} sets continuesIntoNextChapter, but chapter ${chapter + 1} does not set startsFromPreviousChapter`);
    }
    if (!current.continuesIntoNextChapter && next.startsFromPreviousChapter) {
      errors.push(`chapter ${chapter + 1} sets startsFromPreviousChapter, but chapter ${chapter} does not set continuesIntoNextChapter`);
    }
  }

  return errors;
}
