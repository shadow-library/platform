import { type QueryClient, useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { toast } from '@shadow-library/ui';

import {
  type ApplyBibleTidyBody,
  type ApplyProposalResponse,
  type AuditFindingDecisionBody,
  type BibleAuditReportResponse,
  type BibleDocResponse,
  type BibleOverviewResponse,
  type BibleSection,
  type BibleTidyPreviewResponse,
  type ListBibleAuditsResponse,
  type ListBibleDocResponse,
  type RevertProposalResponse,
  type UpsertBibleDocBody,
} from './api-types.gen';
import { livePolling } from './live-polling';
import { ApiError, APIRequest, type PollingOptions } from './transport';

/**
 * Story Bible documents, addressed by section + slug. A missing document is a
 * normal state (404) — the screens treat it as "not written yet".
 */
const bibleKeys = {
  list: (projectId: string) => ['projects', projectId, 'bible', 'list'] as const,
  doc: (projectId: string, section: BibleSection, slug: string) => ['projects', projectId, 'bible', section, slug] as const,
  overview: (projectId: string) => ['projects', projectId, 'bible', 'overview'] as const,
  tidy: (projectId: string) => ['projects', projectId, 'bible', 'tidy'] as const,
  audits: (projectId: string) => ['projects', projectId, 'bible', 'audits'] as const,
  auditReport: (projectId: string, reportId: string) => [...bibleKeys.audits(projectId), reportId] as const,
};

export function useListBibleDocsQuery(projectId: string, enabled = true): UseQueryResult<ListBibleDocResponse, ApiError> {
  return useQuery<ListBibleDocResponse, ApiError>({
    queryKey: bibleKeys.list(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/bible`).execute(),
    enabled: enabled && Boolean(projectId),
  });
}

export function useBibleDocQuery(projectId: string, section: BibleSection | undefined, slug: string | undefined): UseQueryResult<BibleDocResponse, ApiError> {
  return useQuery<BibleDocResponse, ApiError>({
    queryKey: bibleKeys.doc(projectId, section as BibleSection, slug ?? ''),
    queryFn: () => APIRequest.get(`/projects/${projectId}/bible/${section}/${slug}`).execute(),
    enabled: Boolean(projectId) && Boolean(section) && Boolean(slug),
  });
}

export interface UpsertBibleDocVariables extends UpsertBibleDocBody {
  section: BibleSection;
  slug: string;
}

/** The PUT replaces frontmatter and body together, so a caller editing only the body sends the frontmatter it read back unchanged. */
export function useUpsertBibleDocMutation(projectId: string): UseMutationResult<BibleDocResponse, ApiError, UpsertBibleDocVariables> {
  const queryClient = useQueryClient();
  return useMutation<BibleDocResponse, ApiError, UpsertBibleDocVariables>({
    mutationFn: ({ section, slug, ...body }) => APIRequest.put(`/projects/${projectId}/bible/${section}/${slug}`).body(body).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', projectId] }),
  });
}

export function useBibleOverviewQuery(projectId: string, enabled = true): UseQueryResult<BibleOverviewResponse, ApiError> {
  return useQuery<BibleOverviewResponse, ApiError>({
    queryKey: bibleKeys.overview(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/bible/overview`).execute(),
    enabled: enabled && Boolean(projectId),
  });
}

export function useBibleTidyPreviewQuery(projectId: string, enabled = true): UseQueryResult<BibleTidyPreviewResponse, ApiError> {
  return useQuery<BibleTidyPreviewResponse, ApiError>({
    queryKey: bibleKeys.tidy(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/bible/tidy`).execute(),
    enabled: enabled && Boolean(projectId),
    staleTime: 0,
  });
}

export function useApplyBibleTidyMutation(projectId: string): UseMutationResult<ApplyProposalResponse, ApiError, ApplyBibleTidyBody> {
  const queryClient = useQueryClient();
  return useMutation<ApplyProposalResponse, ApiError, ApplyBibleTidyBody>({
    mutationFn: body => APIRequest.post(`/projects/${projectId}/bible/tidy`).body(body).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['projects', projectId] }),
  });
}

/** Reports through the hook's own callbacks, which still run when the Undo is clicked after the dialog that offered it has gone. */
export function useUndoBibleTidyMutation(projectId: string): UseMutationResult<RevertProposalResponse, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<RevertProposalResponse, ApiError, string>({
    mutationFn: proposalId => APIRequest.post(`/projects/${projectId}/proposals/${proposalId}/revert`).execute(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['projects', projectId] });
      toast.success('Tidy-up undone');
    },
    onError: err => toast.danger(`Could not undo the tidy-up: ${err.message}`),
  });
}

/** Past audits, newest first, up to the most recent 50 (the server's own limit). */
export function useListAuditsQuery(projectId: string, enabled = true, opts?: PollingOptions<ListBibleAuditsResponse>): UseQueryResult<ListBibleAuditsResponse, ApiError> {
  return useQuery<ListBibleAuditsResponse, ApiError>({
    queryKey: bibleKeys.audits(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/bible/audits`).execute(),
    enabled: enabled && Boolean(projectId),
    refetchInterval: livePolling(projectId, opts?.refetchInterval),
  });
}

export function useAuditReportQuery(projectId: string, reportId: string | undefined, enabled = true): UseQueryResult<BibleAuditReportResponse, ApiError> {
  return useQuery<BibleAuditReportResponse, ApiError>({
    queryKey: bibleKeys.auditReport(projectId, reportId ?? ''),
    queryFn: () => APIRequest.get(`/projects/${projectId}/bible/audits/${reportId}`).execute(),
    enabled: enabled && Boolean(projectId) && Boolean(reportId),
  });
}

/** Primes a report's cache entry straight from a source that already carries it in full (the audits list, a decision response) — no extra fetch. */
export function seedAuditReport(queryClient: QueryClient, projectId: string, report: BibleAuditReportResponse): void {
  queryClient.setQueryData(bibleKeys.auditReport(projectId, report.id), report);
}

export function invalidateAudits(queryClient: QueryClient, projectId: string): void {
  void queryClient.invalidateQueries({ queryKey: bibleKeys.audits(projectId) });
}

export interface DecideAuditFindingVariables {
  reportId: string;
  findingId: string;
  body: AuditFindingDecisionBody;
}

export function useDecideAuditFindingMutation(projectId: string): UseMutationResult<BibleAuditReportResponse, ApiError, DecideAuditFindingVariables> {
  const queryClient = useQueryClient();
  return useMutation<BibleAuditReportResponse, ApiError, DecideAuditFindingVariables>({
    mutationFn: ({ reportId, findingId, body }) => APIRequest.post(`/projects/${projectId}/bible/audits/${reportId}/findings/${findingId}/decision`).body(body).execute(),
    onSuccess: report => {
      seedAuditReport(queryClient, projectId, report);
      invalidateAudits(queryClient, projectId);
    },
  });
}
