import { createFileRoute, redirect } from '@tanstack/react-router';

export const Route = createFileRoute('/_app/changes/')({
  beforeLoad: () => {
    throw redirect({ to: '/history' });
  },
});
