/**
 * Importing npm packages
 */
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { Button, Spinner } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { AlertTriangleIcon, LockIcon } from '@/components/icons';
import { AuthCard, AuthMedallion, AuthScreen, StepHeader } from '@/features/auth';
import parts from '@/features/auth/auth-parts.module.css';
import { StepUpFields } from '@/features/portal';
import { stepUpIntentQueryOptions, useRootDomain, useStepUpIntentQuery, useStepUpMethodsQuery } from '@/lib/apis';
import { requireSession } from '@/lib/session';

/**
 * Defining types
 */
interface StepUpSearch {
  clientId?: string;
  resource?: string;
  returnTo?: string;
}

/**
 * Declaring the constants
 */

/**
 * The hosted step-up prompt (D-19, T-801). A first-party SDK redirects the browser here — same origin
 * as the issuer — when a protected route needs AAL2 and no elevation is left to claim. The SDK carries
 * the application it acts for as `client_id`/`resource`; those ride into the step-up so the window it
 * opens names its beneficiary and cannot be claimed by another application. Reached without them (the
 * console's own step-up), it opens a window no application can claim.
 */
export const Route = createFileRoute('/_auth/step-up')({
  /** The SDK sends OAuth-style snake_case params; the console may send none. */
  validateSearch: (search: Record<string, unknown>): StepUpSearch => ({
    clientId: typeof search.client_id === 'string' ? search.client_id : undefined,
    resource: typeof search.resource === 'string' ? search.resource : undefined,
    returnTo: typeof search.return_to === 'string' ? search.return_to : undefined,
  }),
  beforeLoad: ({ context, location }) => requireSession(context.queryClient, location.href),
  loaderDeps: ({ search }) => ({ clientId: search.clientId }),
  loader: ({ context, deps }) => {
    if (!deps.clientId) return;
    return context.queryClient.ensureQueryData(stepUpIntentQueryOptions(deps.clientId));
  },
  component: StepUpPage,
});

/**
 * The elevation is bound to the SDK's `client_id`; a browser folds backslashes into slashes, so the
 * candidate is normalised before the protocol-relative (`//host`) check. A relative same-origin path
 * is always safe; an absolute URL is allowed only for the issuer's own origin or a first-party app
 * under the ecosystem root domain — mirroring how the issuer scopes its redirects.
 */
function safeReturnTo(candidate: string | undefined, rootDomain: string): string | null {
  if (!candidate) return null;
  const normalised = candidate.replace(/\\/g, '/');
  if (normalised.startsWith('/') && !normalised.startsWith('//')) return normalised;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.origin === window.location.origin) return url.toString();
  if (url.hostname === rootDomain || url.hostname.endsWith(`.${rootDomain}`)) return url.toString();
  return null;
}

function StepUpPage(): React.JSX.Element {
  const { clientId, resource, returnTo } = Route.useSearch();
  const navigate = useNavigate();
  const rootDomain = useRootDomain();
  const appInitiated = Boolean(clientId);
  const intent = useStepUpIntentQuery(clientId ?? '', appInitiated);
  const methods = useStepUpMethodsQuery();

  const onElevated = (): void => {
    const target = safeReturnTo(returnTo, rootDomain);
    if (target) window.location.assign(target);
    else navigate({ to: '/account' });
  };

  const fields = <StepUpFields methods={methods.data?.methods} loading={methods.isLoading} intent={clientId ? { clientId, resource } : undefined} onElevated={onElevated} />;

  if (appInitiated && intent.isLoading)
    return (
      <AuthScreen>
        <AuthCard>
          <div className={parts.inviteHead} style={{ padding: '24px 0', gap: 16 }}>
            <Spinner size="lg" />
            <div style={{ fontSize: 15, color: 'var(--sh-text-secondary)' }}>Verifying the request…</div>
          </div>
        </AuthCard>
      </AuthScreen>
    );

  // A tampered or unknown client id resolves to no name: fail neutrally, never confirming the id or offering the prompt.
  if (appInitiated && (intent.isError || !intent.data?.applicationName)) return <UnverifiedRequest />;

  const applicationName = intent.data?.applicationName;

  return (
    <AuthScreen>
      <AuthCard>
        <AuthMedallion intent="warning">
          <LockIcon size={26} />
        </AuthMedallion>
        {appInitiated && applicationName ? (
          <>
            <StepHeader title="Confirm it’s you" description="Confirm it’s you to grant this application elevated access." align="center" />
            <p className={parts.otpNote} style={{ textAlign: 'center' }}>
              Approving elevated access for <strong style={{ color: 'var(--sh-text-primary)' }}>{applicationName}</strong>
              {resource && (
                <>
                  {' → '}
                  <code style={{ fontFamily: 'var(--sh-font-mono)' }}>{resource}</code>
                </>
              )}
            </p>
          </>
        ) : (
          <StepHeader title="Confirm it’s you" description="This step-up secures a sensitive action in the identity console." align="center" />
        )}
        {fields}
      </AuthCard>
    </AuthScreen>
  );
}

function UnverifiedRequest(): React.JSX.Element {
  return (
    <AuthScreen>
      <AuthCard>
        <AuthMedallion intent="danger">
          <AlertTriangleIcon size={26} />
        </AuthMedallion>
        <StepHeader title="This request can’t be verified" description="We couldn’t confirm which application this elevation is for, so we didn’t continue." align="center" />
        <Button variant="secondary" fullWidth onClick={() => window.location.assign('/account')}>
          Back to your account
        </Button>
      </AuthCard>
    </AuthScreen>
  );
}
