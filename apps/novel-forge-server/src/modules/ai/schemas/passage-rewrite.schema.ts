import { Field, Schema } from '@shadow-library/class-schema';

@Schema()
export class PassageRewriteSchema {
  @Field({ minLength: 1, description: 'the rewritten passage only — it replaces the marked passage word for word, so no surrounding text, markers or commentary' })
  replacement: string;
}

export type PassageRewriteOutput = PassageRewriteSchema;
