import { createFileRoute, redirect } from '@tanstack/react-router';

import { projectHomeRoute } from '@/components/Layout';
import { projectStatusQueryOptions } from '@/lib/apis';
import { blueprintStage } from '@/lib/format';

export const Route = createFileRoute('/novels/$novelId/')({
  loader: async ({ context, params }) => {
    // A status that cannot be fetched must not strand the author on a blank route: Overview is the safe home.
    const status = await context.queryClient.ensureQueryData(projectStatusQueryOptions(params.novelId)).catch(() => undefined);
    throw redirect({ to: projectHomeRoute(status?.kind ?? 'new_novel', blueprintStage(status)), params });
  },
});
