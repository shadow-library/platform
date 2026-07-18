/**
 * Importing npm packages
 */
import { useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { ApiError, APIRequest } from './api-request';
import { type JobEnqueueResponse, type JobResponse, type RebrandConfigBody, type RebrandStartBody } from './api-types.gen';

/**
 * The rebrand pipeline converts a source novel into an alternate-world version
 * (de-nationalized, renamed, copy-edited, optional directive-driven scenes).
 * Types are hand-authored until the OpenAPI spec regenerates.
 */

export interface RebrandSettings {
  bannedExtra?: string[];
  auditEnabled?: boolean;
}

export type RebrandPhase = 'pending' | 'ingesting' | 'glossary' | 'converting' | 'done' | 'failed';
export type ConversionStatus = 'converted' | 'attention' | 'failed';

export interface Rebrand {
  id: string;
  status: RebrandPhase;
  directives?: string | null;
  worldNotes?: string | null;
  settings?: RebrandSettings | null;
  lastError?: string | null;
  updatedAt: string;
}

export interface ConversionCounts {
  converted: number;
  attention: number;
  failed: number;
}

export interface RebrandOverview {
  rebrand: Rebrand;
  sourceChapters: number;
  scrapeComplete: boolean;
  glossaryCount: number;
  counts: ConversionCounts;
  job?: JobResponse | null;
}

export interface GlossaryEntry {
  sourceName: string;
  variants?: string[] | null;
  replacement: string;
  category: 'character' | 'place' | 'country' | 'culture' | 'faction' | 'technique' | 'item' | 'term';
  notes?: string | null;
  createdChapter?: number | null;
}

export interface ConversionSummary {
  chapter: number;
  title?: string | null;
  status: ConversionStatus;
  issueCount: number;
  revision: number;
  updatedAt: string;
}

export interface ConversionIssue {
  source: 'residue' | 'audit' | 'run';
  type: string;
  detail: string;
  excerpt?: string;
}

export interface ChapterConversion extends Omit<ConversionSummary, 'issueCount'> {
  body: string;
  summaryOfChanges?: string | null;
  fixes?: { kind: string; detail: string }[] | null;
  addedScenes?: { placement: string; purpose: string }[] | null;
  issues?: ConversionIssue[] | null;
}

const rebrandKeys = {
  all: (projectId: string) => ['projects', projectId, 'rebrand'] as const,
  status: (projectId: string) => [...rebrandKeys.all(projectId), 'status'] as const,
  conversions: (projectId: string) => [...rebrandKeys.all(projectId), 'conversions'] as const,
  conversion: (projectId: string, chapter: number) => [...rebrandKeys.all(projectId), 'conversions', chapter] as const,
  glossary: (projectId: string) => [...rebrandKeys.all(projectId), 'glossary'] as const,
};

function useRebrandInvalidation(projectId: string): () => void {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: rebrandKeys.all(projectId) });
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'jobs'] });
  };
}

export function useRebrandStatusQuery(projectId: string, enabled = true): UseQueryResult<RebrandOverview, ApiError> {
  return useQuery<RebrandOverview, ApiError>({
    queryKey: rebrandKeys.status(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/rebrand`).execute(),
    enabled: enabled && Boolean(projectId),
    // Follow a live pipeline: while the rebrand job is queued or running, keep the status (progress,
    // counts, phase) fresh; once it lands in a terminal state the polling stops.
    refetchInterval: query => {
      const job = query.state.data?.job;
      return job && (job.status === 'pending' || job.status === 'in_progress') ? 2500 : false;
    },
  });
}

export function useRebrandConversionsQuery(projectId: string, refetch = false): UseQueryResult<{ items: ConversionSummary[] }, ApiError> {
  return useQuery<{ items: ConversionSummary[] }, ApiError>({
    queryKey: rebrandKeys.conversions(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/rebrand/chapters`).execute(),
    enabled: Boolean(projectId),
    refetchInterval: refetch ? 2500 : false,
  });
}

export function useRebrandChapterQuery(projectId: string, chapter: number | null): UseQueryResult<ChapterConversion, ApiError> {
  return useQuery<ChapterConversion, ApiError>({
    queryKey: rebrandKeys.conversion(projectId, chapter ?? 0),
    queryFn: () => APIRequest.get(`/projects/${projectId}/rebrand/chapters/${chapter}`).execute(),
    enabled: Boolean(projectId) && chapter !== null,
  });
}

export function useRebrandGlossaryQuery(projectId: string, enabled = true): UseQueryResult<{ items: GlossaryEntry[] }, ApiError> {
  return useQuery<{ items: GlossaryEntry[] }, ApiError>({
    queryKey: rebrandKeys.glossary(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/rebrand/glossary`).query({ limit: 500 }).execute(),
    enabled: enabled && Boolean(projectId),
  });
}

export function useUpdateRebrandConfigMutation(projectId: string): UseMutationResult<Rebrand, ApiError, RebrandConfigBody> {
  const invalidate = useRebrandInvalidation(projectId);
  return useMutation<Rebrand, ApiError, RebrandConfigBody>({
    mutationFn: body => APIRequest.put(`/projects/${projectId}/rebrand/config`).body(body).execute(),
    onSuccess: invalidate,
  });
}

export function useStartRebrandMutation(projectId: string): UseMutationResult<JobEnqueueResponse, ApiError, RebrandStartBody | undefined> {
  const invalidate = useRebrandInvalidation(projectId);
  return useMutation<JobEnqueueResponse, ApiError, RebrandStartBody | undefined>({
    mutationFn: body =>
      APIRequest.post(`/projects/${projectId}/rebrand`)
        .body(body ?? {})
        .execute(),
    onSuccess: invalidate,
  });
}

export function useRerunRebrandChapterMutation(projectId: string): UseMutationResult<JobEnqueueResponse, ApiError, number> {
  const invalidate = useRebrandInvalidation(projectId);
  return useMutation<JobEnqueueResponse, ApiError, number>({
    mutationFn: chapter => APIRequest.post(`/projects/${projectId}/rebrand/chapters/${chapter}`).body({}).execute(),
    onSuccess: invalidate,
  });
}

/** Fetch-on-click manuscript download; not a hook so the bytes never sit in the query cache. */
export function fetchRebrandManuscript(projectId: string): Promise<{ markdown: string }> {
  return APIRequest.get(`/projects/${projectId}/rebrand/manuscript`).execute();
}
