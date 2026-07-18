/**
 * Importing npm packages
 */
import QRCode from 'qrcode';
import { type ReactElement, useCallback, useEffect, useState } from 'react';
import { Badge, Button, Card, ConfirmDialog, Dialog, EmptyState, FormField, Input, OtpInput } from '@shadow-library/ui';

/**
 * Importing user defined packages
 */
import { api, type MfaEnrollment } from '../../lib/api';
import { registerPasskey } from '../../lib/webauthn';
import { CodeSheetDialog } from './code-sheet';
import { useStepUp } from './step-up';

/**
 * Defining types
 */

interface TotpEnrollmentState {
  secret: string;
  uri: string;
  qr: string;
}

/**
 * Declaring the constants
 */

export function SecuritySection(): ReactElement {
  const { withStepUp } = useStepUp();
  const [enrollments, setEnrollments] = useState<MfaEnrollment[] | null>(null);
  const [enrolling, setEnrolling] = useState<TotpEnrollmentState | null>(null);
  const [activationCode, setActivationCode] = useState('');
  const [activationError, setActivationError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [passkeyLabel, setPasskeyLabel] = useState('');
  const [addingPasskey, setAddingPasskey] = useState(false);
  const [removal, setRemoval] = useState<MfaEnrollment | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async (): Promise<void> => {
    setEnrollments(await api.mfaEnrollments().catch(() => []));
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /** TOTP enrollment: mint the seed, render the otpauth URI as a QR locally (data: image). */
  const startTotp = async (): Promise<void> => {
    setNotice(null);
    const enrollment = await withStepUp(() => api.totpEnroll()).catch(() => null);
    if (!enrollment) return;
    const qr = await QRCode.toDataURL(enrollment.uri, { margin: 1, width: 220 });
    setActivationCode('');
    setActivationError(null);
    setEnrolling({ ...enrollment, qr });
  };

  const activateTotp = async (code: string): Promise<void> => {
    const result = await api.totpActivate(code).catch(() => null);
    if (!result?.success) {
      setActivationCode('');
      setActivationError('That code was not accepted. Check your authenticator and try again.');
      return;
    }
    setEnrolling(null);
    if (result.recoveryCodes) setRecoveryCodes(result.recoveryCodes);
    await refresh();
  };

  const addPasskey = async (): Promise<void> => {
    setNotice(null);
    setAddingPasskey(true);
    try {
      const options = await withStepUp(() => api.webauthnRegisterOptions());
      const ceremony = await registerPasskey(options);
      if (ceremony.outcome === 'UNSUPPORTED') return setNotice('This browser does not support passkeys.');
      if (ceremony.outcome === 'CANCELLED') return;
      const result = await api.webauthnRegisterVerify(ceremony.response, passkeyLabel.trim() || undefined);
      if (result.recoveryCodes) setRecoveryCodes(result.recoveryCodes);
      setPasskeyLabel('');
      await refresh();
    } catch {
      setNotice('The passkey could not be added. Try again.');
    } finally {
      setAddingPasskey(false);
    }
  };

  const removeEnrollment = async (enrollment: MfaEnrollment): Promise<void> => {
    setNotice(null);
    const action = enrollment.type === 'TOTP' ? () => api.totpRemove() : () => api.webauthnRemove(enrollment.credentialId ?? '');
    await withStepUp(action).catch(() => setNotice('The factor could not be removed.'));
    setRemoval(null);
    await refresh();
  };

  const regenerate = async (): Promise<void> => {
    setNotice(null);
    const codes = await withStepUp(() => api.regenerateRecoveryCodes()).catch(() => null);
    if (codes) setRecoveryCodes(codes);
  };

  const hasTotp = enrollments?.some(enrollment => enrollment.type === 'TOTP') ?? false;
  const hasMfa = (enrollments?.length ?? 0) > 0;

  return (
    <div className="stack gap-24">
      <Card>
        <Card.Header title="Two-step verification" />
        <Card.Body>
          <div className="stack gap-16">
            {notice ? <p className="text-secondary">{notice}</p> : null}
            {enrollments === null ? (
              <p className="text-secondary">Loading…</p>
            ) : enrollments.length === 0 ? (
              <EmptyState size="inline" title="No second factor yet" description="Add an authenticator app or a passkey so your account survives a stolen password." />
            ) : (
              <ul className="stack gap-8">
                {enrollments.map(enrollment => (
                  <li key={`${enrollment.type}-${enrollment.label}`} className="flex items-center justify-between gap-16">
                    <span className="cluster gap-8">
                      <Badge intent={enrollment.type === 'WEBAUTHN' ? 'info' : 'success'}>{enrollment.type === 'WEBAUTHN' ? 'Passkey' : 'Authenticator'}</Badge>
                      <span>{enrollment.label}</span>
                    </span>
                    <Button variant="ghost" size="sm" onClick={() => setRemoval(enrollment)}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="cluster gap-8">
              {!hasTotp ? (
                <Button variant="secondary" onClick={() => void startTotp()}>
                  Set up authenticator app
                </Button>
              ) : null}
              <div className="cluster gap-8">
                <Input size="sm" placeholder="Passkey name (optional)" value={passkeyLabel} onValueChange={setPasskeyLabel} aria-label="Passkey name" />
                <Button variant="secondary" size="sm" loading={addingPasskey} onClick={() => void addPasskey()}>
                  Add passkey
                </Button>
              </div>
            </div>
          </div>
        </Card.Body>
      </Card>

      {hasMfa ? (
        <Card>
          <Card.Header title="Recovery codes" />
          <Card.Body>
            <div className="flex items-center justify-between gap-16">
              <p className="text-secondary">Single-use codes that sign you in if you lose your other factors. Regenerating retires the previous batch.</p>
              <Button variant="secondary" onClick={() => void regenerate()}>
                Regenerate
              </Button>
            </div>
          </Card.Body>
        </Card>
      ) : null}

      <Dialog open={enrolling !== null} onOpenChange={open => (open ? undefined : setEnrolling(null))}>
        <Dialog.Content size="md">
          <Dialog.Header title="Set up your authenticator" description="Scan the QR code, then enter the 6-digit code it shows to activate." />
          <Dialog.Body>
            <div className="stack gap-16 items-center">
              {enrolling ? <img src={enrolling.qr} alt="QR code for authenticator enrollment" width={220} height={220} /> : null}
              <p className="text-tertiary text-body-sm">
                Can&#39;t scan? Enter this key manually: <code className="text-code">{enrolling?.secret}</code>
              </p>
              <FormField label="6-digit code" error={activationError}>
                <OtpInput length={6} type="numeric" value={activationCode} onValueChange={setActivationCode} onComplete={code => void activateTotp(code)} autoFocus />
              </FormField>
            </div>
          </Dialog.Body>
        </Dialog.Content>
      </Dialog>

      <ConfirmDialog
        open={removal !== null}
        onOpenChange={open => (open ? undefined : setRemoval(null))}
        intent="danger"
        title={`Remove ${removal?.type === 'WEBAUTHN' ? 'this passkey' : 'the authenticator app'}?`}
        description="Signing in will no longer require this factor. If it is your last one, two-step verification turns off entirely."
        confirmLabel="Remove"
        onConfirm={() => removal && void removeEnrollment(removal)}
      />

      <CodeSheetDialog codes={recoveryCodes} onClose={() => setRecoveryCodes(null)} />
    </div>
  );
}
