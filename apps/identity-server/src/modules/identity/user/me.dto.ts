import { Field, Schema } from '@shadow-library/class-schema';

@Schema()
export class MeResponse {
  @Field(() => String)
  userId: bigint;

  @Field({ optional: true })
  firstName?: string;

  @Field({ optional: true })
  lastName?: string;

  @Field({ optional: true })
  email?: string;

  @Field(() => String, { enum: ['AAL1', 'AAL2'] })
  aal: 'AAL1' | 'AAL2';

  @Field(() => Boolean, { description: 'Whether the session is currently within its step-up elevation window.' })
  elevated: boolean;

  @Field({ optional: true })
  elevatedUntil?: string;
}

@Schema()
export class UpdateProfileBody {
  @Field({ optional: true, minLength: 1, maxLength: 255 })
  firstName?: string;

  @Field({ optional: true, minLength: 1, maxLength: 255 })
  lastName?: string;
}

@Schema()
export class ChangePasswordBody {
  @Field({ description: 'Re-proves the account before credential rotation; a session cookie alone cannot change the password.' })
  currentPassword: string;

  @Field()
  newPassword: string;
}

@Schema()
export class ChangePasswordResponse {
  @Field(() => Boolean)
  success: boolean;
}
