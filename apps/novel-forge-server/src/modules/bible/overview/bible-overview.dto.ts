import { EnumType, Field, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { BIBLE_STAGE_ORDER, type BibleStage } from '@modules/bible/bible-manifest';

export const BibleStageEnum = EnumType.create<BibleStage>('BibleStage', [...BIBLE_STAGE_ORDER]);

@Schema()
export class BibleOverviewParams {
  @Field(() => String, { pattern: '^[0-9]+$' })
  @Transform('bigint:parse')
  projectId: bigint;
}

@Schema()
export class BibleRoleResponse {
  @Field(() => BibleStageEnum)
  stage: BibleStage;

  @Field({ description: 'what the role is called where a page is shown as covering it' })
  label: string;

  @Field(() => [String], { description: 'the documents (`section/slug`) and record summaries that carry the role, whatever they are named; empty when nothing does' })
  coveredBy: string[];
}

@Schema()
export class BibleUnresolvedReferenceResponse {
  @Field({ description: 'the canon fact that names the missing subject' })
  factKey: string;

  @Field({ description: 'the entity key the fact names, which no entity in this bible has' })
  subject: string;
}

@Schema()
export class BibleOverviewResponse {
  @Field(() => [BibleRoleResponse], { description: 'one entry per bible role, in manifest order, so pages filed under any name are grouped with the role they carry' })
  roles: BibleRoleResponse[];

  @Field(() => [BibleUnresolvedReferenceResponse], { description: 'canon-fact subjects that resolve to no entity — the only bible errors the Story Bible screen reports' })
  unresolvedReferences: BibleUnresolvedReferenceResponse[];
}
