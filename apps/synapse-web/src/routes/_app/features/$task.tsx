import { createFileRoute } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { prefetchActiveCatalog, splitTaskKey } from '@/features/catalog';
import { taskTitle } from '@/features/shared';
import { FeatureDetailScreen } from '@/features/tasks';
import { loadCapabilities } from '@/lib';

export const Route = createFileRoute('/_app/features/$task')({
  loader: async ({ context: { queryClient } }) => {
    const capabilities = await loadCapabilities(queryClient);
    if (capabilities.readCatalog) await prefetchActiveCatalog(queryClient);
  },
  head: ({ params }) => {
    const parts = splitTaskKey(params.task);
    return { meta: [{ title: `${parts ? taskTitle(parts) : 'Feature'} · Shadow Synapse` }] };
  },
  component: FeatureDetailRoute,
});

function FeatureDetailRoute(): ReactElement {
  const { task } = Route.useParams();
  return <FeatureDetailScreen taskKey={task} />;
}
