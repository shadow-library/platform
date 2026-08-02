/**
 * Importing npm packages
 */
import { Field, Schema } from '@shadow-library/class-schema';

/**
 * Importing user defined packages
 */
import { PATTERN } from '@server/constants';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

/** Bounds one lookup so a caller cannot walk the directory in a single request; the sharing UI never needs more. */
export const MAX_RESOLVE_EMAILS = 50;

/**
 * `ArrayFieldSchema` carries no per-item constraint, so the address *shape* is not enforced here —
 * {@link DirectoryService.resolveByEmail} drops anything unshapely before it reaches the database.
 * That is the same answer a well-formed unknown address gets (absent from the response), so pushing
 * the check down costs nothing and keeps one rejection story instead of two.
 */
@Schema()
export class ResolveUsersBody {
  @Field(() => [String], { minItems: 1, maxItems: MAX_RESOLVE_EMAILS, uniqueItems: true })
  emails: string[];
}

@Schema()
export class ResolvedUserItem {
  /** Echoed exactly as the caller sent it, so a case-insensitive match still lines up with the caller's own list. */
  @Field()
  email: string;

  @Field()
  userId: string;
}

@Schema()
export class ResolveUsersResponse {
  @Field(() => [ResolvedUserItem])
  users: ResolvedUserItem[];
}

/** Same ceiling as the email direction, and for the same reason: one request must not walk the directory. */
export const MAX_LOOKUP_USERS = 50;

/**
 * The id direction of the seam. Item shape is unenforceable here for the same reason as
 * {@link ResolveUsersBody}, so {@link DirectoryService.lookupByUserId} drops anything that is not a
 * plausible id — an unshapely id is simply absent from the answer, exactly like an unknown one.
 */
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

  /** The name the person chose to be shown as; absent when they have not set one. */
  @Field({ optional: true })
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
