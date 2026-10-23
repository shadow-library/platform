import { createFileRoute } from '@tanstack/react-router';

import { HELP_TABS, HelpScreen, type HelpSearch, type HelpTab } from '@/features/help';

/** Public and device-local. The active view is a search param so other screens can deep-link to the FAQ or legal document. */
function validateSearch(search: Record<string, unknown>): HelpSearch {
  const tab = HELP_TABS.includes(search.tab as HelpTab) ? (search.tab as HelpTab) : 'hub';
  return { tab };
}

export const Route = createFileRoute('/_shell/help')({
  validateSearch,
  component: HelpScreen,
});
