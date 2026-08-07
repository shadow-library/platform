import { createFileRoute } from '@tanstack/react-router';

import { GenresScreen } from '@/features/genres';

export const Route = createFileRoute('/_shell/genres')({
  component: GenresScreen,
});
