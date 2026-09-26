import { createFileRoute, Link } from '@tanstack/react-router';
import { useMemo } from 'react';

import { PageContainer, PageHeader, QueryState, SectionCard } from '@/components/nf';
import { BreakdownTable, ChargeRows, EstimateNote, QuotaMeter, StatCard, StatGrid, StatNote, StatValue, UsageBars, UsageEmpty, UsageGrid, UsageSplit } from '@/features/usage';
import { accountUsageQueryOptions, type AccountUsageResponse, useAccountUsageQuery } from '@/lib/apis';
import { type BreakdownRow, breakdownRows, chargeRows, contentModeLabel, dayBars, estimateFooter, formatCompactTokens, formatUsd, groupLabel, tierLabel } from '@/lib/usage';

export const Route = createFileRoute('/_app/usage')({
  head: () => ({ meta: [{ title: 'Usage & charges · Novel Forge' }] }),
  loader: ({ context }) => context.queryClient.prefetchQuery(accountUsageQueryOptions()),
  component: AccountUsageScreen,
});

function novelRows(usage: AccountUsageResponse): BreakdownRow[] {
  return usage.byProject.map(project => ({
    key: project.projectId,
    label: (
      <Link to="/novels/$novelId/usage" params={{ novelId: project.projectId }}>
        {project.title || `Untitled novel #${project.projectId}`}
      </Link>
    ),
    calls: project.calls,
    costUsd: project.costUsd,
  }));
}

interface AccountUsageBodyProps {
  usage: AccountUsageResponse;
}

function AccountUsageBody({ usage }: AccountUsageBodyProps): React.JSX.Element {
  const days = useMemo(() => dayBars(usage.byDay, 30, new Date()), [usage.byDay]);
  const groups = chargeRows(usage.byGroup, groupLabel);
  const charged = days.some(day => day.pct > 0);

  return (
    <>
      <StatGrid columns={4}>
        <StatCard label="Charged · all time" footer={<StatNote>{estimateFooter('Every novel you own', usage.estimatedCostUsd)}</StatNote>}>
          <StatValue value={formatUsd(usage.totalCostUsd)} />
        </StatCard>
        <StatCard
          label="Last 30 days"
          footer={<StatNote>{`${formatUsd(usage.last7DaysCostUsd)} in the last 7 days${usage.estimatedCostUsd > 0 ? ' · may include estimates' : ''}`}</StatNote>}
        >
          <StatValue value={formatUsd(usage.last30DaysCostUsd)} />
        </StatCard>
        <StatCard
          label="Model calls · all time"
          footer={<StatNote>{`${formatCompactTokens(usage.inputTokens)} tokens in · ${formatCompactTokens(usage.outputTokens)} out`}</StatNote>}
        >
          <StatValue value={usage.calls.toLocaleString()} />
        </StatCard>
        <QuotaMeter />
      </StatGrid>

      <UsageGrid>
        <SectionCard title="Charged per UTC day · last 30 days">
          {charged ? <UsageBars label="Charged per UTC day, last 30 days" items={days} /> : <UsageEmpty chart>Nothing charged in the last 30 days.</UsageEmpty>}
          <UsageSplit title="By job · all time">
            {groups.length === 0 ? <UsageEmpty>No model calls yet.</UsageEmpty> : <ChargeRows label="Charged by job, all time" items={groups} />}
          </UsageSplit>
        </SectionCard>

        <SectionCard title="By novel · all time">
          {usage.byProject.length === 0 ? (
            <UsageEmpty>None of your novels has made a model call yet.</UsageEmpty>
          ) : (
            <BreakdownTable heading="Novel" rows={novelRows(usage)} flush />
          )}
        </SectionCard>
      </UsageGrid>

      <SectionCard title="By model · all time">
        {usage.byModel.length === 0 ? (
          <UsageEmpty>No model calls yet.</UsageEmpty>
        ) : (
          <>
            <BreakdownTable heading="Model" rows={breakdownRows(usage.byModel, item => item.label, true)} showTokens flush />
            <BreakdownTable heading="Cost tier" rows={breakdownRows(usage.byTier, item => tierLabel(item.key))} />
            <BreakdownTable heading="Model type" rows={breakdownRows(usage.byContentMode, item => contentModeLabel(item.key))} />
          </>
        )}
        <EstimateNote estimatedCostUsd={usage.estimatedCostUsd} />
      </SectionCard>
    </>
  );
}

function AccountUsageScreen(): React.JSX.Element {
  const usageQuery = useAccountUsageQuery();

  return (
    <PageContainer>
      <PageHeader title="Usage & charges" subtitle="Every novel you own · what each call cost, as charged — the Claude subscription and the other providers alike" />
      <QueryState isLoading={usageQuery.isLoading} error={usageQuery.error} isEmpty={!usageQuery.data} emptyTitle="No usage to show">
        <>{usageQuery.data && <AccountUsageBody usage={usageQuery.data} />}</>
      </QueryState>
    </PageContainer>
  );
}
