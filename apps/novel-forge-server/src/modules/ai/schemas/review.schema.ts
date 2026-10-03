import { Field, Schema } from '@shadow-library/class-schema';

import { ProofreadKind, type ProofreadKindValue, ReviewDisposition, ReviewSeverity } from './enums';

@Schema()
export class ReviewFinding {
  @Field(() => ReviewSeverity)
  severity: 'blocking' | 'suggestion';

  @Field({ minLength: 1, description: 'specific finding with location if possible' })
  text: string;

  @Field({ optional: true, description: 'the passage the finding rests on, quoted verbatim from the draft; omit when the finding is about something missing' })
  evidence?: string;
}

@Schema()
export class ProofreadFinding {
  @Field(() => ProofreadKind)
  kind: ProofreadKindValue;

  @Field({ minLength: 1, description: 'the exact offending span, copied verbatim from the draft with a few words around the slip' })
  quote: string;

  @Field({ minLength: 1, description: 'the same span corrected, changing only the slip' })
  fix: string;

  @Field({ optional: true, description: 'a few words on why, when the fix alone does not say it (the spelling the Story Bible uses, the tense the scene is in)' })
  reason?: string;
}

@Schema()
export class ReviewSchema {
  @Field(() => ReviewDisposition)
  disposition: 'approve' | 'revision_requested';

  @Field({ optional: true, description: 'overall note to the author' })
  note?: string;

  @Field(() => [ReviewFinding], { optional: true })
  findings?: ReviewFinding[];

  @Field(() => [ProofreadFinding], { optional: true, description: 'every proofreading slip, most important first; an empty array when the prose is clean' })
  proofreading?: ProofreadFinding[];
}

export type ReviewOutput = ReviewSchema;
