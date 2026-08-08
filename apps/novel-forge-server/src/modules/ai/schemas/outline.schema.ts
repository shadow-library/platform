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
    description: 'how the chapter must end — never conclusively unless it is the final chapter of its arc, and even then it hands off via the arc hook',
  })
  endingContract: EndingContractSchema;
}

export const OutlineSchema = [ChapterBriefSchema] as [typeof ChapterBriefSchema];

export type OutlineOutput = ChapterBriefSchema[];
export type ChapterBriefOutput = ChapterBriefSchema;
