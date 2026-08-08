import { Field, Schema } from '@shadow-library/class-schema';

import { AuditAction } from './enums';

@Schema()
export class BibleAuditFinding {
  @Field({ minLength: 1, description: 'the document ref, e.g. "doc:project/reader-promise"' })
  docRef: string;

  @Field(() => AuditAction)
  action: 'add' | 'revise' | 'remove' | 'keep';

  @Field({ minLength: 1, description: 'why this document is needed, weak, or dead weight' })
  finding: string;
}

@Schema()
export class BibleAuditSchema {
  @Field(() => [BibleAuditFinding], { minItems: 1, description: 'one finding per audited/required document' })
  findings: BibleAuditFinding[];

  @Field(() => [Object], { description: 'change-set ops: bible_document.upsert (with drafted content) and bible_document.remove only; empty when the bible is already complete' })
  changeSet: Record<string, unknown>[];
}

export type BibleAuditOutput = BibleAuditSchema;
