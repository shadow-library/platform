import { Field, Schema } from '@shadow-library/class-schema';

@Schema()
export class AccessResponse {
  @Field({ description: 'Whether the caller holds `novel-forge:admin` in the organisation the session acts in, which opens run inspection.' })
  admin: boolean;
}
