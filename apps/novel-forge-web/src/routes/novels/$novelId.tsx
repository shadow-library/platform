import { createFileRoute, notFound, Outlet } from '@tanstack/react-router';

import { AppShell } from '@/components/Layout';
import { isApiError, meQuery, projectQueryOptions, useProjectEventStream } from '@/lib/apis';
import { projectTitle } from '@/lib/format';
import { requireSession } from '@/lib/session';

// A missing novel 404s in the loader, so the router renders page-not-found chrome instead of a workspace around nothing; the prefetch also seeds the cache screens reuse.
export const Route = createFileRoute('/novels/$novelId')({
  beforeLoad: ({ context, location }) => requireSession(context.queryClient, location.href),
  loader: async ({ context, params }) => {
    const me = context.queryClient.ensureQueryData(meQuery).catch(() => undefined);
    try {
      const project = await context.queryClient.ensureQueryData(projectQueryOptions(params.novelId));
      await me;
      return project;
    } catch (err) {
      if (isApiError(err) && err.status === 404) throw notFound();
      throw err;
    }
  },
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${projectTitle(loaderData)} · Novel Forge` : 'Novel Forge' }] }),
  component: NovelWorkspace,
});

function NovelWorkspace(): React.JSX.Element {
  const { novelId } = Route.useParams();
  useProjectEventStream(novelId);

  return (
    <AppShell>
      <Outlet />
    </AppShell>
  );
}
