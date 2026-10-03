import { createFileRoute } from '@tanstack/react-router';
import { buildIdResponse } from '@shadow-library/web';

import { BUILD_ID } from '@/lib/build-id';

export const Route = createFileRoute('/build-id')({
  server: { handlers: { GET: () => buildIdResponse(BUILD_ID) } },
});
