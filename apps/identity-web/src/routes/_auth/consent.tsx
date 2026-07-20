/**
 * Importing npm packages
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { Avatar, Button, Spinner } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { AlertTriangleIcon, BadgeCheckIcon, BuildingIcon, LockIcon, MailIcon, RefreshIcon, UserIcon, XCircleIcon } from '@/components/icons';
import { AuthCard, AuthMedallion, AuthScreen, StepHeader } from '@/features/auth';
import parts from '@/features/auth/auth-parts.module.css';
import { StepUpFields } from '@/features/portal';
import { authApi, consentPromptQueryOptions, type ConsentScope, useMeQuery, useSignoutMutation, useStepUpMethodsQuery } from '@/lib/apis';
import { displayName } from '@/lib/format';

/**
 * Defining types
 */
interface ConsentSearch {
  clientId?: string;
  scope?: string;
  redirectUri?: string;
  state?: string;
}

/**
 * The interactive step of the consent card once the prompt has loaded. Loading/invalid/first-party are
 * derived from the query, so only the states the user drives live here — never as parallel booleans.
 */
type ConsentPhase = { step: 'review' } | { step: 'stepup' } | { step: 'denied'; redirectTo?: string };

/**
 * Declaring the constants
 */

/** How long the denied confirmation lingers before handing control back — long enough to read, short enough not to stall. */
const DENIED_REDIRECT_DELAY_MS = 1400;

export const Route = createFileRoute('/_auth/consent')({
  validateSearch: (search: Record<string, unknown>): ConsentSearch => ({
    clientId: typeof search.clientId === 'string' ? search.clientId : undefined,
    scope: typeof search.scope === 'string' ? search.scope : undefined,
    redirectUri: typeof search.redirectUri === 'string' ? search.redirectUri : undefined,
    state: typeof search.state === 'string' ? search.state : undefined,
  }),
  loaderDeps: ({ search }) => ({ clientId: search.clientId, scope: search.scope }),
  loader: ({ context, deps }) => {
    if (!deps.clientId || !deps.scope) return;
    return context.queryClient.ensureQueryData(consentPromptQueryOptions(deps.clientId, deps.scope));
  },
  component: ConsentPage,
});

function scopeIcon(name: string): React.JSX.Element {
  if (name.includes('email')) return <MailIcon size={16} />;
  if (name.includes('profile') || name === 'openid') return <UserIcon size={16} />;
  if (name.includes('org')) return <BuildingIcon size={16} />;
  if (name.includes('offline')) return <RefreshIcon size={16} />;
  return <BadgeCheckIcon size={16} />;
}

function ConsentPage(): React.JSX.Element {
  const { clientId, scope, redirectUri, state } = Route.useSearch();
  const navigate = useNavigate();
  const me = useMeQuery();
  const signout = useSignoutMutation();
  const autoApproved = useRef(false);
  const [phase, setPhase] = useState<ConsentPhase>({ step: 'review' });
  const stepUpMethods = useStepUpMethodsQuery(phase.step === 'stepup');

  const prompt = useQuery(consentPromptQueryOptions(clientId ?? '', scope ?? ''));

  const decide = useMutation({
    mutationFn: (decision: 'APPROVE' | 'DENY') =>
      authApi.consentDecide({ clientId: clientId ?? '', scopeNames: prompt.data?.scopes.map(item => item.name) ?? [], decision, redirectUri, state }),
    onSuccess: result => {
      // Denials pause on a confirmation screen; the effect below fires the validated access_denied redirect.
      if (result.decision === 'DENY') return setPhase({ step: 'denied', redirectTo: result.redirectTo });
      if (result.redirectTo) window.location.assign(result.redirectTo);
      else navigate({ to: '/account' });
    },
  });

  const data = prompt.data;

  // First-party apps (and already-granted scopes) skip the prompt: approve silently and hand back.
  useEffect(() => {
    if (data && (data.isFirstParty || data.alreadyGranted) && !autoApproved.current) {
      autoApproved.current = true;
      decide.mutate('APPROVE');
    }
  }, [data, decide]);

  // Hand control back to the client (or home) once the denied confirmation has had its beat on screen.
  useEffect(() => {
    if (phase.step !== 'denied') return;
    const redirectTo = phase.redirectTo;
    const timer = window.setTimeout(() => {
      if (redirectTo) window.location.assign(redirectTo);
      else navigate({ to: '/account' });
    }, DENIED_REDIRECT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [phase, navigate]);

  if (!clientId || !scope) return <InvalidRequest />;

  if (prompt.isLoading)
    return (
      <AuthScreen>
        <AuthCard>
          <div className={parts.inviteHead} style={{ padding: '24px 0', gap: 16 }}>
            <Spinner size="lg" />
            <div style={{ fontSize: 15, color: 'var(--sh-text-secondary)' }}>Loading permissions…</div>
          </div>
        </AuthCard>
      </AuthScreen>
    );

  if (prompt.error) return <InvalidRequest />;
  if (!data) return <InvalidRequest />;

  if (data.isFirstParty || data.alreadyGranted)
    return (
      <AuthScreen>
        <AuthCard>
          <div className={parts.inviteHead} style={{ padding: '24px 0', gap: 16 }}>
            <Spinner size="lg" />
            <StepHeader title={`Connecting to ${data.clientName}…`} description="First-party app · consent not required" align="center" />
          </div>
        </AuthCard>
      </AuthScreen>
    );

  if (phase.step === 'denied')
    return (
      <AuthScreen>
        <AuthCard>
          <AuthMedallion intent="neutral">
            <XCircleIcon size={26} />
          </AuthMedallion>
          <StepHeader title="Access denied" description={`You chose not to share access. Returning you to ${data.clientName}.`} align="center" />
          <div className={parts.otpNote} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Spinner size="sm" />
            <span>
              Redirecting with <code style={{ fontFamily: 'var(--sh-font-mono)' }}>error=access_denied</code>
            </span>
          </div>
        </AuthCard>
      </AuthScreen>
    );

  // Sensitive scopes must be re-authenticated to AAL2 before the grant is recorded; an already-elevated session skips it.
  const requiresStepUp = data.scopes.some(item => item.isSensitive) && !me.data?.elevated;

  if (phase.step === 'stepup')
    return (
      <AuthScreen>
        <AuthCard>
          <AuthMedallion intent="warning">
            <LockIcon size={26} />
          </AuthMedallion>
          <StepHeader title="Confirm it’s you" description={`${data.clientName} requests sensitive access. Confirm it’s you to keep granting access.`} align="center" />
          <StepUpFields methods={stepUpMethods.data?.methods} loading={stepUpMethods.isLoading} onElevated={() => decide.mutate('APPROVE')} />
          <div className={parts.btnStack}>
            <Button variant="ghost" fullWidth disabled={decide.isPending} onClick={() => setPhase({ step: 'review' })}>
              Back
            </Button>
          </div>
        </AuthCard>
      </AuthScreen>
    );

  const onAllow = (): void => {
    if (requiresStepUp) return setPhase({ step: 'stepup' });
    decide.mutate('APPROVE');
  };

  return (
    <AuthScreen>
      <AuthCard>
        <div className={parts.inviteHead}>
          <Avatar name={data.clientName} shape="square" size="xl" />
          <StepHeader
            title={
              <>
                <span style={{ color: 'var(--sh-accent)' }}>{data.clientName}</span> wants access to your Shadow account
              </>
            }
            align="center"
          />
        </div>

        {me.data && (
          <div className={parts.userChip}>
            <span className={parts.userChipMain}>
              <Avatar name={displayName(me.data)} size="sm" />
              <span style={{ minWidth: 0 }}>
                <span className={parts.userChipName}>{displayName(me.data)}</span>
                <span className={parts.userChipEmail} style={{ display: 'block' }}>
                  {me.data.email}
                </span>
              </span>
            </span>
            <button
              className={parts.footLink}
              style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 12 }}
              onClick={() => signout.mutate(undefined, { onSuccess: () => navigate({ to: '/login' }) })}
            >
              Not you?
            </button>
          </div>
        )}

        <div className={parts.scopeList}>
          <div className={parts.scopeLead}>This will allow {data.clientName} to:</div>
          {data.scopes.map((item: ConsentScope) => (
            <div key={item.name} className={parts.scopeRow}>
              <span className={parts.scopeIconWrap}>{scopeIcon(item.name)}</span>
              <span style={{ minWidth: 0 }}>
                <span className={parts.scopeName}>
                  {item.description ?? item.name}
                  {item.isSensitive && (
                    <span className="si-chip" data-intent="warning" style={{ padding: '1px 6px', fontSize: 10 }}>
                      Sensitive
                    </span>
                  )}
                </span>
                <span className={parts.scopeDesc}>{item.name}</span>
              </span>
            </div>
          ))}
        </div>

        <div className={parts.btnStack}>
          <Button variant="primary" fullWidth loading={decide.isPending && decide.variables === 'APPROVE'} onClick={onAllow}>
            Allow access
          </Button>
          <Button variant="secondary" fullWidth loading={decide.isPending && decide.variables === 'DENY'} onClick={() => decide.mutate('DENY')}>
            Deny
          </Button>
        </div>
        <p className={parts.otpNote}>You can revoke access anytime in Account → Connected apps.</p>
      </AuthCard>
    </AuthScreen>
  );
}

function InvalidRequest(): React.JSX.Element {
  return (
    <AuthScreen>
      <AuthCard>
        <AuthMedallion intent="danger">
          <AlertTriangleIcon size={26} />
        </AuthMedallion>
        <StepHeader title="This request can’t be completed" description="The app sent an invalid authorization request. For your safety we didn’t continue." align="center" />
        <div className={parts.codeBlock}>error: invalid_request</div>
        <Button variant="secondary" fullWidth asChild>
          <Link to="/login">Back to sign in</Link>
        </Button>
      </AuthCard>
    </AuthScreen>
  );
}
