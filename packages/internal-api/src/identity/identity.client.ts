import { callService, pathParam } from '../service-call';
import { type ServiceFetch, type ServiceTarget } from '../service-fetch';
import { type CallOptions, type ServiceResponse } from '../service-response';
import { type OrganisationMemberResponse } from './identity-api.gen';

/** Identity's own API keeps its bare identifier rather than an `api://` resource. */
export const IDENTITY_DIRECTORY_TARGET: ServiceTarget = { service: 'identity-server', resource: 'shadow-identity', scopes: ['users:resolve'] };

export class IdentityClient {
  constructor(
    private readonly fetch: ServiceFetch,
    private readonly target: ServiceTarget = IDENTITY_DIRECTORY_TARGET,
  ) {}

  isOrganisationMember(organisationId: string, userId: string, options: CallOptions = {}): Promise<ServiceResponse<OrganisationMemberResponse>> {
    const path = `/api/v1/internal/organisations/${pathParam(organisationId)}/members/${pathParam(userId)}`;
    return callService(this.fetch, this.target, { ...options, method: 'GET', path });
  }
}
