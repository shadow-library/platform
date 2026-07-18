/**
 * Importing npm packages
 */
import { useMutation, useQuery } from '@tanstack/react-query';
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef } from 'react';
import { Avatar, Button, Spinner } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { AlertTriangleIcon, BadgeCheckIcon, BuildingIcon, MailIcon, RefreshIcon, UserIcon } from '@/components/icons';
import { AuthCard, AuthMedallion, AuthScreen, StepHeader } from '@/features/auth';
import parts from '@/features/auth/auth-parts.module.css';
import { authApi, consentPromptQueryOptions, type ConsentScope, useMeQuery, useSignoutMutation } from '@/lib/apis';
import { displayName } from '@/lib/format';

/**
 * Declaring the constants
 */
interface ConsentSearch {
  clientId?: string;
  scope?: string;
  redirectUri?: string;
  state?: string;
}

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

  const prompt = useQuery(consentPromptQueryOptions(clientId ?? '', scope ?? ''));

  const decide = useMutation({
    mutationFn: (decision: 'APPROVE' | 'DENY') =>
      authApi.consentDecide({ clientId: clientId ?? '', scopeNames: prompt.data?.scopes.map(item => item.name) ?? [], decision, redirectUri, state }),
    onSuccess: result => {
      if (result.redirectTo) window.location.assign(result.redirectTo);
      else navigate({ to: '/account' });
    },
  });

  // First-party apps (and already-granted scopes) skip the prompt: approve silently and hand back.
  const data = prompt.data;
  useEffect(() => {
    if (data && (data.isFirstParty || data.alreadyGranted) && !autoApproved.current) {
      autoApproved.current = true;
      decide.mutate('APPROVE');
    }
  }, [data, decide]);

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
          <Button variant="primary" fullWidth loading={decide.isPending && decide.variables === 'APPROVE'} onClick={() => decide.mutate('APPROVE')}>
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
