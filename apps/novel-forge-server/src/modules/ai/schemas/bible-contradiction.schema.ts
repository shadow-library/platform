import { Field, Schema } from '@shadow-library/class-schema';

@Schema()
export class BibleContradictionEvidence {
  @Field({ minLength: 1, description: 'the source this rests on, exactly as labelled in the material: "doc:<section>/<slug>", "entity:<key>", "fact:<key>" or "chapter:<n>"' })
  ref: string;

  @Field({ minLength: 1, description: 'the words of that source that conflict, copied verbatim from the material' })
  quote: string;
}

@Schema()
export class BibleContradiction {
  @Field({ minLength: 1, description: 'what disagrees with what, in one or two plain sentences the author can act on' })
  finding: string;

  @Field(() => [BibleContradictionEvidence], { minItems: 1, description: 'every source on each side of the contradiction' })
  evidence: BibleContradictionEvidence[];

  @Field(() => [Object], {
    description: 'ops that would resolve it (bible_document.upsert, entity.upsert, fact.upsert only); empty when only the author can decide which side is right',
  })
  changeSet: Record<string, unknown>[];
}

@Schema()
export class BibleContradictionSchema {
  @Field(() => [BibleContradiction], { description: 'one entry per genuine contradiction; empty when the sources agree' })
  contradictions: BibleContradiction[];
}

export type BibleContradictionOutput = BibleContradictionSchema;
