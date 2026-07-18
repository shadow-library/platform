/**
 * Importing npm packages
 */
import { type ReactElement, useState } from 'react';
import { Button, FormField, Input, OtpInput } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { AuthShell } from '../components/auth-shell';
import { DeadFlow, FlowStep } from '../components/flow-step';
import { OtpStep } from '../components/otp-step';
import { api } from '../lib/api';
import { deviceId } from '../lib/context';
import { navigate } from '../lib/router';
import { useFlow } from '../lib/use-flow';

/**
 * Defining types
 */

/**
 * Declaring the constants
 */

export function RecoverPage(): ReactElement {
  const { flow, busy, error, dead, run, reset, setError } = useFlow();
  const [identifier, setIdentifier] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [useRecoveryCode, setUseRecoveryCode] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');

  const status = flow?.status ?? 'IDENTIFIER';

  const submitIdentifier = async (): Promise<void> => {
    if (!identifier.trim()) return setError('Enter your email or phone number.');
    await run(() => api.recoverInit(identifier.trim(), deviceId()));
  };

  const submitOtp = async (code: string): Promise<void> => {
    if (!flow) return;
    await run(() => api.challengeVerify(flow.flowId, { code }));
  };

  const submitMfa = async (): Promise<void> => {
    if (!flow) return;
    if (useRecoveryCode) {
      if (!recoveryCode.trim()) return setError('Enter one of your recovery codes.');
      await run(() => api.challengeVerify(flow.flowId, { recoveryCode: recoveryCode.trim() }));
      return;
    }
    if (mfaCode.length !== 6) return setError('Enter the 6-digit code from your authenticator app.');
    await run(() => api.challengeVerify(flow.flowId, { code: mfaCode }));
  };

  const submitPassword = async (): Promise<void> => {
    if (!flow) return;
    if (password.length < 8) return setError('Choose a password of at least 8 characters.');
    if (password !== confirm) return setError('The passwords do not match.');
    const state = await run(() => api.recoverReset(flow.flowId, password));
    if (state?.status === 'COMPLETED') window.location.assign('/account');
  };

  const renderStep = (): ReactElement => {
    if (dead) return <DeadFlow onRestart={reset} />;

    if (status === 'IDENTIFIER')
      return (
        <FlowStep
          title="Recover your account"
          subtitle="We'll verify it's you, then let you set a new password."
          error={error}
          busy={busy}
          submitLabel="Continue"
          onSubmit={() => void submitIdentifier()}
          footer={backToSignIn()}
        >
          <FormField label="Email or phone">
            <Input type="text" autoComplete="username" value={identifier} onValueChange={setIdentifier} autoFocus placeholder="you@example.com" />
          </FormField>
        </FlowStep>
      );

    if (status === 'AWAITING_EMAIL_OTP' || status === 'AWAITING_SMS_OTP')
      return (
        <FlowStep title="Check your messages" error={error} busy={busy}>
          <OtpStep
            flowId={flow?.flowId ?? ''}
            method={status === 'AWAITING_SMS_OTP' ? 'SMS_OTP' : 'EMAIL_OTP'}
            maskedTarget={flow?.metadata?.maskedEmail ?? flow?.metadata?.maskedPhone}
            busy={busy}
            onSubmit={code => void submitOtp(code)}
          />
        </FlowStep>
      );

    if (status === 'AWAITING_TOTP')
      return (
        <FlowStep
          title="Two-step verification"
          subtitle={useRecoveryCode ? 'Enter one of your single-use recovery codes.' : 'Enter the code from your authenticator app.'}
          error={error}
          busy={busy}
          submitLabel="Verify"
          onSubmit={() => void submitMfa()}
          footer={
            <Button variant="text" size="sm" type="button" onClick={() => setUseRecoveryCode(current => !current)}>
              {useRecoveryCode ? 'Back to authenticator' : 'Use a recovery code'}
            </Button>
          }
        >
          {useRecoveryCode ? (
            <FormField label="Recovery code">
              <Input type="text" autoComplete="one-time-code" value={recoveryCode} onValueChange={setRecoveryCode} autoFocus />
            </FormField>
          ) : (
            <FormField label="6-digit code">
              <OtpInput length={6} type="numeric" value={mfaCode} onValueChange={setMfaCode} autoFocus disabled={busy} />
            </FormField>
          )}
        </FlowStep>
      );

    if (status === 'AWAITING_NEW_PASSWORD')
      return (
        <FlowStep
          title="Set a new password"
          subtitle="Every other session will be signed out."
          error={error}
          busy={busy}
          submitLabel="Reset password"
          onSubmit={() => void submitPassword()}
        >
          <FormField label="New password" helper="At least 8 characters. Previous passwords cannot be reused.">
            <Input type="password" autoComplete="new-password" value={password} onValueChange={setPassword} autoFocus />
          </FormField>
          <FormField label="Confirm password">
            <Input type="password" autoComplete="new-password" value={confirm} onValueChange={setConfirm} />
          </FormField>
        </FlowStep>
      );

    return <DeadFlow onRestart={reset} />;
  };

  const backToSignIn = (): ReactElement => (
    <Button variant="text" size="sm" type="button" onClick={() => navigate('/login')}>
      Back to sign in
    </Button>
  );

  return <AuthShell>{renderStep()}</AuthShell>;
}
