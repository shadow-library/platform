/**
 * Importing npm packages
 */
import { Alert, Button, FormField, Input, Spinner } from '@shadow-library/ui';
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';

/**
 * Importing user defined modules
 */
import { ExternalLinkIcon, KeyIcon } from '@/components/icons';
import { AuthCard, AuthMedallion, AuthScreen, IdentifierChip, MfaStep, OtpEntry, StepHeader, assertPasskey, useFlow } from '@/features/auth';
import parts from '@/features/auth/auth-parts.module.css';
import { type FlowState, authApi } from '@/lib/apis';
import { useDeviceId } from '@/lib/hooks';

/**
 * Declaring the constants
 */
interface LoginSearch {
  returnTo?: string;
  client?: string;
}

export const Route = createFileRoute('/_auth/login')({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    returnTo: typeof search.returnTo === 'string' ? search.returnTo : undefined,
    client: typeof search.client === 'string' ? search.client : undefined,
  }),
  component: LoginPage,
});

function LoginPage(): React.JSX.Element {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const deviceId = useDeviceId();
  const { flow, busy, error, dead, run, reset, setError } = useFlow();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [resendIn, setResendIn] = useState(0);
  const resendTimer = useRef<ReturnType<typeof setInterval>>(undefined);

  useEffect(() => () => clearInterval(resendTimer.current), []);

  const startResendCooldown = (): void => {
    setResendIn(60);
    clearInterval(resendTimer.current);
    resendTimer.current = setInterval(() => {
      setResendIn(seconds => {
        if (seconds <= 1) clearInterval(resendTimer.current);
        return Math.max(0, seconds - 1);
      });
    }, 1000);
  };

  const complete = (next: FlowState): void => {
    if (next.resumeUrl) return window.location.assign(next.resumeUrl);
    if (search.returnTo && search.returnTo.startsWith('/')) return window.location.assign(search.returnTo);
    navigate({ to: '/account' });
  };

  /** Runs a flow transition and follows through to the redirect once the flow completes. */
  const advance = async (action: () => Promise<FlowState>): Promise<void> => {
    const next = await run(action);
    if (next?.status === 'COMPLETED') complete(next);
  };

  const submitIdentifier = (): void => {
    if (!identifier.trim()) return setError('Enter your email or phone number.');
    setOtp('');
    void advance(() => authApi.loginInit(identifier.trim(), deviceId, search.returnTo));
  };

  const runPasskey = async (flowId?: string): Promise<void> => {
    setError(null);
    try {
      const challenge = await authApi.webauthnOptions(flowId, deviceId);
      const result = await assertPasskey(challenge.options);
      if (result.outcome === 'UNSUPPORTED') return setError('This device doesn’t support passkeys. Try another method.');
      if (result.outcome === 'CANCELLED') return;
      const resolvedFlowId = flowId ?? challenge.flowId;
      if (!resolvedFlowId) return setError('Couldn’t start passkey sign-in. Try another method.');
      await advance(() => authApi.challengeVerify(resolvedFlowId, { webauthn: result.response }));
    } catch {
      setError('Passkey sign-in failed. Try another method.');
    }
  };

  const changeMethod = (flowId: string, method: 'WEBAUTHN' | 'EMAIL_OTP' | 'SMS_OTP' | 'PASSWORD'): void => {
    setOtp('');
    if (method === 'EMAIL_OTP' || method === 'SMS_OTP') startResendCooldown();
    void run(() => authApi.challengeChange(flowId, method));
  };

  const resend = async (flowId: string, method: 'EMAIL_OTP' | 'SMS_OTP'): Promise<void> => {
    startResendCooldown();
    await authApi.challengeResend(flowId, method).catch(() => undefined);
  };

  const footer = (
    <span>
      New to Shadow? <Link to="/register">Create an account</Link>
    </span>
  );

  /* ---------- terminal + transient states ---------- */

  if (dead)
    return (
      <AuthScreen footer={footer}>
        <AuthCard>
          <StepHeader title="Your sign-in session expired" description="For your security we ended this attempt. Start again to continue." align="center" />
          <Button variant="primary" fullWidth onClick={reset}>
            Start over
          </Button>
        </AuthCard>
      </AuthScreen>
    );

  const status = flow?.status;

  if (status === 'COMPLETED')
    return (
      <AuthScreen footer={footer}>
        <AuthCard>
          <div className={parts.stepHeader} data-align="center" style={{ alignItems: 'center', gap: 16, padding: '20px 0' }}>
            <Spinner size="lg" />
            <StepHeader title="Signing you in…" description="Taking you to your destination." align="center" />
          </div>
        </AuthCard>
      </AuthScreen>
    );

  /* ---------- identifier ---------- */

  if (!flow)
    return (
      <AuthScreen footer={footer}>
        <AuthCard>
          {search.client && (
            <div className={parts.clientChip}>
              Continuing to <span className={parts.clientChipName}>{search.client}</span>
            </div>
          )}
          <StepHeader title="Sign in" description="Enter your email or phone number to continue." />
          {error && (
            <Alert intent="danger" title="We couldn’t continue">
              {error}
            </Alert>
          )}
          <FormField label="Email or phone">
            <Input
              type="text"
              placeholder="you@company.com"
              autoComplete="username"
              value={identifier}
              onValueChange={setIdentifier}
              onKeyDown={event => event.key === 'Enter' && submitIdentifier()}
              autoFocus
            />
          </FormField>
          <Button variant="primary" fullWidth loading={busy} onClick={submitIdentifier}>
            Continue
          </Button>
          <div className={parts.orDivider}>OR</div>
          <Button variant="secondary" fullWidth onClick={() => runPasskey()}>
            <span className={parts.btnIcon}>
              <KeyIcon size={17} />
              Sign in with a passkey
            </span>
          </Button>
          <p className={parts.otpNote}>For your security, we don’t say whether an account exists.</p>
        </AuthCard>
      </AuthScreen>
    );

  const maskedEmail = flow.metadata?.maskedEmail;
  const maskedPhone = flow.metadata?.maskedPhone;

  /* ---------- federated (enterprise SSO) ---------- */

  if (status === 'AWAITING_FEDERATED' || (flow.federated?.enforced && status === 'AWAITING_PASSWORD'))
    return (
      <AuthScreen footer={footer}>
        <AuthCard>
          <StepHeader title="Your organization uses single sign-on" description="You’ll continue to your identity provider to verify who you are." align="center" />
          <Button variant="primary" fullWidth onClick={() => flow.federated && window.location.assign(flow.federated.authorizationUrl)}>
            <span className={parts.btnIcon}>
              Continue to your provider
              <ExternalLinkIcon size={15} />
            </span>
          </Button>
          <Button variant="text" size="sm" onClick={reset}>
            Use a different account
          </Button>
        </AuthCard>
      </AuthScreen>
    );

  /* ---------- passkey factor ---------- */

  if (status === 'AWAITING_WEBAUTHN')
    return (
      <AuthScreen footer={footer}>
        <AuthCard>
          <AuthMedallion>
            <KeyIcon size={30} />
          </AuthMedallion>
          <StepHeader title="Use your passkey" description="Confirm it’s you with your device’s fingerprint, face, or screen lock." align="center" />
          {error && (
            <Alert intent="danger" title="Passkey failed">
              {error}
            </Alert>
          )}
          <Button variant="primary" fullWidth loading={busy} onClick={() => runPasskey(flow.flowId)}>
            Continue with passkey
          </Button>
          <Button variant="ghost" fullWidth onClick={() => changeMethod(flow.flowId, 'PASSWORD')}>
            Use password instead
          </Button>
        </AuthCard>
      </AuthScreen>
    );

  /* ---------- one-time code ---------- */

  if (status === 'AWAITING_EMAIL_OTP' || status === 'AWAITING_SMS_OTP') {
    const isEmail = status === 'AWAITING_EMAIL_OTP';
    return (
      <AuthScreen footer={footer}>
        <AuthCard>
          <OtpEntry
            title={isEmail ? 'Check your email' : 'Check your phone'}
            sentTo={isEmail ? maskedEmail : maskedPhone}
            value={otp}
            error={error}
            resendIn={resendIn}
            onValueChange={setOtp}
            onComplete={code => advance(() => authApi.challengeVerify(flow.flowId, { code }))}
            onResend={() => void resend(flow.flowId, isEmail ? 'EMAIL_OTP' : 'SMS_OTP')}
            onAlt={() => changeMethod(flow.flowId, 'PASSWORD')}
          />
        </AuthCard>
      </AuthScreen>
    );
  }

  /* ---------- second factor ---------- */

  if (status === 'AWAITING_TOTP')
    return (
      <AuthScreen
        footer={
          <Link className={parts.footLink} to="/login" onClick={reset}>
            Cancel and start over
          </Link>
        }
      >
        <MfaStep
          error={error}
          busy={busy}
          attemptsLeft={flow.attemptsLeft}
          canPasskey
          onTotp={code => advance(() => authApi.challengeVerify(flow.flowId, { code }))}
          onRecovery={code => advance(() => authApi.challengeVerify(flow.flowId, { recoveryCode: code }))}
          onPasskey={() => runPasskey(flow.flowId)}
          onCancel={reset}
        />
      </AuthScreen>
    );

  /* ---------- admin-forced reset ---------- */

  if (status === 'PASSWORD_RESET_REQUIRED')
    return (
      <AuthScreen footer={footer}>
        <AuthCard>
          <StepHeader title="Reset required" description="An administrator asked you to set a new password before signing in." align="center" />
          <Button variant="primary" fullWidth asChild>
            <Link to="/recover" search={{ identifier: identifier.trim() || undefined }}>
              Reset your password
            </Link>
          </Button>
        </AuthCard>
      </AuthScreen>
    );

  /* ---------- password (default first factor) ---------- */

  return (
    <AuthScreen footer={footer}>
      <AuthCard>
        <IdentifierChip label={identifier.trim() || 'your account'} onChange={reset} />
        <StepHeader title="Enter your password" description="Confirm your password to continue." />
        {error && (
          <Alert intent="danger" title="That didn’t work">
            {error}
          </Alert>
        )}
        <FormField label="Password">
          <Input
            type="password"
            revealable
            autoComplete="current-password"
            value={password}
            onValueChange={setPassword}
            onKeyDown={event => event.key === 'Enter' && advance(() => authApi.challengeVerify(flow.flowId, { password }))}
            autoFocus
          />
        </FormField>
        <div className={parts.forgotRow}>
          <Link to="/recover" search={{ identifier: identifier.trim() || undefined }} style={{ fontSize: 12 }}>
            Forgot password?
          </Link>
        </div>
        <Button variant="primary" fullWidth loading={busy} onClick={() => advance(() => authApi.challengeVerify(flow.flowId, { password }))}>
          Sign in
        </Button>
        <div className={parts.altStack}>
          <Button variant="ghost" fullWidth onClick={() => changeMethod(flow.flowId, 'WEBAUTHN')}>
            Use a passkey instead
          </Button>
          {maskedEmail !== undefined || !maskedPhone ? (
            <Button variant="ghost" fullWidth onClick={() => changeMethod(flow.flowId, 'EMAIL_OTP')}>
              Email me a one-time code
            </Button>
          ) : (
            <Button variant="ghost" fullWidth onClick={() => changeMethod(flow.flowId, 'SMS_OTP')}>
              Text me a one-time code
            </Button>
          )}
        </div>
      </AuthCard>
    </AuthScreen>
  );
}
