/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

@Schema()
export class LoginInitBody {
  @Field()
  identifier: string;

  @Field({ optional: true })
  deviceId?: string;
}

@Schema()
export class LoginInitResponse {
  @Field()
  flowId: string;

  @Field()
  status: string;

  @Field()
  hasAlternativeMethods: boolean;
}

@Schema()
export class ChallengeVerifyBody {
  @Field()
  flowId: string;

  @Field({ optional: true })
  password?: string;

  @Field({ optional: true })
  code?: string;
}

@Schema()
export class ChallengeVerifyResponse {
  @Field()
  flowId: string;

  @Field()
  status: string;

  @Field(() => Number, { optional: true })
  attemptsLeft?: number;
}

@Schema()
export class FlowStatusResponse {
  @Field()
  flowId: string;

  @Field()
  status: string;
}

@Schema()
export class RegisterInitBody {
  @Field()
  email: string;

  @Field({ optional: true })
  deviceId?: string;
}

@Schema()
export class DemographicsBody {
  @Field()
  flowId: string;

  @Field({ optional: true })
  dateOfBirth?: string;

  @Field(() => String, { optional: true, enum: ['MALE', 'FEMALE', 'OTHER', 'UNSPECIFIED'] })
  gender?: 'MALE' | 'FEMALE' | 'OTHER' | 'UNSPECIFIED';
}

@Schema()
export class ProfileBody {
  @Field()
  flowId: string;

  @Field()
  firstName: string;

  @Field()
  lastName: string;
}

@Schema()
export class SetPasswordBody {
  @Field()
  flowId: string;

  @Field()
  password: string;
}

@Schema()
export class RecoverInitBody {
  @Field()
  identifier: string;

  @Field({ optional: true })
  deviceId?: string;
}

@Schema()
export class ResetPasswordBody {
  @Field()
  flowId: string;

  @Field()
  newPassword: string;
}
