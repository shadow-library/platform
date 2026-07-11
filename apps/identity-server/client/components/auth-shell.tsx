/**
 * Importing npm packages
 */
import { Card } from '@shadow-library/ui';
import { type ReactElement, type ReactNode } from 'react';

/**
 * Importing user defined packages
 */

/**
 * Defining types
 */

interface AuthShellProps {
  children: ReactNode;
}

/**
 * Declaring the constants
 */

export function BrandMark(): ReactElement {
  return (
    <div className="flex items-center gap-16">
      <div className="identity-mark" aria-hidden="true" />
      <span className="identity-wordmark">
        Shadow <em>Identity</em>
      </span>
    </div>
  );
}

/** The auth chrome: eclipse atmosphere, brand rail, and the flow card. */
export function AuthShell({ children }: AuthShellProps): ReactElement {
  return (
    <>
      <div className="identity-atmosphere" aria-hidden="true" />
      <main className="auth-shell">
        <section className="auth-shell__brand">
          <BrandMark />
          <h1 className="auth-shell__tagline">One identity, every Shadow app.</h1>
          <p className="auth-shell__fineprint">
            Signing in here grants access across the shadow-apps.com ecosystem. Sessions are protected with passkeys, one-time codes, and continuous review.
          </p>
        </section>
        <section className="auth-shell__card">
          <Card>{children}</Card>
        </section>
      </main>
    </>
  );
}
