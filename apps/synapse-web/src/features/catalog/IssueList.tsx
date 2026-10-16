import { type ReactElement } from 'react';

import { type CatalogIssueResponse } from '@/lib';

import { issuePathLabel } from './catalog-document';
import styles from './Catalog.module.css';

export function IssueList({ issues, label }: { issues: readonly CatalogIssueResponse[]; label: string }): ReactElement | null {
  if (issues.length === 0) return null;
  return (
    <ul className={styles.issues} aria-label={label}>
      {issues.map(issue => (
        <li key={`${issue.path}:${issue.code}:${issue.message}`} className={styles.issue}>
          <span className={styles.issuePath}>{issuePathLabel(issue.path)}</span>
          <span>{issue.message}</span>
          <span className={styles.issueCode}>{issue.code}</span>
        </li>
      ))}
    </ul>
  );
}
