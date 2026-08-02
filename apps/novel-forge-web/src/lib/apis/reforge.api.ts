/**
 * Importing npm packages
 */
import { useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { type JobEnqueueResponse, type JobResponse } from './api-types.gen';
import { ApiError, APIRequest } from './transport';

/**
 * The reforge pipeline re-authors a source novel from scratch: it reuses the rebrand rename bible, then
 * extracts a faithful per-chapter outline and re-writes each chapter in the house style, removing the
 * content the author declared unwanted and elevating machine-translation prose. Body types are
 * hand-authored until the OpenAPI spec regenerates.
 */

export type ReforgeFidelity = 'preserve' | 'close' | 'loose';

export interface ReforgeSettings {
  judgeEnabled?: boolean;
  targetWords?: number;
}

export interface ReforgeConfigBody {
  instructions?: string | null;
  fidelity?: ReforgeFidelity;
  settings?: ReforgeSettings;
}

export interface ReforgeStartBody {
  force?: boolean;
  limit?: number;
}

export type ReforgePhase = 'pending' | 'glossary' | 'reforging' | 'done' | 'failed';
export type ReforgeChapterStatus = 'reforged' | 'attention' | 'failed';

export interface Reforge {
  id: string;
  status: ReforgePhase;
  instructions?: string | null;
  fidelity: ReforgeFidelity;
  settings?: ReforgeSettings | null;
  lastError?: string | null;
  updatedAt: string;
}

export interface ReforgeCounts {
  reforged: number;
  attention: number;
  failed: number;
}

export interface ReforgeOverview {
  reforge: Reforge;
  sourceChapters: number;
  glossaryCount: number;
  counts: ReforgeCounts;
  job?: JobResponse | null;
}

export interface ReforgeSummary {
  chapter: number;
  title?: string | null;
  status: ReforgeChapterStatus;
  issueCount: number;
  wordCount?: number | null;
  revision: number;
  updatedAt: string;
}

export interface ReforgeIssue {
  source: 'residue' | 'fidelity' | 'run';
  type: string;
  detail: string;
  excerpt?: string;
}

export interface ReforgeChanges {
  renames?: string[];
  removals?: string[];
  addedScenes?: string[];
  proseNotes?: string;
}

export interface ReforgeFidelityVerdict {
  verdict?: 'clean' | 'issues';
  coveredBeats?: number;
  totalBeats?: number;
  missingBeats?: string[];
}

export interface ChapterReforge extends Omit<ReforgeSummary, 'issueCount'> {
  body: string;
  summary?: string | null;
  changes?: ReforgeChanges | null;
  fidelity?: ReforgeFidelityVerdict | null;
  issues?: ReforgeIssue[] | null;
}

const reforgeKeys = {
  all: (projectId: string) => ['projects', projectId, 'reforge'] as const,
  status: (projectId: string) => [...reforgeKeys.all(projectId), 'status'] as const,
  chapters: (projectId: string) => [...reforgeKeys.all(projectId), 'chapters'] as const,
  chapter: (projectId: string, chapter: number) => [...reforgeKeys.all(projectId), 'chapters', chapter] as const,
};

function useReforgeInvalidation(projectId: string): () => void {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: reforgeKeys.all(projectId) });
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'jobs'] });
  };
}

export function useReforgeStatusQuery(projectId: string, enabled = true): UseQueryResult<ReforgeOverview, ApiError> {
  return useQuery<ReforgeOverview, ApiError>({
    queryKey: reforgeKeys.status(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/reforge`).execute(),
    enabled: enabled && Boolean(projectId),
    // Follow a live pipeline: while the reforge job is queued or running, keep the status (progress,
    // counts, phase) fresh; once it lands in a terminal state the polling stops.
    refetchInterval: query => {
      const job = query.state.data?.job;
      return job && (job.status === 'pending' || job.status === 'in_progress') ? 2500 : false;
    },
  });
}

export function useReforgeChaptersQuery(projectId: string, refetch = false): UseQueryResult<{ items: ReforgeSummary[] }, ApiError> {
  return useQuery<{ items: ReforgeSummary[] }, ApiError>({
    queryKey: reforgeKeys.chapters(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/reforge/chapters`).execute(),
    enabled: Boolean(projectId),
    refetchInterval: refetch ? 2500 : false,
  });
}

export function useReforgeChapterQuery(projectId: string, chapter: number | null): UseQueryResult<ChapterReforge, ApiError> {
  return useQuery<ChapterReforge, ApiError>({
    queryKey: reforgeKeys.chapter(projectId, chapter ?? 0),
    queryFn: () => APIRequest.get(`/projects/${projectId}/reforge/chapters/${chapter}`).execute(),
    enabled: Boolean(projectId) && chapter !== null,
  });
}

export function useUpdateReforgeConfigMutation(projectId: string): UseMutationResult<Reforge, ApiError, ReforgeConfigBody> {
  const invalidate = useReforgeInvalidation(projectId);
  return useMutation<Reforge, ApiError, ReforgeConfigBody>({
    mutationFn: body => APIRequest.put(`/projects/${projectId}/reforge/config`).body(body).execute(),
    onSuccess: invalidate,
  });
}

export function useStartReforgeMutation(projectId: string): UseMutationResult<JobEnqueueResponse, ApiError, ReforgeStartBody | undefined> {
  const invalidate = useReforgeInvalidation(projectId);
  return useMutation<JobEnqueueResponse, ApiError, ReforgeStartBody | undefined>({
    mutationFn: body =>
      APIRequest.post(`/projects/${projectId}/reforge`)
        .body(body ?? {})
        .execute(),
    onSuccess: invalidate,
  });
}

export function useRerunReforgeChapterMutation(projectId: string): UseMutationResult<JobEnqueueResponse, ApiError, number> {
  const invalidate = useReforgeInvalidation(projectId);
  return useMutation<JobEnqueueResponse, ApiError, number>({
    mutationFn: chapter => APIRequest.post(`/projects/${projectId}/reforge/chapters/${chapter}`).body({}).execute(),
    onSuccess: invalidate,
  });
}

/** Fetch-on-click manuscript download; not a hook so the bytes never sit in the query cache. */
export function fetchReforgeManuscript(projectId: string): Promise<{ markdown: string }> {
  return APIRequest.get(`/projects/${projectId}/reforge/manuscript`).execute();
}
