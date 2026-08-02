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
