/**
 * Importing npm packages
 */
import { type ReactElement } from 'react';
import { Card, EmptyState } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { AuthShell } from '../components/auth-shell';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * Machine codes arrive via the `code` query parameter; everything unknown collapses to the
 * generic message — no internals, no stack traces (docs/standards.md).
 */
const MESSAGES: Record<string, { title: string; body: string }> = {
  FLOW_EXPIRED: { title: 'That session step expired', body: 'For your security this step timed out. Start again — it only takes a moment.' },
  FLOW_TERMINATED: { title: 'That sign-in attempt was closed', body: 'The attempt was cancelled or superseded. Start a fresh sign-in to continue.' },
  RATE_LIMITED: { title: 'Too many attempts', body: 'Requests from your connection were paused briefly. Wait a minute, then try again.' },
};

const FALLBACK = { title: 'Something went wrong', body: 'The request could not be completed. Try again, and contact support if it persists.' };

export function ErrorPage(): ReactElement {
  const code = new URLSearchParams(window.location.search).get('code') ?? '';
  const { title, body } = MESSAGES[code] ?? FALLBACK;

  return (
    <AuthShell>
      <Card.Body>
        <EmptyState title={title} description={body} action={{ label: 'Back to sign in', onClick: () => window.location.assign('/login') }} />
      </Card.Body>
    </AuthShell>
  );
}
