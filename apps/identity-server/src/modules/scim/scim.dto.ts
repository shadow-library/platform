import { Field, Schema } from '@shadow-library/class-schema';

@Schema()
export class ScimIdParams {
  @Field()
  id: string;
}

@Schema()
export class ScimListQuery {
  @Field({ optional: true, maxLength: 512 })
  filter?: string;

  @Field({ optional: true })
  startIndex?: string;

  @Field({ optional: true })
  count?: string;
}
