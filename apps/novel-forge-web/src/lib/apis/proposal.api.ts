import { type QueryClient, queryOptions, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';

import {
  type ApplyProposalResponse,
  type BibleAuditJobResponse,
  type ChangeOpItem,
  type LedgerEntryResponse,
  type ListChangesResponse,
  type ListProposalResponse,
  type ListProposalsQueryParams,
  type ProposalCurrentResponse,
  type ProposalOpDependencyErrorResponse,
  type ProposalResponse,
  type RedoProposalOpResponse,
  type RejectProposalOpBody,
  type RevertProposalResponse,
  type RollbackResponse,
  type UndoProposalOpResponse,
} from './api-types.gen';
import { invalidateSoon } from './batched-invalidation';
import { invalidateLedger } from './ledger.api';
import { ApiError, APIRequest } from './transport';
import { refinementKeys } from './refinement-keys';

interface ApplyProposalVariables {
  proposalId: string;
  // Cherry-pick: apply only these change-set indexes; the rest are recorded as declined. Absent → all.
  opIndexes?: number[];
}

export const listProposalsQueryOptions = (projectId: string, params?: ListProposalsQueryParams): UseQueryOptions<ListProposalResponse, ApiError> =>
  queryOptions<ListProposalResponse, ApiError>({
    queryKey: refinementKeys.proposalList(projectId, params),
    queryFn: () =>
      APIRequest.get(`/projects/${projectId}/proposals`)
        .query(params ?? {})
        .execute(),
  });

export function useListProposalsQuery(projectId: string, params?: ListProposalsQueryParams, enabled = true): UseQueryResult<ListProposalResponse, ApiError> {
  return useQuery({ ...listProposalsQueryOptions(projectId, params), enabled: enabled && Boolean(projectId) });
}

export function useProposalQuery(projectId: string, proposalId: string | undefined, enabled = true): UseQueryResult<ProposalResponse, ApiError> {
  return useQuery<ProposalResponse, ApiError>({
    queryKey: refinementKeys.proposal(projectId, proposalId ?? ''),
    queryFn: () => APIRequest.get(`/projects/${projectId}/proposals/${proposalId}`).execute(),
    enabled: enabled && Boolean(projectId) && Boolean(proposalId),
  });
}

export function useProposalCurrentQuery(projectId: string, proposalId: string | undefined, enabled = true): UseQueryResult<ProposalCurrentResponse, ApiError> {
  return useQuery<ProposalCurrentResponse, ApiError>({
    queryKey: refinementKeys.proposalCurrent(projectId, proposalId ?? ''),
    staleTime: 0,
    queryFn: () => APIRequest.get(`/projects/${projectId}/proposals/${proposalId}/current`).execute(),
    enabled: enabled && Boolean(projectId) && Boolean(proposalId),
  });
}

function invalidateProposals(queryClient: ReturnType<typeof useQueryClient>, projectId: string): void {
  queryClient.invalidateQueries({ queryKey: refinementKeys.proposals(projectId) });
  queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
}

export function useApplyProposalMutation(projectId: string): UseMutationResult<ApplyProposalResponse, ApiError, ApplyProposalVariables> {
  const queryClient = useQueryClient();
  return useMutation<ApplyProposalResponse, ApiError, ApplyProposalVariables>({
    mutationFn: ({ proposalId, opIndexes }) =>
      APIRequest.post(`/projects/${projectId}/proposals/${proposalId}/apply`)
        .body(opIndexes ? { opIndexes } : {})
        .execute(),
    onSuccess: result => {
      queryClient.setQueryData(refinementKeys.proposal(projectId, result.proposal.id), result.proposal);
      invalidateProposals(queryClient, projectId);
    },
    // A refused apply may still have settled the card, as a conflict does, so the card is read again rather than left showing pending.
    onError: () => invalidateProposals(queryClient, projectId),
  });
}

export function useRevertProposalMutation(projectId: string): UseMutationResult<RevertProposalResponse, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<RevertProposalResponse, ApiError, string>({
    mutationFn: proposalId => APIRequest.post(`/projects/${projectId}/proposals/${proposalId}/revert`).execute(),
    onSuccess: () => invalidateProposals(queryClient, projectId),
  });
}

export type ProposalOpDirection = 'undo' | 'redo';

export interface ProposalOpVariables {
  proposalId: string;
  opIndex: number;
  direction: ProposalOpDirection;
}

/** `blocked`: other changes of the turn must move first (RFN_015 for an undo, RFN_016 for a redo), in the order the server lists them. */
export type ProposalOpOutcome = { kind: 'done'; proposal: ProposalResponse } | { kind: 'blocked'; opIndexes: number[] };

const OP_DEPENDENCY_CODES: ReadonlySet<string> = new Set(['RFN_015', 'RFN_016']);

type ProposalOpReply = UndoProposalOpResponse | RedoProposalOpResponse | ProposalOpDependencyErrorResponse;

function isDependencyError(value: ProposalOpReply): value is ProposalOpDependencyErrorResponse {
  return typeof (value as Partial<ProposalOpDependencyErrorResponse>).code === 'string';
}

/** A modelled 409 back into an outcome: the dependency refusals become `blocked`, every other refusal the `ApiError` it would have thrown. */
export function proposalOpOutcome(reply: ProposalOpReply): ProposalOpOutcome {
  if (!isDependencyError(reply)) return { kind: 'done', proposal: reply.proposal };
  const opIndexes = reply.details?.opIndexes ?? [];
  if (OP_DEPENDENCY_CODES.has(reply.code) && opIndexes.length > 0) return { kind: 'blocked', opIndexes };
  const type = (reply as { type?: unknown }).type;
  throw new ApiError(409, { code: reply.code, type: typeof type === 'string' ? type : 'Conflict', message: reply.message, fields: reply.fields });
}

// A 409 is modelled rather than thrown because `ApiError` keeps only the envelope and drops `details`, which names the changes to move first.
export async function sendProposalOp(projectId: string, { proposalId, opIndex, direction }: ProposalOpVariables): Promise<ProposalOpOutcome> {
  const reply = await APIRequest.post(`/projects/${projectId}/proposals/${proposalId}/ops/${opIndex}/${direction}`)
    .body(direction === 'undo' ? { scope: 'not_now' } : {})
    .modeled(409)
    .execute<ProposalOpReply>();
  return proposalOpOutcome(reply);
}

/**
 * Undoes or redoes one change of a chat turn's applied proposal. Everything a change can touch is refreshed as after a whole revert, batched so a
 * sequence of changes refetches once.
 */
export function useProposalOpMutation(projectId: string): UseMutationResult<ProposalOpOutcome, ApiError, ProposalOpVariables> {
  const queryClient = useQueryClient();
  return useMutation<ProposalOpOutcome, ApiError, ProposalOpVariables>({
    mutationFn: variables => sendProposalOp(projectId, variables),
    onSuccess: outcome => {
      if (outcome.kind === 'blocked') return;
      queryClient.setQueryData(refinementKeys.proposal(projectId, outcome.proposal.id), outcome.proposal);
      invalidateSoon(queryClient, { queryKey: ['projects', projectId] });
    },
  });
}

/** The proposal as the cache holds it now, which may be newer than a rendered copy. */
export function cachedProposal(queryClient: QueryClient, projectId: string, proposalId: string): ProposalResponse | undefined {
  return queryClient.getQueryData<ProposalResponse>(refinementKeys.proposal(projectId, proposalId));
}

export function useListChangesQuery(projectId: string, enabled = true): UseQueryResult<ListChangesResponse, ApiError> {
  return useQuery<ListChangesResponse, ApiError>({
    queryKey: refinementKeys.changes(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/changes`).query({ limit: 100 }).execute(),
    enabled: enabled && Boolean(projectId),
  });
}

export function useRollbackMutation(projectId: string): UseMutationResult<RollbackResponse, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<RollbackResponse, ApiError, string>({
    mutationFn: afterProposalId => APIRequest.post(`/projects/${projectId}/changes/rollback`).body({ afterProposalId }).execute(),
    onSuccess: () => invalidateProposals(queryClient, projectId),
  });
}

export interface UpdateProposalVariables {
  proposalId: string;
  changeSet: ChangeOpItem[];
}

/** Replaces a pending card's change-set; the server re-checks it and returns the card with its warnings judged again. */
export function useUpdateProposalMutation(projectId: string): UseMutationResult<ProposalResponse, ApiError, UpdateProposalVariables> {
  const queryClient = useQueryClient();
  return useMutation<ProposalResponse, ApiError, UpdateProposalVariables>({
    mutationFn: ({ proposalId, changeSet }) => APIRequest.patch(`/projects/${projectId}/proposals/${proposalId}`).body({ changeSet }).execute(),
    onSuccess: proposal => {
      queryClient.setQueryData(refinementKeys.proposal(projectId, proposal.id), proposal);
      queryClient.invalidateQueries({ queryKey: refinementKeys.proposalCurrent(projectId, proposal.id) });
    },
  });
}

export interface RejectProposalOpVariables extends RejectProposalOpBody {
  proposalId: string;
  opIndex: number;
}

/** Turns down one op of a pending card as a Notebook rejection, scoped to how long it stays turned down. */
export function useRejectProposalOpMutation(projectId: string): UseMutationResult<LedgerEntryResponse, ApiError, RejectProposalOpVariables> {
  const queryClient = useQueryClient();
  return useMutation<LedgerEntryResponse, ApiError, RejectProposalOpVariables>({
    mutationFn: ({ proposalId, opIndex, ...body }) => APIRequest.post(`/projects/${projectId}/proposals/${proposalId}/ops/${opIndex}/reject`).body(body).execute(),
    onSuccess: () => invalidateLedger(queryClient, projectId),
  });
}

export function useDiscardProposalMutation(projectId: string): UseMutationResult<ProposalResponse, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<ProposalResponse, ApiError, string>({
    mutationFn: proposalId => APIRequest.post(`/projects/${projectId}/proposals/${proposalId}/discard`).execute(),
    onSuccess: proposal => {
      queryClient.setQueryData(refinementKeys.proposal(projectId, proposal.id), proposal);
      invalidateProposals(queryClient, projectId);
    },
  });
}

export interface AdoptProposalVariables {
  proposalId: string;
  sessionId: string;
}

/** Brings a pending card into a chat; only the card lists move, so nothing else about the project is refetched. */
export function useAdoptProposalMutation(projectId: string): UseMutationResult<ProposalResponse, ApiError, AdoptProposalVariables> {
  const queryClient = useQueryClient();
  return useMutation<ProposalResponse, ApiError, AdoptProposalVariables>({
    mutationFn: ({ proposalId, sessionId }) => APIRequest.post(`/projects/${projectId}/proposals/${proposalId}/adopt`).body({ sessionId }).execute(),
    onSuccess: proposal => {
      queryClient.setQueryData(refinementKeys.proposal(projectId, proposal.id), proposal);
      queryClient.invalidateQueries({ queryKey: [...refinementKeys.proposals(projectId), 'list'] });
    },
    onError: () => queryClient.invalidateQueries({ queryKey: [...refinementKeys.proposals(projectId), 'list'] }),
  });
}

export function useAuditBibleMutation(projectId: string): UseMutationResult<BibleAuditJobResponse, ApiError, undefined> {
  const queryClient = useQueryClient();
  return useMutation<BibleAuditJobResponse, ApiError, undefined>({
    mutationFn: () => APIRequest.post(`/projects/${projectId}/bible/audits`).execute(),
    onSuccess: () => invalidateProposals(queryClient, projectId),
  });
}
