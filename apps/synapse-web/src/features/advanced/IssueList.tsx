import { type ReactElement } from 'react';

import { issuePathLabel, issueSentence } from '@/features/catalog';
import { type CatalogIssueResponse } from '@/lib';

import styles from './Advanced.module.css';

export function IssueList({ issues, label }: { issues: readonly CatalogIssueResponse[]; label: string }): ReactElement | null {
  if (issues.length === 0) return null;
  return (
    <ul className={styles.issues} aria-label={label}>
      {issues.map(issue => (
        <li key={`${issue.path}:${issue.code}:${issue.message}`} className={styles.issue}>
          <span>{issueSentence(issue)}</span>
          <span className={styles.issuePath}>{issuePathLabel(issue.path)}</span>
          <span className={styles.issueCode}>{issue.code}</span>
        </li>
      ))}
    </ul>
  );
}
