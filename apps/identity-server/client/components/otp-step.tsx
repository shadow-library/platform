/**
 * Importing npm packages
 */
import { Button, FormField, OtpInput } from '@shadow-library/ui';
import { type ReactElement, useEffect, useRef, useState } from 'react';

/**
 * Importing user defined packages
 */
import { api } from '../lib/api';

/**
 * Defining types
 */

interface OtpStepProps {
  flowId: string;
  method: 'EMAIL_OTP' | 'SMS_OTP';
  maskedTarget?: string;
  busy: boolean;
  onSubmit(code: string): void;
}

/**
 * Declaring the constants
 */
const RESEND_COOLDOWN_SECONDS = 60;

/** Six-digit OTP entry with the contract's resend budget: cooldown timer, silent-sent semantics. */
export function OtpStep({ flowId, method, maskedTarget, busy, onSubmit }: OtpStepProps): ReactElement {
  const [code, setCode] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [resendsLeft, setResendsLeft] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    timer.current = setInterval(() => setCooldown(current => current - 1), 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [cooldown > 0]);

  const resend = async (): Promise<void> => {
    setNotice(null);
    const result = await api.challengeResend(flowId, method).catch(() => null);
    if (!result) {
      setNotice('Could not resend right now. Try again shortly.');
      return;
    }
    if (result.status === 'LIMITED') {
      setCooldown(result.retryAfterSeconds ?? RESEND_COOLDOWN_SECONDS);
      setNotice('Please wait before requesting another code.');
      return;
    }
    setCooldown(result.retryAfterSeconds ?? RESEND_COOLDOWN_SECONDS);
    setResendsLeft(result.resendsLeft ?? null);
    setNotice('If the address is reachable, a new code is on its way.');
  };

  const target = maskedTarget ? ` sent to ${maskedTarget}` : '';
  const resendLabel = cooldown > 0 ? `Resend code (${cooldown}s)` : resendsLeft === 0 ? 'No resends left' : 'Resend code';

  return (
    <>
      <FormField label={`Enter the 6-digit code${target}`} helper={notice}>
        <OtpInput length={6} type="numeric" value={code} onValueChange={setCode} onComplete={onSubmit} autoFocus disabled={busy} />
      </FormField>
      <div className="cluster gap-8">
        <Button variant="text" size="sm" onClick={() => void resend()} disabled={cooldown > 0 || resendsLeft === 0 || busy} type="button">
          {resendLabel}
        </Button>
      </div>
    </>
  );
}
