/**
 * Importing npm packages
 */
import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';

/**
 * Importing user defined packages
 */
import { type ApiError, call } from './api-request';
import {
  type CreateIdentityProviderBody,
  type CreateOrganisationBody,
  type DomainItem,
  type DomainsResponse,
  type IdentityProviderListResponse,
  type IdentityProviderResponse,
  type InvitationItem,
  type InvitationsResponse,
  type InviteMemberBody,
  type MemberItem,
  type MembersResponse,
  type MyOrganisationItem,
  type MyOrganisationsResponse,
  type OrganisationResponse,
  type UpdateIdentityProviderBody,
} from './api-types.gen';
import { serverFetch } from './server-fetch';

/**
 * Defining types
 */

export type {
  CreateIdentityProviderBody,
  CreateOrganisationBody,
  DomainItem,
  DomainsResponse,
  IdentityProviderListResponse,
  InvitationItem,
  InvitationsResponse,
  InviteMemberBody,
  MemberItem,
  MembersResponse,
  MyOrganisationsResponse,
  OrganisationResponse,
  UpdateIdentityProviderBody,
};
export type MyOrganisation = MyOrganisationItem;
export type IdentityProvider = IdentityProviderResponse;
export type OrgType = OrganisationResponse['type'];
export type OrgStatus = OrganisationResponse['status'];
export type MemberRole = MemberItem['role'];
export type InvitableRole = InviteMemberBody['role'];
export type DomainStatus = DomainItem['status'];

/**
 * Declaring the constants
 */
export const orgKeys = {
  all: ['organisations'] as const,
  mine: () => [...orgKeys.all, 'mine'] as const,
  detail: (id: string) => [...orgKeys.all, id] as const,
  members: (id: string) => [...orgKeys.all, id, 'members'] as const,
  invitations: (id: string) => [...orgKeys.all, id, 'invitations'] as const,
  domains: (id: string) => [...orgKeys.all, id, 'domains'] as const,
  idps: (id: string) => [...orgKeys.all, id, 'identity-providers'] as const,
};

/* ---------- server functions ---------- */

const fetchMyOrgs = createServerFn({ method: 'GET' }).handler(() => serverFetch<MyOrganisationsResponse>({ method: 'GET', path: '/me/organisations' }));
const fetchOrg = createServerFn({ method: 'GET' })
  .validator((orgId: string) => orgId)
  .handler(({ data }) => serverFetch<OrganisationResponse>({ method: 'GET', path: `/organisations/${data}` }));
const fetchMembers = createServerFn({ method: 'GET' })
  .validator((orgId: string) => orgId)
  .handler(({ data }) => serverFetch<MembersResponse>({ method: 'GET', path: `/organisations/${data}/members` }));
const fetchInvitations = createServerFn({ method: 'GET' })
  .validator((orgId: string) => orgId)
  .handler(({ data }) => serverFetch<InvitationsResponse>({ method: 'GET', path: `/organisations/${data}/invitations` }));
const fetchDomains = createServerFn({ method: 'GET' })
  .validator((orgId: string) => orgId)
  .handler(({ data }) => serverFetch<DomainsResponse>({ method: 'GET', path: `/organisations/${data}/domains` }));
const fetchIdps = createServerFn({ method: 'GET' })
  .validator((orgId: string) => orgId)
  .handler(({ data }) => serverFetch<IdentityProviderListResponse>({ method: 'GET', path: `/organisations/${data}/identity-providers` }));

const createOrg = createServerFn({ method: 'POST' })
  .validator((body: CreateOrganisationBody) => body)
  .handler(({ data }) => serverFetch<OrganisationResponse>({ method: 'POST', path: '/organisations', body: data }));
const renameOrg = createServerFn({ method: 'POST' })
  .validator((input: { orgId: string; name: string }) => input)
  .handler(({ data }) => serverFetch<OrganisationResponse>({ method: 'PATCH', path: `/organisations/${data.orgId}`, body: { name: data.name } }));
const deleteOrg = createServerFn({ method: 'POST' })
  .validator((orgId: string) => orgId)
  .handler(({ data }) => serverFetch<undefined>({ method: 'DELETE', path: `/organisations/${data}` }));
const leaveOrg = createServerFn({ method: 'POST' })
  .validator((orgId: string) => orgId)
  .handler(({ data }) => serverFetch<undefined>({ method: 'DELETE', path: `/me/organisations/${data}` }));

const updateMemberRole = createServerFn({ method: 'POST' })
  .validator((input: { orgId: string; userId: string; role: MemberRole }) => input)
  .handler(({ data }) => serverFetch<undefined>({ method: 'PATCH', path: `/organisations/${data.orgId}/members/${data.userId}`, body: { role: data.role } }));
const removeMember = createServerFn({ method: 'POST' })
  .validator((input: { orgId: string; userId: string }) => input)
  .handler(({ data }) => serverFetch<undefined>({ method: 'DELETE', path: `/organisations/${data.orgId}/members/${data.userId}` }));

const inviteMember = createServerFn({ method: 'POST' })
  .validator((input: { orgId: string; body: InviteMemberBody }) => input)
  .handler(({ data }) => serverFetch<undefined>({ method: 'POST', path: `/organisations/${data.orgId}/invitations`, body: data.body }));
const revokeInvitation = createServerFn({ method: 'POST' })
  .validator((input: { orgId: string; invitationId: string }) => input)
  .handler(({ data }) => serverFetch<undefined>({ method: 'DELETE', path: `/organisations/${data.orgId}/invitations/${data.invitationId}` }));
const acceptInvitation = createServerFn({ method: 'POST' })
  .validator((token: string) => token)
  .handler(({ data }) => serverFetch<OrganisationResponse>({ method: 'POST', path: '/me/invitations/accept', body: { token: data } }));
const declineInvitation = createServerFn({ method: 'POST' })
  .validator((token: string) => token)
  .handler(({ data }) => serverFetch<undefined>({ method: 'POST', path: '/me/invitations/decline', body: { token: data } }));

const registerDomain = createServerFn({ method: 'POST' })
  .validator((input: { orgId: string; domain: string }) => input)
  .handler(({ data }) => serverFetch<DomainItem>({ method: 'POST', path: `/organisations/${data.orgId}/domains`, body: { domain: data.domain } }));
const verifyDomain = createServerFn({ method: 'POST' })
  .validator((input: { orgId: string; domainId: string }) => input)
  .handler(({ data }) => serverFetch<DomainItem>({ method: 'POST', path: `/organisations/${data.orgId}/domains/${data.domainId}/verify`, body: {} }));
const removeDomain = createServerFn({ method: 'POST' })
  .validator((input: { orgId: string; domainId: string }) => input)
  .handler(({ data }) => serverFetch<undefined>({ method: 'DELETE', path: `/organisations/${data.orgId}/domains/${data.domainId}` }));

const createIdp = createServerFn({ method: 'POST' })
  .validator((input: { orgId: string; body: CreateIdentityProviderBody }) => input)
  .handler(({ data }) => serverFetch<IdentityProvider>({ method: 'POST', path: `/organisations/${data.orgId}/identity-providers`, body: data.body }));
const updateIdp = createServerFn({ method: 'POST' })
  .validator((input: { orgId: string; idpId: string; body: UpdateIdentityProviderBody }) => input)
  .handler(({ data }) => serverFetch<IdentityProvider>({ method: 'PATCH', path: `/organisations/${data.orgId}/identity-providers/${data.idpId}`, body: data.body }));
const deleteIdp = createServerFn({ method: 'POST' })
  .validator((input: { orgId: string; idpId: string }) => input)
  .handler(({ data }) => serverFetch<undefined>({ method: 'DELETE', path: `/organisations/${data.orgId}/identity-providers/${data.idpId}` }));

/* ---------- my organisations ---------- */

export const myOrganisationsQueryOptions = () => queryOptions<MyOrganisationsResponse, ApiError>({ queryKey: orgKeys.mine(), queryFn: () => call(fetchMyOrgs()) });

export function useMyOrganisationsQuery(): UseQueryResult<MyOrganisationsResponse, ApiError> {
  return useQuery(myOrganisationsQueryOptions());
}

export const organisationQueryOptions = (orgId: string, enabled = true) =>
  queryOptions<OrganisationResponse, ApiError>({
    queryKey: orgKeys.detail(orgId),
    queryFn: () => call(fetchOrg({ data: orgId })),
    enabled: enabled && Boolean(orgId),
  });

export function useOrganisationQuery(orgId: string, enabled = true): UseQueryResult<OrganisationResponse, ApiError> {
  return useQuery(organisationQueryOptions(orgId, enabled));
}

export function useCreateOrganisationMutation(): UseMutationResult<OrganisationResponse, ApiError, CreateOrganisationBody> {
  const queryClient = useQueryClient();
  return useMutation<OrganisationResponse, ApiError, CreateOrganisationBody>({
    mutationFn: body => call(createOrg({ data: body })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.mine() }),
  });
}

export function useRenameOrganisationMutation(orgId: string): UseMutationResult<OrganisationResponse, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<OrganisationResponse, ApiError, string>({
    mutationFn: name => call(renameOrg({ data: { orgId, name } })),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.detail(orgId) });
      queryClient.invalidateQueries({ queryKey: orgKeys.mine() });
    },
  });
}

export function useDeleteOrganisationMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: orgId => call(deleteOrg({ data: orgId })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.mine() }),
  });
}

/** Leave an organisation (last-owner protected server-side). */
export function useLeaveOrganisationMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: orgId => call(leaveOrg({ data: orgId })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.mine() }),
  });
}

/* ---------- members ---------- */

export const membersQueryOptions = (orgId: string, enabled = true) =>
  queryOptions<MembersResponse, ApiError>({
    queryKey: orgKeys.members(orgId),
    queryFn: () => call(fetchMembers({ data: orgId })),
    enabled: enabled && Boolean(orgId),
  });

export function useMembersQuery(orgId: string, enabled = true): UseQueryResult<MembersResponse, ApiError> {
  return useQuery(membersQueryOptions(orgId, enabled));
}

export function useUpdateMemberRoleMutation(orgId: string): UseMutationResult<undefined, ApiError, { userId: string; role: MemberRole }> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, { userId: string; role: MemberRole }>({
    mutationFn: ({ userId, role }) => call(updateMemberRole({ data: { orgId, userId, role } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.members(orgId) }),
  });
}

export function useRemoveMemberMutation(orgId: string): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: userId => call(removeMember({ data: { orgId, userId } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.members(orgId) }),
  });
}

/* ---------- invitations ---------- */

export const invitationsQueryOptions = (orgId: string, enabled = true) =>
  queryOptions<InvitationsResponse, ApiError>({
    queryKey: orgKeys.invitations(orgId),
    queryFn: () => call(fetchInvitations({ data: orgId })),
    enabled: enabled && Boolean(orgId),
  });

export function useInvitationsQuery(orgId: string, enabled = true): UseQueryResult<InvitationsResponse, ApiError> {
  return useQuery(invitationsQueryOptions(orgId, enabled));
}

export function useInviteMemberMutation(orgId: string): UseMutationResult<undefined, ApiError, InviteMemberBody> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, InviteMemberBody>({
    mutationFn: body => call(inviteMember({ data: { orgId, body } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.invitations(orgId) }),
  });
}

export function useRevokeInvitationMutation(orgId: string): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: invitationId => call(revokeInvitation({ data: { orgId, invitationId } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.invitations(orgId) }),
  });
}

/** Accept an org invitation from its email token (the caller must hold the invited address verified). */
export function useAcceptInvitationMutation(): UseMutationResult<OrganisationResponse, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<OrganisationResponse, ApiError, string>({
    mutationFn: token => call(acceptInvitation({ data: token })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.mine() }),
  });
}

export function useDeclineInvitationMutation(): UseMutationResult<undefined, ApiError, string> {
  return useMutation<undefined, ApiError, string>({ mutationFn: token => call(declineInvitation({ data: token })) });
}

/* ---------- domains ---------- */

export const domainsQueryOptions = (orgId: string, enabled = true) =>
  queryOptions<DomainsResponse, ApiError>({
    queryKey: orgKeys.domains(orgId),
    queryFn: () => call(fetchDomains({ data: orgId })),
    enabled: enabled && Boolean(orgId),
  });

export function useDomainsQuery(orgId: string, enabled = true): UseQueryResult<DomainsResponse, ApiError> {
  return useQuery(domainsQueryOptions(orgId, enabled));
}

export function useRegisterDomainMutation(orgId: string): UseMutationResult<DomainItem, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<DomainItem, ApiError, string>({
    mutationFn: domain => call(registerDomain({ data: { orgId, domain } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.domains(orgId) }),
  });
}

export function useVerifyDomainMutation(orgId: string): UseMutationResult<DomainItem, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<DomainItem, ApiError, string>({
    mutationFn: domainId => call(verifyDomain({ data: { orgId, domainId } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.domains(orgId) }),
  });
}

export function useRemoveDomainMutation(orgId: string): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: domainId => call(removeDomain({ data: { orgId, domainId } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.domains(orgId) }),
  });
}

/* ---------- identity providers ---------- */

export const identityProvidersQueryOptions = (orgId: string, enabled = true) =>
  queryOptions<IdentityProviderListResponse, ApiError>({
    queryKey: orgKeys.idps(orgId),
    queryFn: () => call(fetchIdps({ data: orgId })),
    enabled: enabled && Boolean(orgId),
  });

export function useIdentityProvidersQuery(orgId: string, enabled = true): UseQueryResult<IdentityProviderListResponse, ApiError> {
  return useQuery(identityProvidersQueryOptions(orgId, enabled));
}

export function useCreateIdentityProviderMutation(orgId: string): UseMutationResult<IdentityProvider, ApiError, CreateIdentityProviderBody> {
  const queryClient = useQueryClient();
  return useMutation<IdentityProvider, ApiError, CreateIdentityProviderBody>({
    mutationFn: body => call(createIdp({ data: { orgId, body } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.idps(orgId) }),
  });
}

export function useUpdateIdentityProviderMutation(orgId: string): UseMutationResult<IdentityProvider, ApiError, { idpId: string; body: UpdateIdentityProviderBody }> {
  const queryClient = useQueryClient();
  return useMutation<IdentityProvider, ApiError, { idpId: string; body: UpdateIdentityProviderBody }>({
    mutationFn: ({ idpId, body }) => call(updateIdp({ data: { orgId, idpId, body } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.idps(orgId) }),
  });
}

export function useDeleteIdentityProviderMutation(orgId: string): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: idpId => call(deleteIdp({ data: { orgId, idpId } })),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.idps(orgId) }),
  });
}
