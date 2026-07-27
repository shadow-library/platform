/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined packages
 */
import { ReaderScreen } from '@/features/reader';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The reader owns the full viewport (no app shell). Chapter data loads in-component so the offline
 * fallback (OfflineStore → downloaded copy) and the offline-blocked state can render instead of an error
 * boundary when there is no network.
 */
export const Route = createFileRoute('/read/$slug/$ordinal')({
  component: ReaderScreen,
});
