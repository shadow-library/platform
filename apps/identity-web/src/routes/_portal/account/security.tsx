/**
 * Importing npm packages
 */
import { Badge, Button, OtpInput, Spinner, toast } from '@shadow-library/ui';
import { Link, createFileRoute } from '@tanstack/react-router';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

/**
 * Importing user defined modules
 */
import { FingerprintIcon, KeyIcon, SmartphoneIcon } from '@/components/icons';
import { CopyButton, PageHeader } from '@/components/si';
import { registerPasskey } from '@/features/auth';
import { SecretOncePanel, useStepUpGate } from '@/features/portal';
import {
  type TotpEnrollment,
  useMfaQuery,
  useRegenerateRecoveryCodesMutation,
  useRemovePasskeyMutation,
  useRemoveTotpMutation,
  useTotpActivateMutation,
  useTotpEnrollMutation,
  useWebauthnRegisterOptionsMutation,
  useWebauthnRegisterVerifyMutation,
} from '@/lib/apis';
import { deviceSummary, relativeTime } from '@/lib/format';

import styles from './security.module.css';

export const Route = createFileRoute('/_portal/account/security')({
  component: SecurityPage,
});

type View = 'default' | 'enroll' | 'secret';

function SecurityPage(): React.JSX.Element {
  const mfa = useMfaQuery();
  const totpEnroll = useTotpEnrollMutation();
  const totpActivate = useTotpActivateMutation();
  const removeTotp = useRemoveTotpMutation();
  const registerOptions = useWebauthnRegisterOptionsMutation();
  const registerVerify = useWebauthnRegisterVerifyMutation();
  const removePasskey = useRemovePasskeyMutation();
  const regenerate = useRegenerateRecoveryCodesMutation();
  const { require, dialog } = useStepUpGate();

  const [view, setView] = useState<View>('default');
  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [qr, setQr] = useState<string>('');
  const [code, setCode] = useState('');
  const [secretCodes, setSecretCodes] = useState<string[]>([]);

  useEffect(() => {
    if (!enrollment) return;
    let active = true;
    QRCode.toDataURL(enrollment.uri, { margin: 1, width: 220 })
      .then(url => {
        if (active) setQr(url);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [enrollment]);

  const enrollments = mfa.data?.enrollments ?? [];
  const totp = enrollments.find(item => item.type === 'TOTP');
  const passkeys = enrollments.filter(item => item.type === 'WEBAUTHN');
  const recoveryRemaining = mfa.data?.recoveryCodesRemaining;

  const startTotp = async (): Promise<void> => {
    try {
      const result = await totpEnroll.mutateAsync(undefined);
      setEnrollment(result);
      setCode('');
      setView('enroll');
    } catch {
      toast.danger('Couldn’t start authenticator setup');
    }
  };

  const activateTotp = (value: string): void => {
    totpActivate.mutate(value, {
      onSuccess: result => {
        setEnrollment(null);
        setCode('');
        if (result.recoveryCodes?.length) {
          setSecretCodes(result.recoveryCodes);
          setView('secret');
        } else {
          setView('default');
          toast.success('Authenticator app added');
        }
      },
      onError: error => toast.danger(error.message),
    });
  };

  const addPasskey = async (): Promise<void> => {
    try {
      const options = await registerOptions.mutateAsync(undefined);
      const ceremony = await registerPasskey(options);
      if (ceremony.outcome === 'UNSUPPORTED') {
        toast.danger('This device doesn’t support passkeys.');
        return;
      }
      if (ceremony.outcome === 'CANCELLED') return;
      const result = await registerVerify.mutateAsync({ attestation: ceremony.response, label: deviceSummary({ userAgent: navigator.userAgent }) });
      if (result.recoveryCodes?.length) {
        setSecretCodes(result.recoveryCodes);
        setView('secret');
      } else {
        toast.success('Passkey added');
      }
    } catch {
      toast.danger('Couldn’t add the passkey');
    }
  };

  const regenerateCodes = (): void =>
    require(() =>
      regenerate.mutate(undefined, {
        onSuccess: result => {
          setSecretCodes(result.recoveryCodes);
          setView('secret');
        },
        onError: error => toast.danger(error.message),
      }),
    );

  if (view === 'secret')
    return (
      <div className={styles.narrow}>
        <PageHeader title="Save your recovery codes" subtitle="Your old codes no longer work. Store this new set somewhere safe." />
        <SecretOncePanel
          title="Save these now — you won’t see them again"
          description="Each recovery code can be used once if you lose access to your other factors."
          codes={secretCodes}
          confirmLabel="I’ve saved my codes"
          downloadName="shadow-identity-recovery-codes.txt"
          onConfirm={() => setView('default')}
        />
      </div>
    );

  if (view === 'enroll')
    return (
      <div className={styles.narrow}>
        <PageHeader title="Set up authenticator app" subtitle="Scan the code with any TOTP app (1Password, Authy, Google Authenticator)." />
        <div className={styles.enrollCard}>
          {qr ? <img className={styles.qr} src={qr} alt="Authenticator QR code" /> : <div className={styles.qr} />}
          <div className={styles.enrollFields}>
            <div>
              <div className={styles.enrollLabel}>Can’t scan? Enter this key manually:</div>
              <div className={styles.keyRow}>
                <code className={styles.key}>{enrollment?.secret}</code>
                <CopyButton value={enrollment?.secret ?? ''} />
              </div>
            </div>
            <div>
              <div className={styles.enrollLabel}>Then enter the 6-digit code:</div>
              <OtpInput length={6} size="md" value={code} onValueChange={setCode} onComplete={activateTotp} autoFocus />
            </div>
          </div>
        </div>
        <div className={styles.enrollActions}>
          <Button
            variant="secondary"
            onClick={() => {
              setView('default');
              setEnrollment(null);
            }}
          >
            Cancel
          </Button>
          <Button variant="primary" loading={totpActivate.isPending} onClick={() => activateTotp(code)}>
            Activate authenticator
          </Button>
        </div>
      </div>
    );

  if (mfa.isLoading)
    return (
      <div className={styles.narrow}>
        <PageHeader title="Security" subtitle="Protect your account with a strong password and at least one phishing-resistant factor." />
        <div className={styles.loading}>
          <Spinner size="lg" label="Loading security settings" />
        </div>
      </div>
    );

  return (
    <div className={styles.narrow}>
      <PageHeader title="Security" subtitle="Protect your account with a strong password and at least one phishing-resistant factor." />

      <div className={styles.card}>
        <div className={styles.cardRow}>
          <div>
            <div className={styles.cardTitle}>Password</div>
            <div className={styles.cardSub}>Use a password reset if you need to change it.</div>
          </div>
          <Button variant="secondary" asChild>
            <Link to="/recover">Change password</Link>
          </Button>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.cardRow}>
          <div className={styles.cardTitle}>Authenticator app</div>
          {totp ? (
            <Badge intent="success" dot>
              Active
            </Badge>
          ) : (
            <Button variant="secondary" size="sm" loading={totpEnroll.isPending} onClick={startTotp}>
              Set up
            </Button>
          )}
        </div>
        {totp && (
          <div className={styles.factorRow}>
            <span className={styles.factorIcon}>
              <SmartphoneIcon size={18} />
            </span>
            <div className={styles.factorMeta}>
              <div className={styles.factorName}>{totp.label}</div>
              <div className={styles.factorSub}>Added {relativeTime(totp.createdAt)}</div>
            </div>
            <Button variant="ghost" size="sm" onClick={() => require(() => removeTotp.mutate(undefined, { onSuccess: () => toast.success('Authenticator removed') }))}>
              Remove
            </Button>
          </div>
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardRow}>
          <div>
            <div className={styles.cardTitle}>Passkeys</div>
            <div className={styles.cardSub}>Phishing-resistant sign-in with your device.</div>
          </div>
          <Button variant="secondary" size="sm" loading={registerOptions.isPending || registerVerify.isPending} onClick={addPasskey}>
            Add a passkey
          </Button>
        </div>
        {passkeys.length === 0 ? (
          <div className={styles.empty}>No passkeys yet. Add one for the fastest, most secure sign-in.</div>
        ) : (
          passkeys.map(passkey => (
            <div key={passkey.credentialId} className={styles.factorRow}>
              <span className={styles.factorIcon} data-accent>
                <FingerprintIcon size={18} />
              </span>
              <div className={styles.factorMeta}>
                <div className={styles.factorName}>{passkey.label}</div>
                <div className={styles.factorSub}>
                  Added {relativeTime(passkey.createdAt)}
                  {passkey.lastUsedAt ? ` · Last used ${relativeTime(passkey.lastUsedAt)}` : ''}
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const credentialId = passkey.credentialId;
                  if (credentialId) require(() => removePasskey.mutate(credentialId, { onSuccess: () => toast.success('Passkey removed') }));
                }}
              >
                Remove
              </Button>
            </div>
          ))
        )}
      </div>

      <div className={styles.card}>
        <div className={styles.cardRow}>
          <div>
            <div className={styles.cardTitle}>
              Recovery codes
              {recoveryRemaining !== undefined && recoveryRemaining <= 3 && (
                <Badge intent={recoveryRemaining === 0 ? 'danger' : 'warning'} dot>
                  {recoveryRemaining === 0 ? 'None left' : 'Running low'}
                </Badge>
              )}
            </div>
            <div className={styles.cardSub}>
              {recoveryRemaining === undefined
                ? 'One-time codes to use if you lose your other factors.'
                : `${recoveryRemaining} unused ${recoveryRemaining === 1 ? 'code' : 'codes'} remaining — use these if you lose your other factors.`}
            </div>
          </div>
          <Button variant="secondary" prefix={<KeyIcon size={15} />} loading={regenerate.isPending} onClick={regenerateCodes}>
            Regenerate codes
          </Button>
        </div>
      </div>

      {dialog}
    </div>
  );
}
