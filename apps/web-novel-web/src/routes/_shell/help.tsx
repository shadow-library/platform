import { createFileRoute } from '@tanstack/react-router';

import { HELP_TABS, HelpScreen, type HelpSearch, type HelpTab } from '@/features/help';

/**
 * Help is device-local and account-agnostic, so the screen is public. The active view is a search param
 * (`?tab=…`) so other screens (e.g. Settings) can deep-link straight to the FAQ or the legal document.
 */
function validateSearch(search: Record<string, unknown>): HelpSearch {
  const tab = HELP_TABS.includes(search.tab as HelpTab) ? (search.tab as HelpTab) : 'hub';
  return { tab };
}

export const Route = createFileRoute('/_shell/help')({
  validateSearch,
  component: HelpScreen,
});
