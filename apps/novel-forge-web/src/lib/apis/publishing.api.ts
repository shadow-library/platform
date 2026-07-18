/**
 * Importing npm packages
 */
import { useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { ApiError, APIRequest } from './api-request';

/**
 * The reader-publish surface (reader-publish design §7): the forge-side publication ledger and the
 * actions that push a novel and its approved chapters to the external reader service. Types are
 * hand-authored until the OpenAPI spec regenerates.
 */

export type PublicationStatus = 'live' | 'retired';
export type ChapterPublicationStatus = 'scheduled' | 'published' | 'failed' | 'unpublished';

export interface Publication {
  id: string;
  novelSlug: string;
  title: string;
  blurb?: string | null;
  coverPath?: string | null;
  genres?: string[] | null;
  status: PublicationStatus;
  revision: number;
  updatedAt: string;
}

export interface ChapterPublication {
  id: string;
  chapter: number;
  publishedOrdinal: number;
  title: string;
  authorNote?: string | null;
  contentHash: string;
  revision: number;
  status: ChapterPublicationStatus;
  scheduledAt?: string | null;
  publishedAt?: string | null;
  error?: string | null;
  updatedAt: string;
}

export interface PublicationsLedger {
  /** Omitted (never null) while the project has never been published. */
  publication?: Publication;
  /** Sorted by `publishedOrdinal`. */
  chapters: ChapterPublication[];
}

export interface PublishNovelBody {
  /** Immutable after first publish — it anchors reader URLs. Omitted, it is derived from the title. */
  novelSlug?: string;
  title?: string;
  blurb?: string | null;
  coverPath?: string | null;
  genres?: string[];
  /** Omitted on `POST /publish` (the go-live action) always means `live`. */
  status?: PublicationStatus;
}

export interface PublishChapterVariables {
  chapter: number;
  /** ISO 8601; omitted publishes immediately, future-dated leaves the push to the scheduler. */
  scheduledAt?: string;
}

export interface ReconcileFailure {
  ordinal: number;
  error: string;
}

export interface ReconcileResult {
  novel: 'applied' | 'noop';
  pushed: number[];
  deleted: number[];
  skipped: number[];
  failed: ReconcileFailure[];
  /** Reader ordinals the ledger cannot account for — reported for the author, never deleted. */
  unknownOrdinals: number[];
}

const publishingKeys = {
  all: (projectId: string) => ['projects', projectId, 'publications'] as const,
};

function usePublishingInvalidation(projectId: string): () => void {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: publishingKeys.all(projectId) });
    // Every publish action enqueues a push job, so the topbar's job tray should refresh too.
    queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'jobs'] });
  };
}

export function usePublicationsQuery(projectId: string, enabled = true): UseQueryResult<PublicationsLedger, ApiError> {
  return useQuery<PublicationsLedger, ApiError>({
    queryKey: publishingKeys.all(projectId),
    queryFn: () => APIRequest.get(`/projects/${projectId}/publications`).execute(),
    enabled: enabled && Boolean(projectId),
    // Publishing is asynchronous (202 + push job): while any row is still scheduled, keep the ledger
    // fresh so scheduled → published/failed transitions surface without a manual reload.
    refetchInterval: query => (query.state.data?.chapters.some(chapter => chapter.status === 'scheduled') ? 5000 : false),
  });
}

/** First call creates the publication and goes live; later calls update metadata (the slug stays immutable). */
export function usePublishNovelMutation(projectId: string): UseMutationResult<Publication, ApiError, PublishNovelBody> {
  const invalidate = usePublishingInvalidation(projectId);
  return useMutation<Publication, ApiError, PublishNovelBody>({
    mutationFn: body => APIRequest.post(`/projects/${projectId}/publish`).body(body).execute(),
    onSuccess: invalidate,
  });
}

/** Publish now (no `scheduledAt`), schedule, or republish after edits — the backend treats them as one action. */
export function usePublishChapterMutation(projectId: string): UseMutationResult<ChapterPublication, ApiError, PublishChapterVariables> {
  const invalidate = usePublishingInvalidation(projectId);
  return useMutation<ChapterPublication, ApiError, PublishChapterVariables>({
    mutationFn: ({ chapter, scheduledAt }) =>
      APIRequest.post(`/projects/${projectId}/chapters/${chapter}/publish`)
        .body(scheduledAt ? { scheduledAt } : {})
        .execute(),
    onSuccess: invalidate,
  });
}

/** Unpublishes (stubs) a chapter on the reader; republishing later reuses the same ordinal. */
export function useUnpublishChapterMutation(projectId: string): UseMutationResult<ChapterPublication, ApiError, number> {
  const invalidate = usePublishingInvalidation(projectId);
  return useMutation<ChapterPublication, ApiError, number>({
    mutationFn: chapter => APIRequest.delete(`/projects/${projectId}/chapters/${chapter}/publish`).execute(),
    onSuccess: invalidate,
  });
}

/** Diffs the reader's manifest against the ledger and re-pushes mismatches; synchronous, returns the summary. */
export function useReconcileMutation(projectId: string): UseMutationResult<ReconcileResult, ApiError, undefined> {
  const invalidate = usePublishingInvalidation(projectId);
  return useMutation<ReconcileResult, ApiError, undefined>({
    mutationFn: () => APIRequest.post(`/projects/${projectId}/publications/reconcile`).body({}).execute(),
    onSuccess: invalidate,
  });
}
