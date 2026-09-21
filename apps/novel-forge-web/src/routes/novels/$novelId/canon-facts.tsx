import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/novels/$novelId/canon-facts')({
  validateSearch: (search: Record<string, unknown>): { fact?: string } => ({
    fact: typeof search.fact === 'string' && search.fact ? search.fact : undefined,
  }),
  beforeLoad: ({ params, search }) => {
    throw redirect({ to: '/novels/$novelId/story-bible', params, search: { view: 'secrets', fact: search.fact }, replace: true });
  },
});
