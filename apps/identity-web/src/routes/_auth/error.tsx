/**
 * Importing npm packages
 */
import { createFileRoute, Link } from '@tanstack/react-router';
import { type ReactNode } from 'react';
import { Button } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { AlertTriangleIcon, BanIcon, ClockIcon, InfoIcon } from '@/components/icons';
import { AuthCard, AuthMedallion, AuthScreen, StepHeader } from '@/features/auth';
import parts from '@/features/auth/auth-parts.module.css';

/**
 * Declaring the constants
 */
interface ErrorSearch {
  error?: string;
  error_description?: string;
  request_id?: string;
}

interface Variant {
  intent: 'danger' | 'warning' | 'neutral';
  icon: ReactNode;
  title: string;
  message: string;
}

const VARIANTS = {
  access_denied: {
    intent: 'neutral',
    icon: <BanIcon size={27} />,
    title: 'Access denied',
    message: 'You don’t have permission to sign in to this application. Ask your organization’s administrator for access.',
  },
  server_error: {
    intent: 'danger',
    icon: <InfoIcon size={28} />,
    title: 'Something went wrong',
    message: 'We couldn’t complete the sign-in request. This is on our side, not yours.',
  },
  temporarily_unavailable: {
    intent: 'warning',
    icon: <ClockIcon size={28} />,
    title: 'Too many attempts',
    message: 'You’ve tried too many times. Please wait a few minutes before trying again.',
  },
  flow_expired: {
    intent: 'warning',
    icon: <ClockIcon size={28} />,
    title: 'Your session expired',
    message: 'For your security, this sign-in flow timed out. Start again to continue.',
  },
  invalid_request: {
    intent: 'danger',
    icon: <AlertTriangleIcon size={28} />,
    title: 'This request can’t be completed',
    message: 'The app sent an invalid request. For your safety we didn’t continue.',
  },
} satisfies Record<string, Variant>;

export const Route = createFileRoute('/_auth/error')({
  validateSearch: (search: Record<string, unknown>): ErrorSearch => ({
    error: typeof search.error === 'string' ? search.error : undefined,
    error_description: typeof search.error_description === 'string' ? search.error_description : undefined,
    request_id: typeof search.request_id === 'string' ? search.request_id : undefined,
  }),
  component: ErrorPage,
});

function ErrorPage(): React.JSX.Element {
  const search = Route.useSearch();
  const code = search.error ?? 'server_error';
  const variant = code in VARIANTS ? VARIANTS[code as keyof typeof VARIANTS] : VARIANTS.server_error;

  return (
    <AuthScreen
      footer={
        <span>
          Need help? <a href="mailto:support@shadow-apps.com">Contact support</a>
        </span>
      }
    >
      <AuthCard>
        <AuthMedallion intent={variant.intent}>{variant.icon}</AuthMedallion>
        <StepHeader title={variant.title} description={search.error_description ?? variant.message} align="center" />
        {(search.error || search.request_id) && (
          <div className={parts.codeBlock}>
            error: {code}
            {search.request_id && (
              <>
                <br />
                request_id: {search.request_id}
              </>
            )}
          </div>
        )}
        <Button variant="secondary" fullWidth asChild>
          <Link to="/login">Back to sign in</Link>
        </Button>
      </AuthCard>
    </AuthScreen>
  );
}
