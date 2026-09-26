import { createFileRoute, redirect } from '@tanstack/react-router';

import { projectHomeRoute } from '@/components/Layout';
import { projectQueryOptions } from '@/lib/apis';

// A missing project resolves to a 404 in the parent's loader, so a failed read here only skips the redirect.
export const Route = createFileRoute('/novels/$novelId/')({
  loader: async ({ context, params }) => {
    const project = await context.queryClient.ensureQueryData(projectQueryOptions(params.novelId)).catch(() => undefined);
    if (project) throw redirect({ to: projectHomeRoute(project.kind), params, replace: true });
  },
});
