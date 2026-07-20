/**
 * Importing npm packages
 */
import { useEffect, useState } from 'react';
import { Button, FormField, Input, OtpInput } from '@shadow-library/ui';

/**
 * Importing user defined modules
 */
import { FingerprintIcon, IdCardIcon, LockIcon, SmartphoneIcon } from '@/components/icons';
import { MethodRow, StepHeader } from './auth-parts';
import styles from './auth-parts.module.css';
import { AuthCard, AuthMedallion } from './auth-shell';

/**
 * Defining types
 */

/** Which entry a second factor collects — the chooser is the upfront "pick a step" surface. */
type MfaView = 'chooser' | 'totp' | 'recovery';

interface MfaStepProps {
  error: string | null;
  busy: boolean;
  attemptsLeft?: number;
  /** Passkey is only a real second factor when the caller can run the ceremony (login, not recovery). */
  canPasskey?: boolean;
  onTotp: (code: string) => void;
  onRecovery: (code: string) => void;
  onPasskey?: () => void;
  onCancel: () => void;
}

interface MfaLockedCardProps {
  /** ISO instant the lock lifts; drives the live countdown when present. */
  lockedUntil?: string;
  /** Offered only while a recoverable flow survives the lock — a terminated flow can only restart. */
  onRecovery?: () => void;
  onRestart: () => void;
}

/**
 * Declaring the constants
 */

const formatCountdown = (ms: number): string => {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${(total % 60).toString().padStart(2, '0')}`;
};

/**
 * The second-factor step shared by login and recovery. It opens on a method chooser listing the factors
 * this backend actually verifies at the MFA step — authenticator (TOTP), passkey, and recovery code —
 * then drills into the picked entry; each entry can return to the chooser. SMS/email are first-factor
 * methods here (not second factors), so they never appear. The parent's flow status decides when this
 * is shown (`AWAITING_TOTP` / `AWAITING_MFA_WEBAUTHN`); this component only collects the proof.
 */
export function MfaStep({ error, busy, attemptsLeft, canPasskey, onTotp, onRecovery, onPasskey, onCancel }: MfaStepProps): React.JSX.Element {
  const [view, setView] = useState<MfaView>('chooser');
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState('');
  const passkeyEnabled = Boolean(canPasskey && onPasskey);

  if (view === 'totp')
    return (
      <AuthCard>
        <StepHeader title="Authenticator app" description="Enter the 6-digit code from your authenticator app." />
        <FormField error={error ?? undefined}>
          <OtpInput length={6} size="md" value={code} onValueChange={setCode} onComplete={onTotp} invalid={Boolean(error)} autoFocus />
        </FormField>
        <Button variant="primary" fullWidth loading={busy} onClick={() => onTotp(code)}>
          Verify
        </Button>
        <Button variant="ghost" fullWidth onClick={() => setView('chooser')}>
          Use another method
        </Button>
        {attemptsLeft != null && attemptsLeft > 0 && (
          <p className={styles.otpNote}>
            {attemptsLeft} {attemptsLeft === 1 ? 'attempt' : 'attempts'} remaining ·{' '}
            <Button variant="text" size="sm" onClick={() => setView('recovery')}>
              Use a recovery code
            </Button>
          </p>
        )}
      </AuthCard>
    );

  if (view === 'recovery')
    return (
      <AuthCard>
        <StepHeader title="Recovery code" description="Enter one of the backup codes you saved when you set up two-factor." />
        <FormField label="Recovery code" helper="Each code works once." error={error ?? undefined}>
          <Input placeholder="xxxxx-xxxxx" value={recovery} onValueChange={setRecovery} invalid={Boolean(error)} autoFocus />
        </FormField>
        <Button variant="primary" fullWidth loading={busy} onClick={() => onRecovery(recovery.trim())}>
          Verify
        </Button>
        <Button variant="ghost" fullWidth onClick={() => setView('chooser')}>
          Use another method
        </Button>
      </AuthCard>
    );

  return (
    <AuthCard>
      <StepHeader title="Confirm it's you" description="Choose a second step to finish signing in." />
      {error && <p className={`${styles.otpNote} ${styles.otpError}`}>{error}</p>}
      <div className={styles.methodList}>
        <MethodRow
          icon={<SmartphoneIcon size={18} />}
          title="Authenticator app"
          description="Enter a code from your app"
          badge="Recommended"
          selected
          onClick={() => setView('totp')}
        />
        {passkeyEnabled && <MethodRow icon={<FingerprintIcon size={18} />} title="Passkey" description="Use your device or security key" onClick={onPasskey} />}
        <MethodRow icon={<IdCardIcon size={18} />} title="Recovery code" description="Use a saved backup code" onClick={() => setView('recovery')} />
      </div>
      <Button variant="text" size="sm" onClick={onCancel}>
        Cancel and start over
      </Button>
    </AuthCard>
  );
}

/**
 * The "Too many attempts" lock-out card (design A4 · locked). The backend surfaces the MFA lock only as a
 * terminated flow, so the countdown renders when a `lockedUntil` is supplied and otherwise degrades to a
 * plain "try again later"; the way out is a recovery code when the flow survives, else a fresh start.
 */
export function MfaLockedCard({ lockedUntil, onRecovery, onRestart }: MfaLockedCardProps): React.JSX.Element {
  // Computed on the client only so the SSR pass and first hydration agree (no server/client clock skew).
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!lockedUntil) return;
    const target = new Date(lockedUntil).getTime();
    const tick = (): void => setRemaining(target - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const counting = remaining !== null && remaining > 0;
  return (
    <AuthCard>
      <AuthMedallion intent="danger">
        <LockIcon size={27} />
      </AuthMedallion>
      <StepHeader
        title="Too many attempts"
        description={
          counting ? (
            <>
              For your security, verification is paused. Try again in <strong>{formatCountdown(remaining)}</strong>.
            </>
          ) : (
            'For your security, verification is paused. Try again later.'
          )
        }
        align="center"
      />
      {onRecovery && (
        <Button variant="secondary" fullWidth onClick={onRecovery}>
          Use a recovery code
        </Button>
      )}
      <Button variant={onRecovery ? 'ghost' : 'secondary'} fullWidth onClick={onRestart}>
        Start over
      </Button>
    </AuthCard>
  );
}
