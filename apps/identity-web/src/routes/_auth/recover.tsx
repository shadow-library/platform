/**
 * Importing npm packages
 */
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { Alert, Button, FormField, Input, toast } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { ClockIcon, MailIcon } from '@/components/icons';
import { AuthCard, AuthMedallion, AuthScreen, MfaStep, OtpEntry, StepHeader, useFlow } from '@/features/auth';
import { authApi } from '@/lib/apis';
import { useDeviceId } from '@/lib/hooks';

/**
 * Declaring the constants
 */
interface RecoverSearch {
  identifier?: string;
}

export const Route = createFileRoute('/_auth/recover')({
  validateSearch: (search: Record<string, unknown>): RecoverSearch => ({ identifier: typeof search.identifier === 'string' ? search.identifier : undefined }),
  component: RecoverPage,
});

function RecoverPage(): React.JSX.Element {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const deviceId = useDeviceId();
  const { flow, busy, error, dead, run, reset, setError } = useFlow();

  const [identifier, setIdentifier] = useState(search.identifier ?? '');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const footer = <Link to="/login">Return to sign in</Link>;
  const status = flow?.status;

  if (dead)
    return (
      <AuthScreen footer={footer}>
        <AuthCard>
          <AuthMedallion intent="danger">
            <ClockIcon size={28} />
          </AuthMedallion>
          <StepHeader title="This code has expired" description="For your security, recovery codes expire after 15 minutes. Request a new one to continue." align="center" />
          <Button variant="primary" fullWidth onClick={reset}>
            Request a new code
          </Button>
        </AuthCard>
      </AuthScreen>
    );

  if (status === 'COMPLETED')
    return (
      <AuthScreen footer={footer}>
        <AuthCard>
          <AuthMedallion intent="success">
            <MailIcon size={28} />
          </AuthMedallion>
          <StepHeader title="Password updated" description="Your new password is set and all other sessions were signed out." align="center" />
          <Button variant="primary" fullWidth onClick={() => navigate({ to: '/account' })}>
            Continue
          </Button>
        </AuthCard>
      </AuthScreen>
    );

  /* ---------- request ---------- */
  if (!flow)
    return (
      <AuthScreen footer={footer}>
        <AuthCard>
          <StepHeader title="Reset your password" description="Enter your email or phone number and we’ll send a recovery code." />
          {error && (
            <Alert intent="danger" title="We couldn’t continue">
              {error}
            </Alert>
          )}
          <FormField label="Email or phone">
            <Input type="text" placeholder="you@company.com" value={identifier} onValueChange={setIdentifier} autoFocus />
          </FormField>
          <Button
            variant="primary"
            fullWidth
            loading={busy}
            onClick={() => (identifier.trim() ? void run(() => authApi.recoverInit(identifier.trim(), deviceId)) : setError('Enter your email or phone number.'))}
          >
            Send recovery code
          </Button>
          <p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, color: 'var(--sh-text-tertiary)', textAlign: 'center' }}>
            If an account exists, we’ll send a code. We don’t confirm whether an account exists.
          </p>
        </AuthCard>
      </AuthScreen>
    );

  /* ---------- verify code ---------- */
  if (status === 'AWAITING_EMAIL_OTP' || status === 'AWAITING_SMS_OTP') {
    const isEmail = status === 'AWAITING_EMAIL_OTP';
    return (
      <AuthScreen footer={footer}>
        <AuthCard>
          <OtpEntry
            title="Enter recovery code"
            sentTo={isEmail ? (flow.metadata?.maskedEmail ?? identifier) : flow.metadata?.maskedPhone}
            value={otp}
            error={error}
            onValueChange={setOtp}
            onComplete={code => void run(() => authApi.challengeVerify(flow.flowId, { code }))}
            onResend={() => void authApi.challengeResend(flow.flowId, isEmail ? 'EMAIL_OTP' : 'SMS_OTP').catch(() => undefined)}
          />
        </AuthCard>
      </AuthScreen>
    );
  }

  /* ---------- second factor (MFA-enrolled accounts) ---------- */
  if (status === 'AWAITING_TOTP')
    return (
      <AuthScreen footer={footer}>
        <MfaStep
          error={error}
          busy={busy}
          attemptsLeft={flow.attemptsLeft}
          onTotp={code => void run(() => authApi.challengeVerify(flow.flowId, { code }))}
          onRecovery={code => void run(() => authApi.challengeVerify(flow.flowId, { recoveryCode: code }))}
          onCancel={reset}
        />
      </AuthScreen>
    );

  /* ---------- set a new password ---------- */
  const submitReset = (): void => {
    if (password.length < 8) return setError('Choose a longer password.');
    if (password !== confirm) return setError('Passwords don’t match.');
    void run(() => authApi.recoverReset(flow.flowId, password)).then(next => {
      if (next?.status === 'COMPLETED') toast.success('Password updated');
    });
  };

  return (
    <AuthScreen footer={footer}>
      <AuthCard>
        <StepHeader title="Choose a new password" description="You’ll be signed out of other devices after resetting." />
        {error && (
          <Alert intent="danger" title="Check your password">
            {error}
          </Alert>
        )}
        <FormField label="New password">
          <Input type="password" revealable autoComplete="new-password" value={password} onValueChange={setPassword} autoFocus />
        </FormField>
        <FormField label="Confirm new password">
          <Input type="password" revealable autoComplete="new-password" value={confirm} onValueChange={setConfirm} />
        </FormField>
        <Button variant="primary" fullWidth loading={busy} onClick={submitReset}>
          Update password
        </Button>
      </AuthCard>
    </AuthScreen>
  );
}
