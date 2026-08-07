import { EnumType, Field, Schema } from '@shadow-library/class-schema';
import { Transform } from '@shadow-library/fastify';
import { Paginated, PaginationQuery } from '@shadow-library/modules';

import { PATTERN } from '@server/constants';

const USER_STATUSES = ['ACTIVE', 'INACTIVE', 'DISABLED', 'BLOCKED', 'SUSPENDED', 'CLOSED'] as const;
type UserStatus = (typeof USER_STATUSES)[number];

const USER_SORT_FIELDS = EnumType.create('UserSortBy', ['createdAt'] as const);

@Schema()
export class UserIdParams {
  @Field(() => String, { ...PATTERN.ID })
  @Transform('bigint:parse')
  userId: bigint;
}

@Schema()
export class UserSearchQuery extends PaginationQuery(USER_SORT_FIELDS) {
  @Field({ optional: true })
  email?: string;

  @Field(() => String, { enum: [...USER_STATUSES], optional: true })
  status?: UserStatus;
}

@Schema()
export class UserSummaryItem {
  @Field()
  id: string;

  @Field(() => String, { optional: true })
  username?: string;

  @Field(() => String, { enum: [...USER_STATUSES] })
  status: UserStatus;

  @Field(() => String, { enum: ['NONE', 'OTP_ONLY', 'FULL'] })
  lockMode: 'NONE' | 'OTP_ONLY' | 'FULL';

  @Field(() => String, { optional: true })
  primaryEmail?: string;

  @Field()
  createdAt: string;
}

@Schema()
export class UserSearchResponse extends Paginated(UserSummaryItem) {}

@Schema()
export class UserContactItem {
  @Field()
  value: string;

  @Field(() => Boolean)
  isPrimary: boolean;

  @Field(() => String, { optional: true })
  verifiedAt?: string;
}

@Schema()
export class UserMfaSummary {
  @Field(() => Boolean)
  totp: boolean;

  @Field(() => Boolean)
  webauthn: boolean;

  @Field(() => Number)
  passkeyCount: number;
}

@Schema()
export class UserDetailResponse {
  @Field()
  id: string;

  @Field(() => String, { optional: true })
  username?: string;

  @Field(() => String, { enum: [...USER_STATUSES] })
  status: UserStatus;

  @Field(() => String, { optional: true, description: 'Reason the account left ACTIVE status.' })
  statusReason?: string;

  @Field(() => String, { optional: true, description: 'ISO-8601 instant when a temporary suspension ends.' })
  statusUntil?: string;

  @Field(() => String, { enum: ['NONE', 'OTP_ONLY', 'FULL'] })
  lockMode: 'NONE' | 'OTP_ONLY' | 'FULL';

  @Field(() => String, { optional: true })
  lockedUntil?: string;

  @Field(() => Boolean)
  passwordResetRequired: boolean;

  @Field(() => [UserContactItem])
  emails: UserContactItem[];

  @Field(() => [UserContactItem])
  phones: UserContactItem[];

  @Field(() => UserMfaSummary)
  mfa: UserMfaSummary;

  @Field(() => Number)
  activeSessionCount: number;

  @Field()
  createdAt: string;
}

@Schema()
export class LockUserBody {
  @Field(() => String, { enum: ['OTP_ONLY', 'FULL'] })
  mode: 'OTP_ONLY' | 'FULL';

  @Field({ optional: true, description: 'ISO-8601 expiry; omitted to keep the account locked until explicitly unlocked.' })
  until?: string;
}

@Schema()
export class SuspendUserBody {
  @Field({
    optional: true,
    maxLength: 256,
    description: 'Reason recorded on the account and in the audit chain so later administrators can understand the suspension.',
  })
  reason?: string;

  @Field({ optional: true, description: 'ISO-8601 instant when the suspension ends; omitted to suspend until an administrator lifts it.' })
  until?: string;
}

@Schema()
export class BlockUserBody {
  @Field({ optional: true, maxLength: 256 })
  reason?: string;
}

@Schema()
export class AdminActionResponse {
  @Field(() => Boolean)
  success: boolean;
}

@Schema()
export class UserAuditEventItem {
  @Field()
  id: string;

  @Field()
  action: string;

  @Field()
  outcome: string;

  @Field()
  occurredAt: string;

  @Field(() => String, { optional: true })
  actorId?: string;

  @Field(() => String, { optional: true })
  targetType?: string;

  @Field(() => String, { optional: true })
  ipAddress?: string;
}

@Schema()
export class UserAuditEventsResponse {
  @Field(() => [UserAuditEventItem])
  events: UserAuditEventItem[];
}
