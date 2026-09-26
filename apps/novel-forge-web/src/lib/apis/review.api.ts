import { useMutation, type UseMutationResult, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';

import {
  type ChapterReviewJobResponse,
  type ChapterReviewRecordResponse,
  type ListChapterReviewsResponse,
  type ReviewRemedyBody,
  type RunChapterReviewBody,
} from './api-types.gen';
import { invalidateJobs } from './insight.api';
import { ApiError, APIRequest } from './transport';

// Under drafts, so every draft write (a save, an approval) refetches the reviews and their staleness with it.
const reviewKeys = {
  list: (projectId: string, n: number) => ['projects', projectId, 'drafts', n, 'reviews'] as const,
};

export type StartedReview = ChapterReviewRecordResponse | ChapterReviewJobResponse;

export interface RemedyTarget {
  reviewId: string;
  findingId: string;
}

export interface RemedyInput extends RemedyTarget {
  body: ReviewRemedyBody;
}

/** Judge and editorial reviews answer 202 with a job; mechanics and readability answer 201 with the stored review. */
export function isQueuedReview(started: StartedReview): started is ChapterReviewJobResponse {
  return 'jobId' in started;
}

export function remedyPath(projectId: string, chapter: number, target: RemedyTarget): string {
  return `/projects/${projectId}/chapters/${chapter}/reviews/${target.reviewId}/findings/${target.findingId}/remedy`;
}

export function remedyBody(action: ReviewRemedyBody['action'], reason?: string): ReviewRemedyBody {
  const trimmed = reason?.trim();
  return trimmed ? { action, reason: trimmed } : { action };
}

export function useChapterReviewsQuery(projectId: string, chapter: number, enabled = true): UseQueryResult<ListChapterReviewsResponse, ApiError> {
  return useQuery<ListChapterReviewsResponse, ApiError>({
    queryKey: reviewKeys.list(projectId, chapter),
    queryFn: () => APIRequest.get(`/projects/${projectId}/chapters/${chapter}/reviews`).execute(),
    enabled: enabled && Boolean(projectId),
  });
}

/** A judge review or an answer to one can hold or release the chapter, so the draft and the review queue refetch with the reviews. */
export function invalidateChapterReviews(queryClient: ReturnType<typeof useQueryClient>, projectId: string): void {
  queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'drafts'] });
  queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'review-queue'] });
}

export function useRunReviewMutation(projectId: string, chapter: number): UseMutationResult<StartedReview, ApiError, RunChapterReviewBody> {
  const queryClient = useQueryClient();
  return useMutation<StartedReview, ApiError, RunChapterReviewBody>({
    mutationFn: body => APIRequest.post(`/projects/${projectId}/chapters/${chapter}/reviews`).body(body).execute(),
    onSuccess: started => {
      if (isQueuedReview(started)) return invalidateJobs(queryClient, projectId);
      invalidateChapterReviews(queryClient, projectId);
    },
  });
}

export function useRemedyMutation(projectId: string, chapter: number): UseMutationResult<ChapterReviewRecordResponse, ApiError, RemedyInput> {
  const queryClient = useQueryClient();
  return useMutation<ChapterReviewRecordResponse, ApiError, RemedyInput>({
    mutationFn: input =>
      APIRequest.post(remedyPath(projectId, chapter, input))
        .body(input.body)
        .execute(),
    onSettled: () => invalidateChapterReviews(queryClient, projectId),
  });
}

export function useClearRemedyMutation(projectId: string, chapter: number): UseMutationResult<ChapterReviewRecordResponse, ApiError, RemedyTarget> {
  const queryClient = useQueryClient();
  return useMutation<ChapterReviewRecordResponse, ApiError, RemedyTarget>({
    mutationFn: target => APIRequest.delete(remedyPath(projectId, chapter, target)).execute(),
    onSettled: () => invalidateChapterReviews(queryClient, projectId),
  });
}
