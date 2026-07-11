/**
 * Importing npm packages
 */
import { Button, FormField, Input, OtpInput } from '@shadow-library/ui';
import { type ReactElement, useEffect, useState } from 'react';

/**
 * Importing user defined packages
 */
import { AuthShell } from '../components/auth-shell';
import { DeadFlow, FlowStep } from '../components/flow-step';
import { OtpStep } from '../components/otp-step';
import { api } from '../lib/api';
import { deviceId, isLoggedIn, safeReturnTo } from '../lib/context';
import { navigate } from '../lib/router';
import { useFlow } from '../lib/use-flow';
import { assertPasskey } from '../lib/webauthn';

/**
 * Defining types
 */

/**
 * Declaring the constants
 *
 * The page renders purely from the server's flow status (state-machine contract): the client
 * never assumes a sequence, and enumeration-neutral copy stays identical for unknown accounts.
 */

export function LoginPage(): ReactElement {
  const { flow, busy, error, dead, run, reset, setError } = useFlow();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryMode, setRecoveryMode] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');

  const finish = (): void => window.location.assign(safeReturnTo() ?? '/account');

  /**
   * A signed-in browser bounced here with a pending authorize URL means the missing piece is
   * consent, not authentication (first-party clients never bounce) — hand over to the prompt.
   */
  useEffect(() => {
    const returnTo = safeReturnTo();
    if (returnTo && isLoggedIn()) window.location.replace(`/consent?return_to=${encodeURIComponent(returnTo)}`);
  }, []);

  const complete = (state: { status: string } | null): void => {
    if (state?.status === 'COMPLETED') finish();
  };

  const submitIdentifier = async (): Promise<void> => {
    if (!identifier.trim()) return setError('Enter your email or phone number.');
    await run(() => api.loginInit(identifier.trim(), deviceId()));
  };

  const submitPassword = async (): Promise<void> => {
    if (!flow || !password) return setError('Enter your password.');
    complete(await run(() => api.challengeVerify(flow.flowId, { password })));
  };

  const submitOtp = async (code: string): Promise<void> => {
    if (!flow) return;
    complete(await run(() => api.challengeVerify(flow.flowId, { code })));
  };

  const submitRecoveryCode = async (): Promise<void> => {
    if (!flow || !recoveryCode.trim()) return setError('Enter one of your recovery codes.');
    complete(await run(() => api.challengeVerify(flow.flowId, { recoveryCode: recoveryCode.trim() })));
  };

  /** Passkey ceremony — usernameless from the identifier step, factor-bound inside a flow. */
  const passkey = async (flowId?: string): Promise<void> => {
    const challenge = await api.webauthnOptions(flowId, deviceId()).catch(() => null);
    if (!challenge) return setError('Passkey sign-in is unavailable right now.');
    const ceremony = await assertPasskey(challenge.options);
    if (ceremony.outcome === 'UNSUPPORTED') return setError('This browser does not support passkeys.');
    if (ceremony.outcome === 'CANCELLED') return;
    const target = flowId ?? challenge.flowId;
    if (!target) return setError('Passkey sign-in is unavailable right now.');
    complete(await run(() => api.challengeVerify(target, { webauthn: ceremony.response })));
  };

  const switchMethod = async (method: 'EMAIL_OTP' | 'SMS_OTP' | 'PASSWORD'): Promise<void> => {
    if (!flow) return;
    await run(() => api.challengeChange(flow.flowId, method));
  };

  const restart = (): void => {
    reset();
    setPassword('');
    setRecoveryCode('');
    setRecoveryMode(false);
  };

  const status = flow?.status ?? 'IDENTIFIER';
  const otpMethod = status === 'AWAITING_SMS_OTP' ? 'SMS_OTP' : 'EMAIL_OTP';
  const maskedTarget = flow?.metadata?.maskedEmail ?? flow?.metadata?.maskedPhone;
  const isEmailIdentifier = identifier.includes('@');

  const renderStep = (): ReactElement => {
    if (dead) return <DeadFlow onRestart={restart} />;

    if (status === 'IDENTIFIER')
      return (
        <FlowStep
          title="Sign in"
          subtitle="Use your Shadow account across every shadow-apps.com service."
          error={error}
          busy={busy}
          submitLabel="Continue"
          onSubmit={() => void submitIdentifier()}
        >
          <FormField label="Email or phone">
            <Input type="text" autoComplete="username webauthn" value={identifier} onValueChange={setIdentifier} autoFocus placeholder="you@example.com" />
          </FormField>
          <Button variant="secondary" fullWidth type="button" onClick={() => void passkey()}>
            Sign in with a passkey
          </Button>
        </FlowStep>
      );

    if (status === 'PASSWORD_RESET_REQUIRED')
      return (
        <FlowStep title="Password reset required" subtitle="An administrator requires you to set a new password before signing in. Recover your account to continue.">
          <Button variant="primary" fullWidth onClick={() => navigate('/recover')}>
            Reset password
          </Button>
        </FlowStep>
      );

    if (status === 'AWAITING_PASSWORD')
      return (
        <FlowStep
          title="Enter your password"
          subtitle={identifier}
          error={error}
          busy={busy}
          submitLabel="Sign in"
          onSubmit={() => void submitPassword()}
          footer={passwordFooter()}
        >
          <FormField label="Password">
            <Input type="password" autoComplete="current-password" value={password} onValueChange={setPassword} autoFocus />
          </FormField>
        </FlowStep>
      );

    if (status === 'AWAITING_EMAIL_OTP' || status === 'AWAITING_SMS_OTP')
      return (
        <FlowStep title="Check your messages" error={error} busy={busy} footer={otpFooter()}>
          <OtpStep flowId={flow?.flowId ?? ''} method={otpMethod} maskedTarget={maskedTarget} busy={busy} onSubmit={code => void submitOtp(code)} />
        </FlowStep>
      );

    if (status === 'AWAITING_WEBAUTHN')
      return (
        <FlowStep title="Use your passkey" subtitle="Confirm with the passkey saved on this device." error={error} busy={busy}>
          <Button variant="primary" fullWidth onClick={() => void passkey(flow?.flowId)}>
            Continue with passkey
          </Button>
        </FlowStep>
      );

    if (status === 'AWAITING_TOTP' || status === 'AWAITING_MFA_WEBAUTHN') {
      if (recoveryMode)
        return (
          <FlowStep
            title="Use a recovery code"
            subtitle="Enter one of the single-use codes you saved when enabling two-step verification."
            error={error}
            busy={busy}
            submitLabel="Verify"
            onSubmit={() => void submitRecoveryCode()}
            footer={
              <Button variant="text" size="sm" type="button" onClick={() => setRecoveryMode(false)}>
                Back to authenticator
              </Button>
            }
          >
            <FormField label="Recovery code">
              <Input type="text" autoComplete="one-time-code" value={recoveryCode} onValueChange={setRecoveryCode} autoFocus inputClassName="text-code" />
            </FormField>
          </FlowStep>
        );

      return (
        <FlowStep title="Two-step verification" subtitle="Enter the code from your authenticator app." error={error} busy={busy} footer={mfaFooter()}>
          <FormField label="6-digit code">
            <TotpEntry busy={busy} onComplete={code => void submitOtp(code)} />
          </FormField>
        </FlowStep>
      );
    }

    return <DeadFlow onRestart={restart} />;
  };

  const passwordFooter = (): ReactElement => (
    <div className="cluster gap-8">
      {isEmailIdentifier ? (
        <Button variant="text" size="sm" type="button" onClick={() => void switchMethod('EMAIL_OTP')}>
          Email me a code instead
        </Button>
      ) : (
        <Button variant="text" size="sm" type="button" onClick={() => void switchMethod('SMS_OTP')}>
          Text me a code instead
        </Button>
      )}
      <Button variant="text" size="sm" type="button" onClick={() => void passkey(flow?.flowId)}>
        Use a passkey
      </Button>
      <Button variant="text" size="sm" type="button" onClick={() => navigate('/recover')}>
        Forgot password?
      </Button>
    </div>
  );

  const otpFooter = (): ReactElement => (
    <div className="cluster gap-8">
      <Button variant="text" size="sm" type="button" onClick={() => void switchMethod('PASSWORD')}>
        Use password instead
      </Button>
    </div>
  );

  const mfaFooter = (): ReactElement => (
    <div className="cluster gap-8">
      <Button variant="text" size="sm" type="button" onClick={() => setRecoveryMode(true)}>
        Use a recovery code
      </Button>
      <Button variant="text" size="sm" type="button" onClick={() => void passkey(flow?.flowId)}>
        Use a passkey
      </Button>
    </div>
  );

  return (
    <AuthShell>
      {renderStep()}
      <RegisterHint visible={status === 'IDENTIFIER'} />
    </AuthShell>
  );
}

/** TOTP entry keeps its own value so a rejected code clears without disturbing page state. */
function TotpEntry({ busy, onComplete }: { busy: boolean; onComplete(code: string): void }): ReactElement {
  const [code, setCode] = useState('');
  return <OtpInput length={6} type="numeric" value={code} onValueChange={setCode} onComplete={onComplete} autoFocus disabled={busy} />;
}

function RegisterHint({ visible }: { visible: boolean }): ReactElement | null {
  if (!visible) return null;
  return (
    <p className="text-secondary center-x gap-8">
      New here?
      <Button variant="text" size="sm" type="button" onClick={() => navigate('/register')}>
        Create your Shadow account
      </Button>
    </p>
  );
}
