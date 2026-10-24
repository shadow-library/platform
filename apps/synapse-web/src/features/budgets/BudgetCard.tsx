import { type ReactElement } from 'react';
import { Accordion, Badge, Button, Card, Progress, Table, type TableColumn } from '@shadow-library/ui';

import { CostLabel, formatNumber, formatUsd, Mono, Muted } from '@/features/shared';
import controls from '@/features/shared/controls.module.css';

import styles from './Budgets.module.css';
import { type BudgetCardView, type BudgetUsageView, type LimitLevel, type Meter, type SubjectRow } from './budget-view';

export interface BudgetCardActions {
  onEdit: () => void;
  onRemove: () => void;
  removing: boolean;
}

const MAX_PERCENT = 100;

const LEVEL_BADGES: Readonly<Record<Exclude<LimitLevel, 'clear'>, { intent: 'danger' | 'warning'; label: string }>> = {
  at: { intent: 'danger', label: 'At limit' },
  near: { intent: 'warning', label: 'Near limit' },
};

const UNAVAILABLE_TEXT = {
  failed: 'Live usage couldn’t be loaded.',
  pending: 'Live usage for this budget appears within a minute of the change going live.',
} as const;

function LevelBadge({ level }: { level: LimitLevel }): ReactElement | null {
  if (level === 'clear') return null;
  const badge = LEVEL_BADGES[level];
  return (
    <Badge intent={badge.intent} variant="soft" dot>
      {badge.label}
    </Badge>
  );
}

function MeterBar({ meter }: { meter: Meter }): ReactElement {
  const name = meter.measure === 'cost' ? 'API-price cost' : 'Calls';
  return (
    <div className={styles.meter}>
      <div className={styles.meterRow}>
        {meter.measure === 'cost' ? <CostLabel kind="list" /> : <span>Calls</span>}
        <span className={controls.tabular}>{meter.text}</span>
      </div>
      <Progress value={Math.min(meter.percent, MAX_PERCENT)} intent={meter.intent} aria-label={`${name}: ${meter.text}`} />
    </div>
  );
}

const SUBJECT_COLUMNS: TableColumn<SubjectRow>[] = [
  {
    id: 'subject',
    header: 'User id',
    cell: row => (
      <span className={styles.stack}>
        <Mono>{row.subjectId}</Mono>
        {row.appCounter ? <Muted>The app’s own counter</Muted> : null}
      </span>
    ),
  },
  { id: 'cost', header: <CostLabel kind="list" />, align: 'end', cell: row => <span className={controls.tabular}>{formatUsd(row.listCostUsd)}</span> },
  { id: 'calls', header: 'Calls', align: 'end', cell: row => <span className={controls.tabular}>{formatNumber(row.calls)}</span> },
  {
    id: 'share',
    header: 'Of the limit',
    align: 'end',
    cell: row => (
      <span className={styles.share}>
        <Progress className={styles.miniBar} value={Math.min(row.percent, MAX_PERCENT)} intent={row.intent} aria-label={`${row.percent}% of the limit`} />
        <span className={controls.tabular}>{row.percent}%</span>
      </span>
    ),
  },
];

function UsageSection({ usage }: { usage: BudgetUsageView }): ReactElement {
  if (usage.kind === 'unavailable') return <p className={styles.note}>{UNAVAILABLE_TEXT[usage.reason]}</p>;
  if (usage.kind === 'app')
    return (
      <div className={styles.meters}>
        {usage.meters.map(meter => (
          <MeterBar key={meter.measure} meter={meter} />
        ))}
      </div>
    );
  return (
    <>
      <p className={styles.summary}>{usage.summary}</p>
      {usage.rows.length > 0 ? (
        <Accordion type="single" collapsible>
          <Accordion.Item value="top" title="Top users" meta={formatNumber(usage.rows.length)}>
            <Table data={usage.rows} columns={SUBJECT_COLUMNS} rowKey="key" aria-label="Users with the most API-price cost in this window" />
          </Accordion.Item>
        </Accordion>
      ) : null}
      {usage.appCounterShown ? (
        <p className={styles.note}>
          The app’s own counter holds calls made for the app itself. When a whole-app budget for this window is removed, its total also stays here, reading as one user, until the
          window ends.
        </p>
      ) : null}
    </>
  );
}

export function BudgetCard({ card, actions }: { card: BudgetCardView; actions?: BudgetCardActions }): ReactElement {
  return (
    <Card padding="md">
      <Card.Header title={card.title} action={<LevelBadge level={card.level} />} />
      <Card.Body className={styles.cardBody}>
        <p className={styles.facts}>
          <span>Limit: {card.limits}</span>
          {card.resets ? <span>Resets {card.resets}</span> : null}
        </p>
        <UsageSection usage={card.usage} />
      </Card.Body>
      {actions ? (
        <Card.Footer className={styles.actions}>
          <Button variant="ghost" size="sm" aria-label={`Edit the budget ${card.title}`} disabled={actions.removing} onClick={actions.onEdit}>
            Edit
          </Button>
          <Button variant="ghost" size="sm" aria-label={`Remove the budget ${card.title}`} loading={actions.removing} onClick={actions.onRemove}>
            Remove
          </Button>
        </Card.Footer>
      ) : null}
    </Card>
  );
}
