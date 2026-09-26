import { useMemo } from 'react';

import { type ApiError, useChapterRowsQuery, useListMilestonesQuery, useListVolumesQuery } from '@/lib/apis';
import { type UnlockLookup } from '@/lib/secret-states';

export interface UnlockLookupState {
  lookup: UnlockLookup;
  error: ApiError | null;
  retry: () => void;
}

const ROWS_PROBE = { limit: 1 };

export function useUnlockLookup(novelId: string): UnlockLookupState {
  const milestones = useListMilestonesQuery(novelId);
  const volumes = useListVolumesQuery(novelId);
  const rows = useChapterRowsQuery(novelId, ROWS_PROBE);
  const error = milestones.error ?? volumes.error ?? rows.error;
  const pending = milestones.isPending || volumes.isPending || rows.isPending;
  const status = error ? 'error' : pending ? 'loading' : 'ready';
  const lookup = useMemo<UnlockLookup>(
    () => ({
      milestones: new Map((milestones.data?.milestones ?? []).map(milestone => [milestone.milestoneKey, milestone])),
      volumes: new Map((volumes.data?.items ?? []).map(volume => [volume.volumeKey, volume])),
      nextChapter: rows.data?.nextWritableChapter,
      status,
    }),
    [milestones.data, volumes.data, rows.data, status],
  );
  const retry = (): void => {
    if (milestones.error) void milestones.refetch();
    if (volumes.error) void volumes.refetch();
    if (rows.error) void rows.refetch();
  };
  return { lookup, error, retry };
}
