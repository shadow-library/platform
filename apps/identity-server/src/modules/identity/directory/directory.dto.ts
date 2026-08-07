import { Field, Schema } from '@shadow-library/class-schema';

import { PATTERN } from '@server/constants';

export const MAX_RESOLVE_EMAILS = 50;

@Schema()
export class ResolveUsersBody {
  @Field(() => [String], { minItems: 1, maxItems: MAX_RESOLVE_EMAILS, uniqueItems: true })
  emails: string[];
}

@Schema()
export class ResolvedUserItem {
  @Field({ description: "Echoed exactly as submitted so a case-insensitive match aligns with the caller's input." })
  email: string;

  @Field()
  userId: string;
}

@Schema()
export class ResolveUsersResponse {
  @Field(() => [ResolvedUserItem])
  users: ResolvedUserItem[];
}

export const MAX_LOOKUP_USERS = 50;

@Schema()
export class LookupUsersBody {
  @Field(() => [String], { minItems: 1, maxItems: MAX_LOOKUP_USERS, uniqueItems: true })
  userIds: string[];
}

/**
 * Deliberately name-only. The caller already holds the id, so nothing here helps it enumerate; an
 * address would, because ids are sequential and the answer would turn a counter into a contact list.
 * A service that needs an address still has to go the other way round, through `users/resolve`.
 */
@Schema()
export class DirectoryUserItem {
  @Field()
  userId: string;

  @Field({ optional: true, description: 'User-selected display name; absent when none has been set.' })
  displayName?: string;

  @Field({ optional: true })
  firstName?: string;

  @Field({ optional: true })
  lastName?: string;
}

@Schema()
export class LookupUsersResponse {
  @Field(() => [DirectoryUserItem])
  users: DirectoryUserItem[];
}

@Schema()
export class OrganisationMemberParams {
  @Field(() => String, { ...PATTERN.ID })
  organisationId: string;

  @Field(() => String, { ...PATTERN.ID })
  userId: string;
}

@Schema()
export class OrganisationMemberResponse {
  @Field()
  member: boolean;
}
