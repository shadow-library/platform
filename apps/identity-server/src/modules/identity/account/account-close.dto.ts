import { Field, Schema } from '@shadow-library/class-schema';

@Schema()
export class AccountCloseResponse {
  @Field(() => Boolean)
  success: boolean;
}
