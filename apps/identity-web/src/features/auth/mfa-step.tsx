/**
 * Importing npm packages
 */
import { useState } from 'react';
import { Button, FormField, Input, OtpInput } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { StepHeader } from './auth-parts';
import styles from './auth-parts.module.css';
import { AuthCard } from './auth-shell';

/**
 * Defining types
 */
interface MfaStepProps {
  error: string | null;
  busy: boolean;
  attemptsLeft?: number;
  canPasskey?: boolean;
  onTotp: (code: string) => void;
  onRecovery: (code: string) => void;
  onPasskey?: () => void;
  onCancel: () => void;
}

/**
 * The second-factor step shared by login and recovery: an authenticator-code entry that can switch to
 * a one-time recovery code or a passkey. The parent's flow decides when it is shown (status
 * `AWAITING_TOTP`); this component only collects the proof.
 */
export function MfaStep({ error, busy, attemptsLeft, canPasskey, onTotp, onRecovery, onPasskey, onCancel }: MfaStepProps): React.JSX.Element {
  const [mode, setMode] = useState<'totp' | 'recovery'>('totp');
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState('');

  if (mode === 'recovery')
    return (
      <AuthCard>
        <StepHeader title="Recovery code" description="Enter one of the backup codes you saved when you set up two-factor." />
        <FormField label="Recovery code" helper="Each code works once." error={error ?? undefined}>
          <Input placeholder="xxxxx-xxxxx" value={recovery} onValueChange={setRecovery} invalid={Boolean(error)} autoFocus />
        </FormField>
        <Button variant="primary" fullWidth loading={busy} onClick={() => onRecovery(recovery.trim())}>
          Verify
        </Button>
        <Button variant="ghost" fullWidth onClick={() => setMode('totp')}>
          Use authenticator instead
        </Button>
      </AuthCard>
    );

  return (
    <AuthCard>
      <StepHeader title="Authenticator app" description="Enter the 6-digit code from your authenticator app to finish signing in." />
      <FormField error={error ?? undefined}>
        <OtpInput length={6} size="md" value={code} onValueChange={setCode} onComplete={onTotp} invalid={Boolean(error)} autoFocus />
      </FormField>
      <Button variant="primary" fullWidth loading={busy} onClick={() => onTotp(code)}>
        Verify
      </Button>
      <div className={styles.mfaAlts}>
        <Button variant="ghost" fullWidth onClick={() => setMode('recovery')}>
          Use a recovery code
        </Button>
        {canPasskey && onPasskey && (
          <Button variant="ghost" fullWidth onClick={onPasskey}>
            Use a passkey
          </Button>
        )}
      </div>
      {attemptsLeft != null && attemptsLeft > 0 && <p className={styles.otpNote}>{attemptsLeft} attempts remaining</p>}
      <Button variant="text" size="sm" onClick={onCancel}>
        Cancel and start over
      </Button>
    </AuthCard>
  );
}
