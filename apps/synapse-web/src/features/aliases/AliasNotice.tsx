import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Alert } from '@shadow-library/ui';

import { issueSentence } from '@/features/catalog';
import { Mono } from '@/features/shared';

import { type AliasFeedback as Notice } from './alias-view';
import styles from './Aliases.module.css';

export interface AliasNoticeProps {
  notice: Notice;
  onDismiss?: () => void;
  className?: string;
}

export function AliasNotice({ notice, onDismiss, className }: AliasNoticeProps): ReactElement {
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
