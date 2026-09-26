import { createFileRoute, notFound, redirect } from '@tanstack/react-router';

import { isRetiredScreen, projectHomeRoute } from '@/components/Layout';
import { projectQueryOptions } from '@/lib/apis';

export const Route = createFileRoute('/novels/$novelId/$')({
  loader: async ({ context, params }) => {
    if (!isRetiredScreen(params._splat)) throw notFound();
    const project = await context.queryClient.ensureQueryData(projectQueryOptions(params.novelId)).catch(() => undefined);
    if (project) throw redirect({ to: projectHomeRoute(project.kind), params: { novelId: params.novelId }, replace: true });
  },
});
