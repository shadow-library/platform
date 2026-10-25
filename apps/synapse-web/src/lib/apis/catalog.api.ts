import { type QueryClient, queryOptions, useMutation, type UseMutationResult, useQueryClient, type UseQueryOptions } from '@tanstack/react-query';

import {
  type AliasImpactResponse,
  type ApplyChangeBody,
  type CatalogInvalidResponse,
  type CatalogVersionDetailResponse,
  type CatalogVersionListResponse,
  type CatalogVersionSummaryResponse,
} from './api-types.gen';
import { budgetKeys } from './budgets.api';
import { catalogWriteOutcome, type CatalogWriteOutcome, UNPROCESSABLE } from './catalog-outcome';
import { credentialKeys } from './credentials.api';
import { providerKeys } from './providers.api';
import { type ApiError, APIRequest } from './transport';

export const catalogKeys = {
  all: ['catalog'],
  versions: () => [...catalogKeys.all, 'versions'],
  version: (version: number) => [...catalogKeys.versions(), version],
  impact: (alias: string, model?: string) => [...catalogKeys.all, 'aliases', alias, 'impact', model ?? null],
} as const;

export type VersionOutcome = CatalogWriteOutcome<CatalogVersionSummaryResponse>;

export interface RollbackInput {
  version: number;
  expectedVersion: number;
}

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

export const aliasImpactQueryOptions = (alias: string, model?: string): UseQueryOptions<AliasImpactResponse, ApiError> =>
  queryOptions<AliasImpactResponse, ApiError>({
    queryKey: catalogKeys.impact(alias, model),
    queryFn: ({ signal }) =>
      APIRequest.get(`/admin/catalog/aliases/${encodeURIComponent(alias)}/impact`)
        .query(model ? { model } : {})
        .signal(signal)
        .execute(),
  });

export async function applyCatalogChange(body: ApplyChangeBody): Promise<VersionOutcome> {
  return catalogWriteOutcome(await APIRequest.post('/admin/catalog/changes').body(body).modeled(UNPROCESSABLE).execute<CatalogVersionSummaryResponse | CatalogInvalidResponse>());
}

export async function rollbackCatalog({ version, expectedVersion }: RollbackInput): Promise<VersionOutcome> {
  return catalogWriteOutcome(
    await APIRequest.post(`/admin/catalog/versions/${version}/rollback`)
      .body({ expectedVersion })
      .modeled(UNPROCESSABLE)
      .execute<CatalogVersionSummaryResponse | CatalogInvalidResponse>(),
  );
}

export function invalidateCatalogReads(queryClient: QueryClient): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: catalogKeys.all }),
    queryClient.invalidateQueries({ queryKey: providerKeys.all }),
    queryClient.invalidateQueries({ queryKey: credentialKeys.all }),
    queryClient.invalidateQueries({ queryKey: budgetKeys.all }),
  ]);
}

export function useRollbackMutation(): UseMutationResult<VersionOutcome, ApiError, RollbackInput> {
  const queryClient = useQueryClient();
  return useMutation<VersionOutcome, ApiError, RollbackInput>({ mutationFn: rollbackCatalog, onSettled: () => invalidateCatalogReads(queryClient) });
}
