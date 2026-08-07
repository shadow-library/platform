import { createFileRoute } from '@tanstack/react-router';

import { SendForm } from '@/features/send';

export const Route = createFileRoute('/_app/send/')({
  component: SendForm,
});
