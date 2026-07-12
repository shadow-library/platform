/**
 * Importing npm packages
 */
import { Button, FormField, OtpInput } from '@shadow-library/ui';
import { type ReactNode } from 'react';

/**
 * Importing user defined packages
 */
import { ChevronRightIcon } from '@/components/icons';

import styles from './auth-parts.module.css';

/**
 * Defining types
 */
interface StepHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  align?: 'start' | 'center';
}

interface IdentifierChipProps {
  label: string;
  onChange?: () => void;
}

interface MethodRowProps {
  icon: ReactNode;
  title: ReactNode;
  description: ReactNode;
  badge?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
}

interface OtpEntryProps {
  title: ReactNode;
  sentTo?: ReactNode;
  value: string;
  onValueChange: (value: string) => void;
  onComplete?: (value: string) => void;
  error?: string | null;
  onResend?: () => void;
  /** Seconds until resend is allowed again; 0/undefined enables it. */
  resendIn?: number;
  altLabel?: string;
  onAlt?: () => void;
  note?: ReactNode;
  disabled?: boolean;
  length?: number;
}

/**
 * Declaring the constants
 */

/** The segmented progress bar + step label at the top of a wizard step. */
export function StepProgress({ total, current, label }: { total: number; current: number; label?: ReactNode }): React.JSX.Element {
  return (
    <div className={styles.progress}>
      <div className={styles.progressBar}>
        {Array.from({ length: total }).map((_, index) => (
          <span key={index} className={styles.progressSeg} data-on={index < current || undefined} />
        ))}
      </div>
      {label && <div className={styles.progressLabel}>{label}</div>}
    </div>
  );
}

/** The two-line heading used at the top of every auth step. */
export function StepHeader({ title, description, align = 'start' }: StepHeaderProps): React.JSX.Element {
  return (
    <div className={styles.stepHeader} data-align={align}>
      <h1 className={styles.stepTitle}>{title}</h1>
      {description && <p className={styles.stepDesc}>{description}</p>}
    </div>
  );
}

/** The "current identifier" pill with a Change action, shown once an identifier is locked in. */
export function IdentifierChip({ label, onChange }: IdentifierChipProps): React.JSX.Element {
  return (
    <div className={styles.idChip}>
      <span className={styles.idChipMain}>
        <span className={styles.idDot} />
        <span className={styles.idValue}>{label}</span>
      </span>
      {onChange && (
        <Button variant="text" size="sm" onClick={onChange}>
          Change
        </Button>
      )}
    </div>
  );
}

/** A selectable factor/method row (authenticator, SMS, passkey, recovery code). */
export function MethodRow({ icon, title, description, badge, selected, onClick }: MethodRowProps): React.JSX.Element {
  return (
    <button type="button" className={styles.methodRow} data-selected={selected || undefined} onClick={onClick}>
      <span className={styles.methodIcon}>{icon}</span>
      <span className={styles.methodBody}>
        <span className={styles.methodTitle}>{title}</span>
        <span className={styles.methodDesc}>{description}</span>
      </span>
      {badge ? <span className={styles.methodBadge}>{badge}</span> : <ChevronRightIcon size={18} className={styles.methodChevron} />}
    </button>
  );
}

/** Segmented one-time-code entry with an optional resend row and an "another way" escape hatch. */
export function OtpEntry({
  title,
  sentTo,
  value,
  onValueChange,
  onComplete,
  error,
  onResend,
  resendIn,
  altLabel,
  onAlt,
  note,
  disabled,
  length = 6,
}: OtpEntryProps): React.JSX.Element {
  const resendDisabled = Boolean(resendIn && resendIn > 0);
  return (
    <div className={styles.otp}>
      <StepHeader
        title={title}
        description={
          sentTo ? (
            <>
              Enter the {length}-digit code sent to <strong>{sentTo}</strong>.
            </>
          ) : (
            `Enter the ${length}-digit code.`
          )
        }
      />
      <FormField error={error ?? undefined}>
        <OtpInput length={length} size="md" value={value} onValueChange={onValueChange} onComplete={onComplete} invalid={Boolean(error)} disabled={disabled} autoFocus />
      </FormField>
      {onResend && (
        <div className={styles.resendRow}>
          <span className={styles.resendHint}>Didn’t get it?{resendDisabled ? ` Resend in ${resendIn}s` : ''}</span>
          <Button variant="text" size="sm" disabled={resendDisabled} onClick={onResend}>
            Resend code
          </Button>
        </div>
      )}
      {onAlt && (
        <Button variant="ghost" fullWidth onClick={onAlt}>
          {altLabel ?? 'Try another way'}
        </Button>
      )}
      {note && <p className={styles.otpNote}>{note}</p>}
    </div>
  );
}
