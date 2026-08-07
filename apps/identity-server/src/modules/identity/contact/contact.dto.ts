import { Field, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';

import { PATTERN } from '@server/constants';

@Schema()
export class ContactItemDto {
  @Field()
  value: string;

  @Field()
  isPrimary: boolean;

  @Field(() => String, { optional: true })
  @Transform('strip:null')
  verifiedAt?: string;
}

@Schema()
export class ContactListResponse {
  @Field(() => [ContactItemDto])
  items: ContactItemDto[];
}

@Schema()
export class AddEmailBody {
  @Field({ ...PATTERN.EMAIL })
  email: string;
}

@Schema()
export class AddPhoneBody {
  @Field({ ...PATTERN.PHONE, description: 'Phone number in E.164 format, including the leading +.' })
  phone: string;
}

@Schema()
export class AddContactResponse {
  @Field({ description: 'Opaque handle for the pending verification; return it with the OTP.' })
  verificationId: string;
}

@Schema()
export class VerifyContactBody {
  @Field()
  verificationId: string;

  @Field({ ...PATTERN.OTP })
  code: string;
}

@Schema()
export class RemoveEmailBody {
  @Field({ ...PATTERN.EMAIL })
  email: string;
}

@Schema()
export class RemovePhoneBody {
  @Field({ ...PATTERN.PHONE })
  phone: string;
}

@Schema()
export class ContactOperationResponse {
  @Field()
  success: boolean;
}
