/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, type ApiError } from './api-request';
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

/* ---------- my organisations ---------- */

export function useMyOrganisationsQuery(): UseQueryResult<MyOrganisationsResponse, ApiError> {
  return useQuery<MyOrganisationsResponse, ApiError>({ queryKey: orgKeys.mine(), queryFn: () => APIRequest.get('/me/organisations').execute() });
}

export function useOrganisationQuery(orgId: string, enabled = true): UseQueryResult<OrganisationResponse, ApiError> {
  return useQuery<OrganisationResponse, ApiError>({
    queryKey: orgKeys.detail(orgId),
    queryFn: () => APIRequest.get(`/organisations/${orgId}`).execute(),
    enabled: enabled && Boolean(orgId),
  });
}

export function useCreateOrganisationMutation(): UseMutationResult<OrganisationResponse, ApiError, CreateOrganisationBody> {
  const queryClient = useQueryClient();
  return useMutation<OrganisationResponse, ApiError, CreateOrganisationBody>({
    mutationFn: body => APIRequest.post('/organisations').body(body).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.mine() }),
  });
}

export function useRenameOrganisationMutation(orgId: string): UseMutationResult<OrganisationResponse, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<OrganisationResponse, ApiError, string>({
    mutationFn: name => APIRequest.patch(`/organisations/${orgId}`).body({ name }).execute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: orgKeys.detail(orgId) });
      queryClient.invalidateQueries({ queryKey: orgKeys.mine() });
    },
  });
}

export function useDeleteOrganisationMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: orgId => APIRequest.delete(`/organisations/${orgId}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.mine() }),
  });
}

/** Leave an organisation (last-owner protected server-side). */
export function useLeaveOrganisationMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: orgId => APIRequest.delete(`/me/organisations/${orgId}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.mine() }),
  });
}

/* ---------- members ---------- */

export function useMembersQuery(orgId: string, enabled = true): UseQueryResult<MembersResponse, ApiError> {
  return useQuery<MembersResponse, ApiError>({
    queryKey: orgKeys.members(orgId),
    queryFn: () => APIRequest.get(`/organisations/${orgId}/members`).execute(),
    enabled: enabled && Boolean(orgId),
  });
}

export function useUpdateMemberRoleMutation(orgId: string): UseMutationResult<undefined, ApiError, { userId: string; role: MemberRole }> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, { userId: string; role: MemberRole }>({
    mutationFn: ({ userId, role }) => APIRequest.patch(`/organisations/${orgId}/members/${userId}`).body({ role }).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.members(orgId) }),
  });
}

export function useRemoveMemberMutation(orgId: string): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: userId => APIRequest.delete(`/organisations/${orgId}/members/${userId}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.members(orgId) }),
  });
}

/* ---------- invitations ---------- */

export function useInvitationsQuery(orgId: string, enabled = true): UseQueryResult<InvitationsResponse, ApiError> {
  return useQuery<InvitationsResponse, ApiError>({
    queryKey: orgKeys.invitations(orgId),
    queryFn: () => APIRequest.get(`/organisations/${orgId}/invitations`).execute(),
    enabled: enabled && Boolean(orgId),
  });
}

export function useInviteMemberMutation(orgId: string): UseMutationResult<undefined, ApiError, InviteMemberBody> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, InviteMemberBody>({
    mutationFn: body => APIRequest.post(`/organisations/${orgId}/invitations`).body(body).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.invitations(orgId) }),
  });
}

export function useRevokeInvitationMutation(orgId: string): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: invitationId => APIRequest.delete(`/organisations/${orgId}/invitations/${invitationId}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.invitations(orgId) }),
  });
}

/** Accept an org invitation from its email token (the caller must hold the invited address verified). */
export function useAcceptInvitationMutation(): UseMutationResult<OrganisationResponse, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<OrganisationResponse, ApiError, string>({
    mutationFn: token => APIRequest.post('/me/invitations/accept').body({ token }).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.mine() }),
  });
}

export function useDeclineInvitationMutation(): UseMutationResult<undefined, ApiError, string> {
  return useMutation<undefined, ApiError, string>({ mutationFn: token => APIRequest.post('/me/invitations/decline').body({ token }).execute() });
}

/* ---------- domains ---------- */

export function useDomainsQuery(orgId: string, enabled = true): UseQueryResult<DomainsResponse, ApiError> {
  return useQuery<DomainsResponse, ApiError>({
    queryKey: orgKeys.domains(orgId),
    queryFn: () => APIRequest.get(`/organisations/${orgId}/domains`).execute(),
    enabled: enabled && Boolean(orgId),
  });
}

export function useRegisterDomainMutation(orgId: string): UseMutationResult<DomainItem, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<DomainItem, ApiError, string>({
    mutationFn: domain => APIRequest.post(`/organisations/${orgId}/domains`).body({ domain }).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.domains(orgId) }),
  });
}

export function useVerifyDomainMutation(orgId: string): UseMutationResult<DomainItem, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<DomainItem, ApiError, string>({
    mutationFn: domainId => APIRequest.post(`/organisations/${orgId}/domains/${domainId}/verify`).body({}).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.domains(orgId) }),
  });
}

export function useRemoveDomainMutation(orgId: string): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: domainId => APIRequest.delete(`/organisations/${orgId}/domains/${domainId}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.domains(orgId) }),
  });
}

/* ---------- identity providers ---------- */

export function useIdentityProvidersQuery(orgId: string, enabled = true): UseQueryResult<IdentityProviderListResponse, ApiError> {
  return useQuery<IdentityProviderListResponse, ApiError>({
    queryKey: orgKeys.idps(orgId),
    queryFn: () => APIRequest.get(`/organisations/${orgId}/identity-providers`).execute(),
    enabled: enabled && Boolean(orgId),
  });
}

export function useCreateIdentityProviderMutation(orgId: string): UseMutationResult<IdentityProvider, ApiError, CreateIdentityProviderBody> {
  const queryClient = useQueryClient();
  return useMutation<IdentityProvider, ApiError, CreateIdentityProviderBody>({
    mutationFn: body => APIRequest.post(`/organisations/${orgId}/identity-providers`).body(body).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.idps(orgId) }),
  });
}

export function useUpdateIdentityProviderMutation(orgId: string): UseMutationResult<IdentityProvider, ApiError, { idpId: string; body: UpdateIdentityProviderBody }> {
  const queryClient = useQueryClient();
  return useMutation<IdentityProvider, ApiError, { idpId: string; body: UpdateIdentityProviderBody }>({
    mutationFn: ({ idpId, body }) => APIRequest.patch(`/organisations/${orgId}/identity-providers/${idpId}`).body(body).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.idps(orgId) }),
  });
}

export function useDeleteIdentityProviderMutation(orgId: string): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: idpId => APIRequest.delete(`/organisations/${orgId}/identity-providers/${idpId}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: orgKeys.idps(orgId) }),
  });
}
