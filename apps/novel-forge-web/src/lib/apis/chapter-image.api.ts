/**
 * Importing npm packages
 */
import { type UseMutationResult, type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { APIRequest, ApiError } from './api-request';
import { type AddChapterImageBody } from './api-types.gen';

/**
 * Defining types
 */

// Scene illustrations attached to an authored chapter. Hand-authored until the generated OpenAPI
// types pick up the new endpoints on redeploy.
export interface ChapterImage {
  id: string;
  projectId: string;
  chapter: number;
  imagePath: string;
  caption?: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface ChapterImageList {
  items: ChapterImage[];
}

/**
 * Declaring the constants
 */

const chapterImageKeys = {
  all: (projectId: string) => ['projects', projectId, 'chapter-images'] as const,
  list: (projectId: string, n: number) => [...chapterImageKeys.all(projectId), n] as const,
};

export function useChapterImagesQuery(projectId: string, n: number | undefined, enabled = true): UseQueryResult<ChapterImageList, ApiError> {
  return useQuery<ChapterImageList, ApiError>({
    queryKey: chapterImageKeys.list(projectId, n ?? -1),
    queryFn: () => APIRequest.get(`/projects/${projectId}/chapters/${n}/images`).execute(),
    enabled: enabled && Boolean(projectId) && n !== undefined,
  });
}

export function useAddChapterImageMutation(projectId: string, n: number): UseMutationResult<ChapterImage, ApiError, AddChapterImageBody> {
  const queryClient = useQueryClient();
  return useMutation<ChapterImage, ApiError, AddChapterImageBody>({
    mutationFn: data => APIRequest.post(`/projects/${projectId}/chapters/${n}/images`).body(data).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chapterImageKeys.list(projectId, n) }),
  });
}

export function useDeleteChapterImageMutation(projectId: string, n: number): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({
    mutationFn: imageId => APIRequest.delete(`/projects/${projectId}/chapters/${n}/images/${imageId}`).execute(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chapterImageKeys.list(projectId, n) }),
  });
}
