import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Alert } from '@shadow-library/ui';

import { issuePathLabel } from '@/features/catalog/catalog-document';
import { issueSentence } from '@/features/catalog/catalog-issues';

import { Mono } from './cells';
import { type DraftNotice } from './draft-notice';
import styles from './DraftNotice.module.css';

export interface DraftNoticeAlertProps {
  notice: DraftNotice;
  onDismiss?: () => void;
  className?: string;
}

export function DraftNoticeAlert({ notice, onDismiss, className }: DraftNoticeAlertProps): ReactElement {
  const issues = notice.issues ?? [];
  return (
    <Alert intent={notice.intent} title={notice.title} onDismiss={onDismiss} className={className}>
      {notice.body}
      {notice.changesLink ? (
        <>
          {' '}
          <Link to="/changes">Review &amp; publish</Link>
        </>
      ) : null}
      {issues.length > 0 ? (
        <>
          <ul className={styles.issues}>
            {issues.map(issue => (
              <li key={`${issue.path}:${issue.code}:${issue.message}`}>{issueSentence(issue)}</li>
            ))}
          </ul>
          <details className={styles.details}>
            <summary>Technical details</summary>
            <ul className={styles.issues}>
              {issues.map(issue => (
                <li key={`${issue.path}:${issue.code}:${issue.message}`}>
                  <Mono>{issuePathLabel(issue.path)}</Mono> {issue.message}
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : null}
    </Alert>
  );
}
