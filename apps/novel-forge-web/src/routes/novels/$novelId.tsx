/**
 * Importing npm packages
 */
import { Outlet, createFileRoute, notFound } from '@tanstack/react-router';

/**
 * Importing user defined modules
 */
import { AppShell } from '@/components/Layout';
import { ApiError, projectQueryOptions } from '@/lib/apis';
import { projectTitle } from '@/lib/format';

// A missing novel is a genuine 404: resolving it in the loader lets the router render the standard
// page-not-found chrome instead of booting the project workspace (sidebar, nav, lifecycle bar) around a
// project that doesn't exist and then surfacing "Project not found" inside it. Prefetching the project
// here also seeds the cache every workspace screen reuses, so they render on the server without a refetch.
export const Route = createFileRoute('/novels/$novelId')({
  loader: async ({ context, params }) => {
    try {
      return await context.queryClient.ensureQueryData(projectQueryOptions(params.novelId));
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) throw notFound();
      throw err;
    }
  },
  // Data-driven document title: the project's name (from the loader) shows in the browser tab across the
  // whole workspace; leaf screens inherit it.
  head: ({ loaderData }) => ({ meta: [{ title: loaderData ? `${projectTitle(loaderData)} · Novel Forge` : 'Novel Forge' }] }),
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
