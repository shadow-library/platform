/**
 * Importing npm packages
 */
import { useMutation, type UseMutationResult } from '@tanstack/react-query';

/**
 * Importing user defined packages
 */
import { type ImportNovelResponse, type NovelBundle } from './api-types.gen';
import { type ApiError, APIRequest } from './transport';

/**
 * Declaring the constants
 */

/**
 * Imports a hand-authored `novel-import` bundle (§ docs/novel-import-format.md in the server repo):
 * creates the project synchronously and enqueues chapter insertion + cover storage as a background
 * `import` job. Not project-scoped — the bundle's own `mode` decides whether the created project is a
 * `source` or a locked, publish-ready `final` novel, so there is no existing project to invalidate.
 */
export function useImportNovelMutation(): UseMutationResult<ImportNovelResponse, ApiError, NovelBundle> {
  return useMutation<ImportNovelResponse, ApiError, NovelBundle>({
    mutationFn: bundle => APIRequest.post('/import').body({ bundle }).execute(),
  });
}
