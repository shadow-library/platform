import { useRouter } from '@tanstack/react-router';
import { type ReactElement, type ReactNode } from 'react';
import { AccessDenied, EmptyState, Spinner } from '@shadow-library/ui';

import { useAccessCheck } from '@/lib';

import controls from './controls.module.css';

export interface PermissionGateProps {
  allowed: boolean;
  area: string;
  /** Off on the overview itself, which the link would only reload. */
  homeLink?: boolean;
  children: ReactNode;
}

export function PermissionGate({ allowed, area, homeLink = true, children }: PermissionGateProps): ReactElement {
  const router = useRouter();
  const access = useAccessCheck();
  if (allowed) return <>{children}</>;
  if (access.status === 'pending')
    return (
      <div className={controls.loading}>
        <Spinner aria-label="Checking your permissions" />
      </div>
    );
  if (access.status === 'unavailable')
    return (
      <EmptyState
        title="Your permissions couldn’t be checked"
        description={`Synapse couldn’t confirm whether your role covers ${area}. Nothing was denied; retry the check.`}
        action={{ label: 'Retry', onClick: access.retry, loading: access.retrying }}
      />
    );
  return (
    <AccessDenied
      title="You don’t have permission to view this"
      description={`Your role doesn’t cover ${area}. Ask a Synapse administrator to grant it.`}
      action={homeLink ? { label: 'Back to overview', onClick: () => void router.navigate({ to: '/' }) } : undefined}
    />
  );
}
