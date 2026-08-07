import { Field, Schema } from '@shadow-library/class-schema';

import { PATTERN } from '@server/constants';

const ORGANISATION_TYPES = ['PERSONAL', 'TEAM'] as const;

type OrganisationType = (typeof ORGANISATION_TYPES)[number];

@Schema()
export class CreateAppSessionBody {
  @Field()
  code: string;

  @Field()
  codeVerifier: string;

  @Field()
  redirectUri: string;
}

@Schema()
export class AppSessionResponse {
  @Field({ description: 'Opaque handle returned once for the application to store as a cookie on its own domain.' })
  sessionHandle: string;

  @Field()
  userId: string;

  @Field()
  expiresAt: string;

  @Field()
  scope: string;
}

@Schema()
export class MintAppTokenBody {
  @Field()
  sessionHandle: string;

  @Field({ optional: true, description: 'RFC 8707 target API; omitted to address the identity service itself.' })
  resource?: string;

  @Field({ optional: true, description: "Narrows the token to a subset of the session's consented scope; omitted to use the full scope." })
  scope?: string;

  @Field(() => Boolean, { optional: true, description: 'Requires an existing step-up grant bound to this exact resource.' })
  elevated?: boolean;
}

@Schema()
export class AppTokenResponse {
  @Field()
  accessToken: string;

  @Field()
  tokenType: string;

  @Field(() => Number)
  expiresIn: number;

  @Field()
  scope: string;

  @Field()
  audience: string;

  @Field()
  aal: string;
}

@Schema()
export class AppSessionHandleBody {
  @Field()
  sessionHandle: string;
}

@Schema()
export class ClaimElevationBody {
  @Field()
  sessionHandle: string;

  @Field({ optional: true })
  resource?: string;
}

@Schema()
export class ElevationResponse {
  @Field()
  expiresAt: string;
}

@Schema()
export class AppSessionActionResponse {
  @Field(() => Boolean)
  success: boolean;
}

@Schema()
export class AppSessionOrganisationItem {
  @Field(() => String)
  id: bigint;

  @Field()
  slug: string;

  @Field()
  name: string;

  @Field(() => String, { enum: [...ORGANISATION_TYPES] })
  type: OrganisationType;

  @Field(() => Boolean, { description: 'Whether the session is currently acting in this organisation.' })
  active: boolean;
}

@Schema()
export class AppSessionOrganisationsResponse {
  @Field(() => [AppSessionOrganisationItem])
  organisations: AppSessionOrganisationItem[];
}

@Schema()
export class SwitchOrganisationBody {
  @Field()
  sessionHandle: string;

  @Field({ ...PATTERN.ID })
  organisationId: string;
}

@Schema()
export class SwitchOrganisationResponse {
  @Field({ description: 'Rotated handle that replaces the previous handle, which is invalid as soon as this response is issued.' })
  sessionHandle: string;

  @Field()
  organisationId: string;

  @Field()
  expiresAt: string;
}
