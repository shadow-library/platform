/**
 * Importing npm packages
 */
import { Button, Checkbox, copyText, downloadTextFile } from '@shadow-library/ui';
import { type ReactNode, useState } from 'react';

/**
 * Importing user defined packages
 */
import { AlertTriangleIcon, CopyIcon, DownloadIcon } from '@/components/icons';
import { CopyButton } from '@/components/si';

import styles from './portal.module.css';

/**
 * Defining types
 */
interface SecretOncePanelProps {
  title?: ReactNode;
  description?: ReactNode;
  /** A batch of one-time codes (recovery codes). */
  codes?: string[];
  /** A single secret string (client/webhook secret). */
  secret?: string;
  /** When provided, gate a confirm button behind a "saved it" checkbox. */
  confirmLabel?: string;
  onConfirm?: () => void;
  downloadName?: string;
}

/**
 * The reveal-once surface for secrets the server shows exactly once — recovery-code batches, client
 * secrets, webhook signing keys. Warning-framed, with copy-all + download, and an optional
 * "I've saved it" gate before the caller is allowed to dismiss it.
 */
export function SecretOncePanel({
  title = 'Save this now — you won’t see it again',
  description = 'Store it in a password manager. It cannot be retrieved later.',
  codes,
  secret,
  confirmLabel = 'Done',
  onConfirm,
  downloadName = 'shadow-identity-secret.txt',
}: SecretOncePanelProps): React.JSX.Element {
  const [saved, setSaved] = useState(false);
  const allText = secret ?? (codes ?? []).join('\n');

  return (
    <div className={styles.secretPanel}>
      <div className={styles.secretHead}>
        <AlertTriangleIcon size={18} />
        <div>
          <div className={styles.secretTitle}>{title}</div>
          <div className={styles.secretDesc}>{description}</div>
        </div>
      </div>
      <div className={styles.secretBody}>
        {codes && (
          <div className={styles.codeGrid}>
            {codes.map((code, index) => (
              <div key={code} className={styles.codeItem}>
                <span className={styles.codeNum}>{index + 1}</span>
                {code}
              </div>
            ))}
          </div>
        )}
        {secret && (
          <div className={styles.secretRow}>
            <code className={styles.secretValue}>{secret}</code>
            <CopyButton value={secret} />
          </div>
        )}
        <div className={styles.secretActions}>
          <Button variant="secondary" size="sm" prefix={<CopyIcon size={14} />} onClick={() => void copyText(allText)}>
            Copy all
          </Button>
          <Button variant="secondary" size="sm" prefix={<DownloadIcon size={14} />} onClick={() => downloadTextFile(downloadName, allText)}>
            Download
          </Button>
        </div>
        {onConfirm && (
          <div className={styles.secretConfirm}>
            <Checkbox label="I’ve saved this somewhere safe" checked={saved} onCheckedChange={value => setSaved(value === true)} />
            <Button variant="primary" disabled={!saved} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
