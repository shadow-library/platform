import { Field, Schema } from '@shadow-library/class-schema';

import { AuditAction } from './enums';

@Schema()
export class BibleAuditFinding {
  @Field({ minLength: 1, description: 'what the finding is about: "doc:<section>/<slug>" for a bible document, or "entity:<entityKey>" for a cast/faction/power record' })
  ref: string;

  @Field(() => AuditAction)
  action: 'add' | 'revise' | 'remove' | 'keep';

  @Field({ minLength: 1, description: 'why this document or record is needed, weak, or dead weight' })
  finding: string;
}

@Schema()
export class BibleAuditSchema {
  @Field(() => [BibleAuditFinding], { minItems: 1, description: 'one finding per required document, plus one per entity type whose coverage falls short of the manifest' })
  findings: BibleAuditFinding[];

  @Field(() => [Object], { description: 'change-set ops: bible_document.upsert/remove and entity.upsert/remove only; empty when the bible is already complete' })
  changeSet: Record<string, unknown>[];
}

export type BibleAuditOutput = BibleAuditSchema;
