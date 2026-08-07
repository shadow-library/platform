import { createFileRoute } from '@tanstack/react-router';

import { DownloadsScreen } from '@/features/downloads';

/**
 * The offline library is deliberately public — downloads belong to the device, not the account.
 */
export const Route = createFileRoute('/_shell/downloads')({
  component: DownloadsScreen,
});
