import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Alert, Badge, Card, EmptyState, Spinner } from '@shadow-library/ui';

import { SectionHeader } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';
import { budgetStatusQueryOptions, isNoActiveCatalog } from '@/lib';

import { type BudgetAttention, budgetAttentionOf } from './budget-attention';
import styles from './Overview.module.css';

const LEVEL_BADGES = {
  at: { intent: 'danger', label: 'At limit' },
  near: { intent: 'warning', label: 'Near limit' },
} as const satisfies Record<BudgetAttention['level'], { intent: 'danger' | 'warning'; label: string }>;

function AttentionList({ items }: { items: readonly BudgetAttention[] }): ReactElement {
  return (
    <ul className={styles.attention}>
      {items.map(item => (
        <li key={item.index} className={styles.attentionItem}>
          <Badge intent={LEVEL_BADGES[item.level].intent} variant="soft" dot>
            {LEVEL_BADGES[item.level].label}
          </Badge>
          <p className={styles.attentionTitle}>{item.title}</p>
          <p className={styles.attentionDetail}>{item.detail}</p>
        </li>
      ))}
    </ul>
  );
}

function AttentionBody(): ReactElement {
  const status = useQuery(budgetStatusQueryOptions());
  if (status.error && isNoActiveCatalog(status.error))
    return <EmptyState size="inline" title="No catalog is live yet" description="Budgets apply once a catalog version is published." />;
  if (status.error)
    return (
      <Alert intent="danger" title="Couldn’t load budgets">
        {status.error.message}
      </Alert>
    );
  if (!status.data)
    return (
      <div className={controls.loading}>
        <Spinner aria-label="Loading budgets" />
      </div>
    );
  const summary = budgetAttentionOf(status.data);
  if (summary.total === 0) return <EmptyState size="inline" title="No budgets are set" description="Without a budget, an app’s AI calls are not limited." />;
  if (summary.items.length === 0)
    return <EmptyState size="inline" title="All budgets are within limits" description="None has used 80% or more of a limit in its current window." />;
  return <AttentionList items={summary.items} />;
}

export function BudgetsNeedingAttention(): ReactElement {
  return (
    <section className={styles.section} aria-label="Budgets needing attention">
      <SectionHeader title="Budgets needing attention" subtitle="Budgets at 80% or more of a limit right now." action={<Link to="/budgets">All budgets</Link>} />
      <Card padding="md">
        <Card.Body>
          <AttentionBody />
        </Card.Body>
      </Card>
    </section>
  );
}
