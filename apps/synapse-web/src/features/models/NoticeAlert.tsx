import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Alert } from '@shadow-library/ui';

import { issueSentence } from '@/features/catalog';
import { Mono } from '@/features/shared';

import { type ModelNotice } from './model-view';
import styles from './Models.module.css';

export interface NoticeAlertProps {
  notice: ModelNotice;
  onDismiss?: () => void;
  className?: string;
}

export function NoticeAlert({ notice, onDismiss, className }: NoticeAlertProps): ReactElement {
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
                  <Mono>{issue.path || '(whole catalog)'}</Mono> {issue.message}
                </li>
              ))}
            </ul>
          </details>
        </>
      ) : null}
    </Alert>
  );
}
