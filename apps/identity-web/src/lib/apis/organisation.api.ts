import { queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

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
import { type ApiError, APIRequest } from './transport';

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
export type MemberStatus = MemberItem['status'];

/** Org-scoped hold on a member. It never touches the person's global account — see the organisation controller. */
export interface MemberStatusInput {
  userId: string;
  status: MemberStatus;
  reason?: string;
  until?: string;
}
export type InvitableRole = InviteMemberBody['role'];
export type DomainStatus = DomainItem['status'];

export interface OrgAccess {
  org: MyOrganisation | null;
  /** ADMIN or OWNER of a TEAM organisation — the rank the server's org-administration routes require; personal workspaces reject administration outright. */
  canManage: boolean;
}

export const orgKeys = {
  all: ['organisations'] as const,
  mine: () => [...orgKeys.all, 'mine'] as const,
  detail: (id: string) => [...orgKeys.all, id] as const,
  members: (id: string) => [...orgKeys.all, id, 'members'] as const,
  invitations: (id: string) => [...orgKeys.all, id, 'invitations'] as const,
  domains: (id: string) => [...orgKeys.all, id, 'domains'] as const,
  idps: (id: string) => [...orgKeys.all, id, 'identity-providers'] as const,
};

export const myOrganisationsQueryOptions = () =>
  queryOptions<MyOrganisationsResponse, ApiError>({
    queryKey: orgKeys.mine(),
    queryFn: ({ signal }) => APIRequest.get('/me/organisations').signal(signal).execute<MyOrganisationsResponse>(),
  });

export function useMyOrganisationsQuery(): UseQueryResult<MyOrganisationsResponse, ApiError> {
  return useQuery(myOrganisationsQueryOptions());
}

/** The caller's membership view of one organisation; admin-gated queries and controls key off `canManage` so non-admins never hit 403s. */
export function orgAccessOf(response: MyOrganisationsResponse | undefined, orgId: string): OrgAccess {
  const org = response?.organisations.find(item => item.id === orgId) ?? null;
  const canManage = org !== null && org.type === 'TEAM' && (org.role === 'OWNER' || org.role === 'ADMIN');
  return { org, canManage };
}

export function useOrgAccess(orgId: string): OrgAccess {
  const orgs = useMyOrganisationsQuery();
  return orgAccessOf(orgs.data, orgId);
}

export const organisationQueryOptions = (orgId: string, enabled = true) =>
  queryOptions<OrganisationResponse, ApiError>({
    queryKey: orgKeys.detail(orgId),
    queryFn: ({ signal }) => APIRequest.get(`/organisations/${orgId}`).signal(signal).execute<OrganisationResponse>(),
    enabled: enabled && Boolean(orgId),
  });

export function useOrganisationQuery(orgId: string, enabled = true): UseQueryResult<OrganisationResponse, ApiError> {
  return useQuery(organisationQueryOptions(orgId, enabled));
}

export function useCreateOrganisationMutation(): UseMutationResult<OrganisationResponse, ApiError, CreateOrganisationBody> {
  const queryClient = useQueryClient();
  return useMutation<OrganisationResponse, ApiError, CreateOrganisationBody>({
    mutationFn: body => APIRequest.post('/organisations').body(body).execute<OrganisationResponse>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.mine() }),
  });
}

export function useRenameOrganisationMutation(orgId: string): UseMutationResult<OrganisationResponse, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<OrganisationResponse, ApiError, string>({
    mutationFn: name => APIRequest.patch(`/organisations/${orgId}`).body({ name }).execute<OrganisationResponse>(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.detail(orgId) });
      queryClient.invalidateQueries({ queryKey: orgKeys.mine() });
    },
  });
}

export function useDeleteOrganisationMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: orgId => APIRequest.delete(`/organisations/${orgId}`).execute<undefined>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.mine() }),
  });
}

/** Leave an organisation (last-owner protected server-side). */
export function useLeaveOrganisationMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: orgId => APIRequest.delete(`/me/organisations/${orgId}`).execute<undefined>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.mine() }),
  });
}

export const membersQueryOptions = (orgId: string, enabled = true) =>
  queryOptions<MembersResponse, ApiError>({
    queryKey: orgKeys.members(orgId),
    queryFn: ({ signal }) => APIRequest.get(`/organisations/${orgId}/members`).signal(signal).execute<MembersResponse>(),
    enabled: enabled && Boolean(orgId),
  });

export function useMembersQuery(orgId: string, enabled = true): UseQueryResult<MembersResponse, ApiError> {
  return useQuery(membersQueryOptions(orgId, enabled));
}

export function useUpdateMemberRoleMutation(orgId: string): UseMutationResult<undefined, ApiError, { userId: string; role: MemberRole }> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, { userId: string; role: MemberRole }>({
    mutationFn: ({ userId, role }) => APIRequest.patch(`/organisations/${orgId}/members/${userId}`).body({ role }).execute<undefined>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.members(orgId) }),
  });
}

export function useUpdateMemberStatusMutation(orgId: string): UseMutationResult<undefined, ApiError, MemberStatusInput> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, MemberStatusInput>({
    mutationFn: input =>
      APIRequest.patch(`/organisations/${orgId}/members/${input.userId}/status`).body({ status: input.status, reason: input.reason, until: input.until }).execute<undefined>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.members(orgId) }),
  });
}

export function useRemoveMemberMutation(orgId: string): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: userId => APIRequest.delete(`/organisations/${orgId}/members/${userId}`).execute<undefined>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.members(orgId) }),
  });
}

export const invitationsQueryOptions = (orgId: string, enabled = true) =>
  queryOptions<InvitationsResponse, ApiError>({
    queryKey: orgKeys.invitations(orgId),
    queryFn: ({ signal }) => APIRequest.get(`/organisations/${orgId}/invitations`).signal(signal).execute<InvitationsResponse>(),
    enabled: enabled && Boolean(orgId),
  });

export function useInvitationsQuery(orgId: string, enabled = true): UseQueryResult<InvitationsResponse, ApiError> {
  return useQuery(invitationsQueryOptions(orgId, enabled));
}

export function useInviteMemberMutation(orgId: string): UseMutationResult<undefined, ApiError, InviteMemberBody> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, InviteMemberBody>({
    mutationFn: body => APIRequest.post(`/organisations/${orgId}/invitations`).body(body).execute<undefined>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.invitations(orgId) }),
  });
}

export function useRevokeInvitationMutation(orgId: string): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: invitationId => APIRequest.delete(`/organisations/${orgId}/invitations/${invitationId}`).execute<undefined>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.invitations(orgId) }),
  });
}

/** Accept an org invitation from its email token (the caller must hold the invited address verified). */
export function useAcceptInvitationMutation(): UseMutationResult<OrganisationResponse, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<OrganisationResponse, ApiError, string>({
    mutationFn: token => APIRequest.post('/me/invitations/accept').body({ token }).execute<OrganisationResponse>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.mine() }),
  });
}

export function useDeclineInvitationMutation(): UseMutationResult<undefined, ApiError, string> {
  return useMutation<undefined, ApiError, string>({
    mutationFn: token => APIRequest.post('/me/invitations/decline').body({ token }).execute<undefined>(),
  });
}

export const domainsQueryOptions = (orgId: string, enabled = true) =>
  queryOptions<DomainsResponse, ApiError>({
    queryKey: orgKeys.domains(orgId),
    queryFn: ({ signal }) => APIRequest.get(`/organisations/${orgId}/domains`).signal(signal).execute<DomainsResponse>(),
    enabled: enabled && Boolean(orgId),
  });

export function useDomainsQuery(orgId: string, enabled = true): UseQueryResult<DomainsResponse, ApiError> {
  return useQuery(domainsQueryOptions(orgId, enabled));
}

export function useRegisterDomainMutation(orgId: string): UseMutationResult<DomainItem, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<DomainItem, ApiError, string>({
    mutationFn: domain => APIRequest.post(`/organisations/${orgId}/domains`).body({ domain }).execute<DomainItem>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.domains(orgId) }),
  });
}

export function useVerifyDomainMutation(orgId: string): UseMutationResult<DomainItem, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<DomainItem, ApiError, string>({
    mutationFn: domainId => APIRequest.post(`/organisations/${orgId}/domains/${domainId}/verify`).body({}).execute<DomainItem>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.domains(orgId) }),
  });
}

export function useRemoveDomainMutation(orgId: string): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: domainId => APIRequest.delete(`/organisations/${orgId}/domains/${domainId}`).execute<undefined>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.domains(orgId) }),
  });
}

export const identityProvidersQueryOptions = (orgId: string, enabled = true) =>
  queryOptions<IdentityProviderListResponse, ApiError>({
    queryKey: orgKeys.idps(orgId),
    queryFn: ({ signal }) => APIRequest.get(`/organisations/${orgId}/identity-providers`).signal(signal).execute<IdentityProviderListResponse>(),
    enabled: enabled && Boolean(orgId),
  });

export function useIdentityProvidersQuery(orgId: string, enabled = true): UseQueryResult<IdentityProviderListResponse, ApiError> {
  return useQuery(identityProvidersQueryOptions(orgId, enabled));
}

export function useCreateIdentityProviderMutation(orgId: string): UseMutationResult<IdentityProvider, ApiError, CreateIdentityProviderBody> {
  const queryClient = useQueryClient();
  return useMutation<IdentityProvider, ApiError, CreateIdentityProviderBody>({
    mutationFn: body => APIRequest.post(`/organisations/${orgId}/identity-providers`).body(body).execute<IdentityProvider>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.idps(orgId) }),
  });
}

export function useUpdateIdentityProviderMutation(orgId: string): UseMutationResult<IdentityProvider, ApiError, { idpId: string; body: UpdateIdentityProviderBody }> {
  const queryClient = useQueryClient();
  return useMutation<IdentityProvider, ApiError, { idpId: string; body: UpdateIdentityProviderBody }>({
    mutationFn: ({ idpId, body }) => APIRequest.patch(`/organisations/${orgId}/identity-providers/${idpId}`).body(body).execute<IdentityProvider>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.idps(orgId) }),
  });
}

export function useDeleteIdentityProviderMutation(orgId: string): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: idpId => APIRequest.delete(`/organisations/${orgId}/identity-providers/${idpId}`).execute<undefined>(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.idps(orgId) }),
  });
}
