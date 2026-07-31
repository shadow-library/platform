/**
 * Importing npm packages
 */
import { createFileRoute } from '@tanstack/react-router';

/**
 * Importing user defined packages
 */
import { SETTINGS_SECTION_IDS, SettingsScreen, type SettingsSearch, type SettingsSection } from '@/features/settings';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Settings are device-local and account-agnostic, so the screen is public. The active section is a search
 * param (`?section=…`) so other screens can deep-link straight to a pane (e.g. Notification preferences).
 */
function validateSearch(search: Record<string, unknown>): SettingsSearch {
  const section = SETTINGS_SECTION_IDS.includes(search.section as SettingsSection) ? (search.section as SettingsSection) : 'appearance';
  return { section };
}

export const Route = createFileRoute('/_shell/settings')({
  validateSearch,
  component: SettingsScreen,
});
