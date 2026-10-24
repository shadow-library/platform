import { type ReactElement } from 'react';
import { Accordion } from '@shadow-library/ui';

import { issueSentence } from '@/features/catalog/catalog-issues';
import { type CatalogIssueResponse } from '@/lib';

import styles from './Budgets.module.css';

const issueKey = (issue: CatalogIssueResponse): string => `${issue.path}:${issue.code}:${issue.message}`;

export function BudgetIssues({ issues }: { issues: readonly CatalogIssueResponse[] }): ReactElement | null {
  if (issues.length === 0) return null;
  return (
    <>
      <ul className={styles.issues}>
        {issues.map(issue => (
          <li key={issueKey(issue)}>{issueSentence(issue)}</li>
        ))}
      </ul>
      <Accordion type="single" collapsible>
        <Accordion.Item value="technical" title="Technical details">
          <ul className={styles.technical}>
            {issues.map(issue => (
              <li key={issueKey(issue)}>
                {issue.path} · {issue.code}
              </li>
            ))}
          </ul>
        </Accordion.Item>
      </Accordion>
    </>
  );
}
