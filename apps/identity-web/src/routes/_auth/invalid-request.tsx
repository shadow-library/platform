import { createFileRoute, Link } from '@tanstack/react-router';
import { Fragment, type ReactNode } from 'react';
import { Button } from '@shadow-library/ui';

import { AlertTriangleIcon, PlugIcon } from '@/components/icons';
import { AuthCard, AuthMedallion, AuthScreen, StepHeader } from '@/features/auth';
import parts from '@/features/auth/auth-parts.module.css';

import styles from './invalid-request.module.css';

interface InvalidRequestSearch {
  error?: string;
  /** The client that sent the authorization request; echoed so its developer can identify the integration. */
  client_id?: string;
  /** The rejected `redirect_uri`, verbatim. Rendered as inert text only — never as a link. */
  redirect_uri?: string;
  /** Display name of the application, when the client was recognised. */
  application?: string;
}

interface Variant {
  intent: 'danger' | 'warning';
  icon: ReactNode;
  title: (app: string) => string;
  message: (app: string) => string;
}

const MAX_URI_LENGTH = 200;

const VARIANTS = {
  invalid_redirect_uri: {
    intent: 'warning',
    icon: <AlertTriangleIcon size={28} />,
    title: () => 'This app isn’t set up correctly',
    message: app =>
      `${app} asked us to send you back to an address that isn’t registered with Shadow Identity, so we stopped before signing you in. Nothing is wrong with your account — the app’s developer needs to fix its configuration.`,
  },
  invalid_client: {
    intent: 'danger',
    icon: <PlugIcon size={28} />,
    title: () => 'We don’t recognise this app',
    message: () =>
      'This sign-in request came from an application Shadow Identity doesn’t know, or one that has been disabled. For your safety we didn’t continue. Nothing is wrong with your account.',
  },
} satisfies Record<string, Variant>;

export const Route = createFileRoute('/_auth/invalid-request')({
  validateSearch: (search: Record<string, unknown>): InvalidRequestSearch => ({
    error: typeof search.error === 'string' ? search.error : undefined,
    client_id: typeof search.client_id === 'string' ? search.client_id : undefined,
    redirect_uri: typeof search.redirect_uri === 'string' ? search.redirect_uri : undefined,
    application: typeof search.application === 'string' ? search.application : undefined,
  }),
  component: InvalidRequestPage,
});

function truncate(value: string): string {
  return value.length > MAX_URI_LENGTH ? `${value.slice(0, MAX_URI_LENGTH)}…` : value;
}

function InvalidRequestPage(): React.JSX.Element {
  const search = Route.useSearch();
  const code = search.error ?? 'invalid_redirect_uri';
  const variant: Variant = code in VARIANTS ? VARIANTS[code as keyof typeof VARIANTS] : VARIANTS.invalid_redirect_uri;
  const app = search.application ?? 'The app you came from';

  const details: [string, string][] = [['error', code]];
  if (search.client_id) details.push(['client_id', search.client_id]);
  if (search.redirect_uri) details.push(['redirect_uri', truncate(search.redirect_uri)]);

  return (
    <AuthScreen
      footer={
        <span>
          Building this app? <a href="mailto:support@shadow-apps.com">Contact support</a>
        </span>
      }
    >
      <AuthCard>
        <AuthMedallion intent={variant.intent}>{variant.icon}</AuthMedallion>
        <StepHeader title={variant.title(app)} description={variant.message(app)} align="center" />
        <div className={`${parts.codeBlock} ${styles.details}`}>
          {details.map(([key, value]) => (
            <Fragment key={key}>
              <span className={styles.detailKey}>{key}:</span>
              <span className={styles.detailValue}>{value}</span>
            </Fragment>
          ))}
        </div>
        <Button variant="secondary" fullWidth asChild>
          <Link to="/login">Back to sign in</Link>
        </Button>
      </AuthCard>
    </AuthScreen>
  );
}
