import { Navigate } from '@tanstack/react-router';
import { type ReactElement } from 'react';

import { PageHeader, PermissionGate } from '@/features/shared';
import { useAccessCheck, useCapabilities } from '@/lib';

import { BudgetsNeedingAttention } from './BudgetsNeedingAttention';
import { DailySpendChart } from './DailySpendChart';
import styles from './Overview.module.css';
import { type OverviewPeriods } from './overview-periods';
import { SpendKpis } from './SpendKpis';
import { TopFeatures } from './TopFeatures';

export function OverviewScreen({ periods }: { periods: OverviewPeriods }): ReactElement {
  const capabilities = useCapabilities();
  const access = useAccessCheck();
  if (access.status === 'known' && !capabilities.readUsage && capabilities.readCatalog) return <Navigate to="/features" replace />;
  return (
    <PermissionGate allowed={capabilities.readUsage} area="spend reports" homeLink={false}>
      <PageHeader title="Overview" subtitle="What the platform spends on AI this month, where it goes, and which budgets are close to their limit. Days and months are UTC." />
      <SpendKpis month={periods.month} />
      <DailySpendChart today={periods.today} />
      <div className={styles.columns}>
        <TopFeatures today={periods.today} readCatalog={capabilities.readCatalog} />
        <BudgetsNeedingAttention />
      </div>
    </PermissionGate>
  );
}
