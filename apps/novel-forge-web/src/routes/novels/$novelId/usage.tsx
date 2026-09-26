import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { useMemo, useState } from 'react';
import { Button, SegmentedControl } from '@shadow-library/ui';

import { PageContainer, PageHeader, QueryState, SectionCard } from '@/components/nf';
import {
  BreakdownTable,
  CardNote,
  ChargeRows,
  EstimateNote,
  QuotaMeter,
  RunCharges,
  StatCard,
  StatGrid,
  StatNote,
  StatValue,
  UsageBars,
  UsageEmpty,
  UsageGrid,
  UsageSplit,
} from '@/features/usage';
import { type CostResponse, projectCostQueryOptions, useProjectCostQuery, useProjectQuery } from '@/lib/apis';
import { projectTitle } from '@/lib/format';
import {
  breakdownRows,
  chargeRows,
  contentModeLabel,
  dayBars,
  formatCompactTokens,
  formatUsd,
  groupLabel,
  isUsagePeriod,
  periodCharge,
  periodFooter,
  periodStart,
  tierLabel,
  USAGE_PERIODS,
  type UsagePeriod,
} from '@/lib/usage';

export const Route = createFileRoute('/novels/$novelId/usage')({
  head: () => ({ meta: [{ title: 'Usage & charges · Novel Forge' }] }),
  loader: ({ context, params }) => context.queryClient.prefetchQuery(projectCostQueryOptions(params.novelId)),
  component: UsageScreen,
});

interface UsageBreakdownsProps {
  novelId: string;
  cost: CostResponse;
  period: UsagePeriod;
}

function UsageBreakdowns({ novelId, cost, period }: UsageBreakdownsProps): React.JSX.Element {
  const navigate = useNavigate();
  const days = useMemo(() => dayBars(cost.byDay, period === 'week' ? 7 : 30, new Date()), [cost.byDay, period]);
  const groups = chargeRows(cost.byGroup, groupLabel);
  const dayCount = period === 'week' ? 7 : 30;
  const charged = days.some(day => day.pct > 0);

  return (
    <UsageGrid>
      <SectionCard title={`Charged per UTC day · last ${dayCount} days`}>
        {charged ? <UsageBars label={`Charged per UTC day, last ${dayCount} days`} items={days} /> : <UsageEmpty chart>Nothing charged in the last {dayCount} days.</UsageEmpty>}
        <UsageSplit title="By job · all time">
          {groups.length === 0 ? <UsageEmpty>No model calls yet.</UsageEmpty> : <ChargeRows label="Charged by job, all time" items={groups} />}
        </UsageSplit>
      </SectionCard>

      <SectionCard
        title="By model · all time"
        action={
          <Button variant="text" size="sm" onClick={() => void navigate({ to: '/novels/$novelId/settings', params: { novelId }, search: { tab: 'models' } })}>
            Defaults in Settings
          </Button>
        }
      >
        {cost.byModel.length === 0 ? (
          <UsageEmpty>No model calls yet.</UsageEmpty>
        ) : (
          <>
            <BreakdownTable heading="Model" rows={breakdownRows(cost.byModel, item => item.label, true)} showTokens flush />
            <BreakdownTable heading="Cost tier" rows={breakdownRows(cost.byTier, item => tierLabel(item.key))} />
            <BreakdownTable heading="Model type" rows={breakdownRows(cost.byContentMode, item => contentModeLabel(item.key))} />
          </>
        )}
        <EstimateNote estimatedCostUsd={cost.estimatedCostUsd} />
      </SectionCard>
    </UsageGrid>
  );
}

function UsageScreen(): React.JSX.Element {
  const { novelId } = Route.useParams();
  const projectQuery = useProjectQuery(novelId);
  const costQuery = useProjectCostQuery(novelId);
  const [period, setPeriod] = useState<UsagePeriod>('week');
  const from = useMemo(() => periodStart(period, new Date()), [period]);

  const project = projectQuery.data;
  const cost = costQuery.data;
  const writing = cost?.byGroup.find(group => group.key === 'writing');

  return (
    <PageContainer>
      <PageHeader
        title="Usage & charges"
        subtitle={`${project ? `${projectTitle(project)} · ` : ''}what each call cost, as charged — the Claude subscription and the other providers alike`}
        extra={
          <SegmentedControl size="sm" aria-label="Period" value={period} onValueChange={value => isUsagePeriod(value) && setPeriod(value)}>
            {USAGE_PERIODS.map(option => (
              <SegmentedControl.Item key={option.value} value={option.value}>
                {option.label}
              </SegmentedControl.Item>
            ))}
          </SegmentedControl>
        }
      />
      <QueryState isLoading={costQuery.isLoading} error={costQuery.error}>
        <>
          {cost && (
            <>
              <StatGrid columns={4}>
                <StatCard label="Charged" footer={<StatNote>{periodFooter(period, cost.estimatedCostUsd)}</StatNote>}>
                  <StatValue value={formatUsd(periodCharge(cost, period))} />
                </StatCard>
                <StatCard label="Writing · all time" footer={<StatNote>{`${(writing?.calls ?? 0).toLocaleString()} calls on drafts, repairs and revisions`}</StatNote>}>
                  <StatValue value={formatUsd(writing?.costUsd ?? 0)} />
                </StatCard>
                <StatCard
                  label="Model calls · all time"
                  footer={<StatNote>{`${formatCompactTokens(cost.inputTokens)} tokens in · ${formatCompactTokens(cost.outputTokens)} out`}</StatNote>}
                >
                  <StatValue value={cost.calls.toLocaleString()} />
                </StatCard>
                <QuotaMeter />
              </StatGrid>
              <UsageBreakdowns novelId={novelId} cost={cost} period={period} />
            </>
          )}
          <SectionCard title="Runs" action={<CardNote>Every chat reply, chapter, review and audit, newest first</CardNote>}>
            <RunCharges key={period} novelId={novelId} from={from} />
          </SectionCard>
        </>
      </QueryState>
    </PageContainer>
  );
}
