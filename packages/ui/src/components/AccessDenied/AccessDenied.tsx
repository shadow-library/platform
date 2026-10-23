import { forwardRef } from 'react';

import { cn } from '@/lib';

import { EmptyState } from '../EmptyState';
import styles from './AccessDenied.module.css';
import { type AccessDeniedProps } from './AccessDenied.types';

/**
 * Wall for an authenticated user who lacks access to the application. Presentational: copy points at an administrator rather than a retry,
 * and names the application when known; detecting the denial and routing the actions belong to the app.
 */
export const AccessDenied = forwardRef<HTMLDivElement, AccessDeniedProps>(function AccessDenied(
  { application, title, description, illustration, action, secondaryAction, error, requestId, footer, className, ...props },
  ref,
) {
  const heading = title ?? (application ? `You don’t have access to ${application}` : 'Access denied');
  const body =
    description ??
    (application
      ? `Your organization hasn’t given you access to ${application}. Contact your organization’s administrator to request it.`
      : 'You don’t have permission to use this application. Ask your organization’s administrator for access.');

  return (
    <div ref={ref} className={cn(styles.root, className)} {...props}>
      <EmptyState title={heading} description={body} illustration={illustration} action={action} secondaryAction={secondaryAction} />
      {error || requestId ? (
        <div className={styles.diagnostics}>
          {error ? <span>error: {error}</span> : null}
          {requestId ? <span>request_id: {requestId}</span> : null}
        </div>
      ) : null}
      {footer}
    </div>
  );
});
