/**
 * Importing npm packages
 */
import { EmptyState } from '@shadow-library/ui';
import { Outlet, createFileRoute, notFound, useNavigate } from '@tanstack/react-router';

/**
 * Importing user defined modules
 */
import { APIRequest, ApiError } from '@/lib/apis';
import { AppShell } from '@/components/Layout';

import styles from './$novelId.module.css';

// A missing novel is a genuine 404: resolving it in the loader lets us render the standard
// page-not-found chrome instead of booting the project workspace (sidebar, nav, lifecycle bar)
// around a project that doesn't exist and then surfacing "Project not found" inside it.
function NovelNotFound(): React.JSX.Element {
  const navigate = useNavigate();
  return (
    <div className={styles.notFound}>
      <EmptyState
        size="page"
        title="Page not found"
        description="This novel doesn’t exist, or it may have been deleted. Head back to your projects."
        action={{ label: 'Go to projects', onClick: () => navigate({ to: '/' }) }}
      />
    </div>
  );
}

export const Route = createFileRoute('/novels/$novelId')({
  loader: async ({ context, params }) => {
    try {
      // Mirrors `projectKeys.detail(novelId)` so the workspace screens reuse this fetch rather than re-request.
      await context.queryClient.ensureQueryData({
        queryKey: ['projects', params.novelId],
        queryFn: () => APIRequest.get(`/projects/${params.novelId}`).execute(),
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) throw notFound();
      throw err;
    }
  },
  notFoundComponent: NovelNotFound,
  component: () => (
    <AppShell>
      <Outlet />
    </AppShell>
  ),
});
