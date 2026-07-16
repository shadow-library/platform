/**
 * Importing npm packages
 */
import { EnumType, Field, Schema } from '@shadow-library/class-schema';
import { Paginated, PaginationQuery } from '@shadow-library/modules';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

const USER_STATUSES = ['ACTIVE', 'INACTIVE', 'DISABLED', 'BLOCKED', 'SUSPENDED', 'CLOSED'] as const;
type UserStatus = (typeof USER_STATUSES)[number];

/**
 * Declaring the constants
 */

const USER_SORT_FIELDS = EnumType.create('UserSortBy', ['createdAt'] as const);

@Schema()
export class UserIdParams {
  @Field({ pattern: '^\\d+$' })
  userId: string;
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

  /** ISO-8601 expiry; omitted means locked until explicitly unlocked. */
  @Field({ optional: true })
  until?: string;
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
