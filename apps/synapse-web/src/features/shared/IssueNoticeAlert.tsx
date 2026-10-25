import { type ReactElement } from 'react';
import { Alert } from '@shadow-library/ui';

import { issuePathLabel } from '@/features/catalog/catalog-document';
import { issueSentence } from '@/features/catalog/catalog-issues';

import { Mono } from './cells';
import { type IssueNotice } from './issue-notice';
import styles from './IssueNotice.module.css';

export interface IssueNoticeAlertProps {
  notice: IssueNotice;
  onDismiss?: () => void;
  className?: string;
}

export function IssueNoticeAlert({ notice, onDismiss, className }: IssueNoticeAlertProps): ReactElement {
  const issues = notice.issues ?? [];
  return (
    <Alert intent={notice.intent} title={notice.title} onDismiss={onDismiss} className={className}>
      {notice.body}
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
