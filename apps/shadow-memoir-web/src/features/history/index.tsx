import { type ReactElement } from 'react';

import { ScreenPlaceholder } from '@/components/ScreenPlaceholder';

export function HistoryScreen(): ReactElement {
  return (
    <ScreenPlaceholder
      title="History"
      summary="One reverse-chronological feed across every record type, filtered by type, quest outcome, sync status and date range, with read-only detail rows."
    />
  );
}
