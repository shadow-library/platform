import { type QueryClient, queryOptions, useMutation, type UseMutationResult, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';

import {
  type AliasImpactResponse,
  type CatalogInvalidResponse,
  type CatalogVersionDetailResponse,
  type CatalogVersionListResponse,
  type CatalogVersionSummaryResponse,
  type DraftDiffResponse,
  type DraftResponse,
  type SaveDraftBody,
  type SaveDraftResponse,
  type ValidateDraftResponse,
} from './api-types.gen';
import { budgetKeys } from './budgets.api';
import { catalogWriteOutcome, type CatalogWriteOutcome, isCatalogConflict, UNPROCESSABLE } from './catalog-outcome';
import { credentialKeys } from './credentials.api';
import { providerKeys } from './providers.api';
import { nullWhenEmpty } from './empty-response';
import { type ApiError, APIRequest } from './transport';

export const catalogKeys = {
  all: ['catalog'],
  versions: () => [...catalogKeys.all, 'versions'],
  version: (version: number) => [...catalogKeys.versions(), version],
  draft: () => [...catalogKeys.all, 'draft'],
  diff: () => [...catalogKeys.draft(), 'diff'],
  validation: (fingerprint: string) => [...catalogKeys.draft(), 'validation', fingerprint],
  impact: (alias: string, model?: string) => [...catalogKeys.all, 'aliases', alias, 'impact', model ?? null],
} as const;

export const versionsQueryOptions = (): UseQueryOptions<CatalogVersionListResponse, ApiError> =>
  queryOptions<CatalogVersionListResponse, ApiError>({
    queryKey: catalogKeys.versions(),
    queryFn: ({ signal }) => APIRequest.get('/admin/catalog/versions').signal(signal).execute(),
  });

export const versionQueryOptions = (version: number): UseQueryOptions<CatalogVersionDetailResponse, ApiError> =>
  queryOptions<CatalogVersionDetailResponse, ApiError>({
    queryKey: catalogKeys.version(version),
    queryFn: ({ signal }) => APIRequest.get(`/admin/catalog/versions/${version}`).signal(signal).execute(),
    staleTime: Infinity,
  });

/** No draft is a state, not a failure: the draft disappears every time it is published, and the server answers 204. */
export const draftQueryOptions = (): UseQueryOptions<DraftResponse | null, ApiError> =>
  queryOptions<DraftResponse | null, ApiError>({
    queryKey: catalogKeys.draft(),
    queryFn: ({ signal }) => APIRequest.get('/admin/catalog/draft').signal(signal).execute<DraftResponse | undefined>().then(nullWhenEmpty),
  });

export const diffQueryOptions = (): UseQueryOptions<DraftDiffResponse | null, ApiError> =>
  queryOptions<DraftDiffResponse | null, ApiError>({
    queryKey: catalogKeys.diff(),
    queryFn: ({ signal }) => APIRequest.get('/admin/catalog/draft/diff').signal(signal).execute<DraftDiffResponse | undefined>().then(nullWhenEmpty),
    staleTime: 0,
  });

export const aliasImpactQueryOptions = (alias: string, model?: string): UseQueryOptions<AliasImpactResponse, ApiError> =>
  queryOptions<AliasImpactResponse, ApiError>({
    queryKey: catalogKeys.impact(alias, model),
    queryFn: ({ signal }) =>
      APIRequest.get(`/admin/catalog/aliases/${encodeURIComponent(alias)}/impact`)
        .query(model ? { model } : {})
        .signal(signal)
        .execute(),
  });

export async function saveDraft(body: SaveDraftBody): Promise<CatalogWriteOutcome<SaveDraftResponse>> {
  return catalogWriteOutcome(await APIRequest.put('/admin/catalog/draft').body(body).modeled(UNPROCESSABLE).execute<SaveDraftResponse | CatalogInvalidResponse>());
}

export function cacheSavedDraft(queryClient: QueryClient, saved: SaveDraftResponse): void {
  const draft: DraftResponse = { draft: saved.draft, fingerprint: saved.fingerprint };
  queryClient.setQueryData(draftQueryOptions().queryKey, draft);
}

export function useSaveDraftMutation(): UseMutationResult<CatalogWriteOutcome<SaveDraftResponse>, ApiError, SaveDraftBody> {
  const queryClient = useQueryClient();
  return useMutation<CatalogWriteOutcome<SaveDraftResponse>, ApiError, SaveDraftBody>({
    mutationFn: saveDraft,
    onSuccess: outcome => {
      if (outcome.kind !== 'done') return;
      cacheSavedDraft(queryClient, outcome.value);
      return queryClient.invalidateQueries({ queryKey: catalogKeys.diff() });
    },
    onError: async error => {
      if (isCatalogConflict(error)) await queryClient.invalidateQueries({ queryKey: catalogKeys.draft() });
    },
  });
}

const validateDraft = (): Promise<ValidateDraftResponse | null> =>
  APIRequest.post('/admin/catalog/draft/validate').execute<ValidateDraftResponse | undefined>().then(nullWhenEmpty);

/** Validates whatever draft the server holds, so the result is keyed by the fingerprint the caller saw and re-run when it changes. */
export const draftValidationQueryOptions = (fingerprint: string): UseQueryOptions<ValidateDraftResponse | null, ApiError> =>
  queryOptions<ValidateDraftResponse | null, ApiError>({
    queryKey: catalogKeys.validation(fingerprint),
    queryFn: validateDraft,
    staleTime: 0,
  });

export function useValidateDraftMutation(): UseMutationResult<ValidateDraftResponse | null, ApiError, undefined> {
  return useMutation<ValidateDraftResponse | null, ApiError, undefined>({ mutationFn: validateDraft });
}

type VersionOutcome = CatalogWriteOutcome<CatalogVersionSummaryResponse>;

function useCatalogWrite<TVariables>(
  write: (variables: TVariables) => Promise<CatalogVersionSummaryResponse | CatalogInvalidResponse>,
): UseMutationResult<VersionOutcome, ApiError, TVariables> {
  const queryClient = useQueryClient();
  return useMutation<VersionOutcome, ApiError, TVariables>({
    mutationFn: async variables => catalogWriteOutcome(await write(variables)),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: catalogKeys.all }),
        queryClient.invalidateQueries({ queryKey: providerKeys.all }),
        queryClient.invalidateQueries({ queryKey: credentialKeys.all }),
        queryClient.invalidateQueries({ queryKey: budgetKeys.all }),
      ]),
  });
}

export function usePublishDraftMutation(): UseMutationResult<VersionOutcome, ApiError, string> {
  return useCatalogWrite<string>(fingerprint => APIRequest.post('/admin/catalog/draft/publish').body({ fingerprint }).modeled(UNPROCESSABLE).execute());
}

export const discardDraft = (fingerprint: string): Promise<undefined> => APIRequest.delete('/admin/catalog/draft').query({ fingerprint }).execute();

export function useDiscardDraftMutation(): UseMutationResult<undefined, ApiError, string> {
  const queryClient = useQueryClient();
  return useMutation<undefined, ApiError, string>({ mutationFn: discardDraft, onSettled: () => queryClient.invalidateQueries({ queryKey: catalogKeys.all }) });
}

export function useRollbackMutation(): UseMutationResult<VersionOutcome, ApiError, number> {
  return useCatalogWrite<number>(version => APIRequest.post(`/admin/catalog/versions/${version}/rollback`).modeled(UNPROCESSABLE).execute());
}
