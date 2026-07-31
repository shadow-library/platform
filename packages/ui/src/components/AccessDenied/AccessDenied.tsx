/**
 * Importing npm packages
 */
import { forwardRef } from 'react';

/**
 * Importing user defined packages
 */
import { cn } from '@/lib';

import { EmptyState } from '../EmptyState';
import styles from './AccessDenied.module.css';
import { type AccessDeniedProps } from './AccessDenied.types';

/**
 * The wall a user meets when they are authenticated but the application is not theirs to enter.
 *
 * Distinct from a 404 and from a sign-in prompt: the user is known, the page exists, and signing in
 * again will not help — someone has to grant them access. The copy therefore points at an
 * administrator rather than offering a retry, and names the application whenever the caller knows it,
 * because "ask for access to Pulse" is actionable in a way that "access denied" is not.
 *
 * Presentational only. Detecting the denial and deciding where the actions lead belong to the
 * application; this renders the outcome.
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
