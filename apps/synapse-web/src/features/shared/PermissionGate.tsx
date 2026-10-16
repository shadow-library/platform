import { useRouter } from '@tanstack/react-router';
import { type ReactElement, type ReactNode } from 'react';
import { AccessDenied } from '@shadow-library/ui';

export interface PermissionGateProps {
  allowed: boolean;
  area: string;
  /** Off on the overview itself, which the link would only reload. */
  homeLink?: boolean;
  children: ReactNode;
}

export function PermissionGate({ allowed, area, homeLink = true, children }: PermissionGateProps): ReactElement {
  const router = useRouter();
  if (allowed) return <>{children}</>;
  return (
    <AccessDenied
      title="You don’t have permission to view this"
      description={`Your role doesn’t cover ${area}. Ask a Synapse administrator to grant it.`}
      action={homeLink ? { label: 'Back to overview', onClick: () => void router.navigate({ to: '/' }) } : undefined}
    />
  );
}
