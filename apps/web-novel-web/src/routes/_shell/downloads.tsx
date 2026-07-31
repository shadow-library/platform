/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined packages
 */
import { DownloadsScreen } from '@/features/downloads';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The offline library is deliberately public — downloads belong to the device, not the account.
 */
export const Route = createFileRoute('/_shell/downloads')({
  component: DownloadsScreen,
});
