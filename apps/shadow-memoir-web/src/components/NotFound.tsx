import { useRouter } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { EmptyState } from '@shadow-library/ui';

export default function NotFound(): ReactElement {
  const router = useRouter();
  return (
    <EmptyState title="Page not found" description="That page doesn't exist or has moved." action={{ label: 'Back to today', onClick: () => void router.navigate({ to: '/' }) }} />
  );
}
