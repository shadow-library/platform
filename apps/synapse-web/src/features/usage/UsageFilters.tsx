import { useNavigate } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Button, type DateRange, DateRangePicker, FormField, SegmentedControl, Select } from '@shadow-library/ui';

import { type TaskEntry } from '@/features/catalog';
import { appName } from '@/features/shared';

import { COST_BASES, COST_BASIS_LABELS, type CostBasis } from './usage-report';
import styles from './Usage.module.css';
import {
  costBasisOf,
  filterApps,
  filterTasks,
  isReportableRange,
  MAX_USAGE_RANGE_DAYS,
  pickerRangeOf,
  searchRangeOf,
  USAGE_GROUP_LABELS,
  USAGE_GROUPS,
  type UsageGroup,
  usageRangePresets,
  type UsageSearch,
  utcToday,
  withApp,
  withBasis,
  withRange,
  withTask,
} from './usage-search';

interface UsageFiltersProps {
  search: UsageSearch;
  tasks: readonly TaskEntry[];
  reportLastDay: string | null;
}

const ALL = '[all]';

export function UsageFilters({ search, tasks, reportLastDay }: UsageFiltersProps): ReactElement {
  const navigate = useNavigate();
  const [today] = useState(() => utcToday(new Date()));
  const [tooLong, setTooLong] = useState(false);
  const show = (next: UsageSearch): void => {
    setTooLong(false);
    void navigate({ to: '/usage', search: next });
  };
  const pick = (range: DateRange): void => {
    const next = withRange(search, searchRangeOf(range));
    if (next.from && !isReportableRange(next.from, next.to, new Date())) return setTooLong(true);
    show(next);
  };
  const apps = filterApps(tasks, search.app);
  const basis = costBasisOf(search);
  const features = filterTasks(tasks, search.app, search.task);

  return (
    <div className={styles.filters} role="group" aria-label="Usage filters">
      <FormField label="Range" helper="Whole days, UTC" error={tooLong ? `Pick at most ${MAX_USAGE_RANGE_DAYS} days` : undefined} className={styles.range}>
        <DateRangePicker
          value={pickerRangeOf(search, reportLastDay)}
          onValueChange={pick}
          presets={usageRangePresets(today)}
          max={today}
          confirm
          placeholder="Default: last 30 days"
        />
      </FormField>
      <FormField label="App" className={styles.field}>
        <Select value={search.app ?? ALL} onValueChange={value => show(withApp(search, value === ALL ? undefined : value))} aria-label="Only show this app">
          <Select.Item value={ALL}>All apps</Select.Item>
          {apps.map(app => (
            <Select.Item key={app} value={app}>
              {appName(app)}
            </Select.Item>
          ))}
        </Select>
      </FormField>
      <FormField label="Feature" className={styles.feature}>
        <Select value={search.task ?? ALL} onValueChange={value => show(withTask(search, value === ALL ? undefined : value))} aria-label="Only show this feature">
          <Select.Item value={ALL}>{search.app ? `All ${appName(search.app)} features` : 'All features'}</Select.Item>
          {features.map(feature => (
            <Select.Item key={feature.key} value={feature.key} description={feature.key}>
              {feature.title}
            </Select.Item>
          ))}
        </Select>
      </FormField>
      <FormField label="Group by" className={styles.segments}>
        <SegmentedControl value={search.groupBy} onValueChange={value => show({ ...search, groupBy: value as UsageGroup })} aria-label="Group usage by">
          {USAGE_GROUPS.map(group => (
            <SegmentedControl.Item key={group} value={group}>
              {USAGE_GROUP_LABELS[group]}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl>
      </FormField>
      <FormField label="Cost" className={styles.segments}>
        <SegmentedControl value={basis} onValueChange={value => show(withBasis(search, value as CostBasis))} aria-label="Cost shown in the chart and table">
          {COST_BASES.map(option => (
            <SegmentedControl.Item key={option} value={option}>
              {COST_BASIS_LABELS[option]}
            </SegmentedControl.Item>
          ))}
        </SegmentedControl>
      </FormField>
      {search.from || search.to ? (
        <Button type="button" variant="secondary" className={styles.reset} onClick={() => show(withRange(search, {}))}>
          Default range
        </Button>
      ) : null}
    </div>
  );
}
