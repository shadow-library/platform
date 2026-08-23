import { Link } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Alert, Badge, Button, Card, EmptyState, Input, Progress, SegmentedControl, Skeleton, Statistic, Tag } from '@shadow-library/ui';

import { SearchIcon } from '@/components/icons';
import { categoryById, type CurrencyCode, type Expense, type FinanceRange, formatMinor, minorToMajor, todayISODate, useExpenses, useFinanceSummary } from '@/lib/data';

import { ExpenseEntryPanel } from './expense-entry-panel';
import styles from './finance.module.css';

const RANGES: { value: FinanceRange; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

function ExpenseRow({ expense, homeCurrency }: { expense: Expense; homeCurrency: CurrencyCode }): ReactElement {
  const category = categoryById(expense.categoryId);
  const home = expense.homeAmountMinor;
  const foreign = expense.currency !== homeCurrency;

  return (
    <Link to="/finance/expenses/$expenseId" params={{ expenseId: expense.id }} className={styles.row}>
      <span className={styles.glyph} aria-hidden>
        {category.glyph}
      </span>
      <span className={styles.rowMain}>
        <span className={styles.rowTitleLine}>
          <span className={styles.rowName}>{expense.note ?? expense.merchant ?? 'Expense'}</span>
          <Tag size="sm">{category.name}</Tag>
          {expense.syncState === 'queued' && (
            <Badge variant="outline" size="sm">
              Queued
            </Badge>
          )}
          {expense.linkedQuestTitle && (
            <Badge variant="outline" size="sm">
              {expense.linkedQuestTitle}
            </Badge>
          )}
        </span>
        <span className={styles.rowMeta}>
          {expense.occurredOnDate} · {expense.source === 'ocr' ? 'receipt scanned' : 'typed'}
        </span>
      </span>
      <span className={styles.rowAmount}>
        <span className={styles.amount}>{home === null ? '—' : formatMinor(home, homeCurrency)}</span>
        {foreign && <span className={styles.amountSub}>{formatMinor(expense.amountMinor, expense.currency)}</span>}
      </span>
    </Link>
  );
}

export function ExpensesScreen(): ReactElement {
  const today = todayISODate();
  const [range, setRange] = useState<FinanceRange>('month');
  const [search, setSearch] = useState('');
  const [entryOpen, setEntryOpen] = useState(false);

  const summary = useFinanceSummary(range);
  const expenses = useExpenses({ range, search, limit: 8 });

  const home = summary.data?.homeCurrency ?? 'EUR';

  return (
    <section className={styles.screen} aria-labelledby="money-title">
      <header className={styles.header}>
        <div>
          <h1 className={styles.title} id="money-title">
            Money
          </h1>
          <p className={styles.meta}>
            {summary.data
              ? `${summary.data.periodLabel} · ${formatMinor(summary.data.spentMinor, home)}${summary.data.budgetMinor === null ? '' : ` of ${formatMinor(summary.data.budgetMinor, home)}`}`
              : 'Loading the period'}
          </p>
        </div>
      </header>

      <div className={styles.kpis}>
        {summary.isLoading || !summary.data ? (
          <Skeleton.Card />
        ) : (
          <>
            <Card padding="md">
              <div className={styles.pad}>
                <Statistic
                  label={`Spent ${summary.data.periodLabel.toLowerCase()}`}
                  value={minorToMajor(summary.data.spentMinor, home)}
                  format={{ style: 'currency', currency: home }}
                  delta={summary.data.spentDeltaFraction ?? undefined}
                  positiveIs="down"
                  comparison={summary.data.comparisonLabel || undefined}
                />
              </div>
            </Card>
            <Card padding="md">
              <div className={styles.pad}>
                <Statistic
                  label="Left of budget"
                  value={minorToMajor(summary.data.budgetLeftMinor ?? 0, home)}
                  format={{ style: 'currency', currency: home }}
                  comparison={summary.data.budgetMinor === null ? 'No budget set for this range' : `${summary.data.daysRemaining} days remaining`}
                />
              </div>
            </Card>
            <Card padding="md">
              <div className={styles.pad}>
                <Statistic
                  label="Subscriptions"
                  value={minorToMajor(summary.data.subscriptionsMonthlyMinor, home)}
                  format={{ style: 'currency', currency: home }}
                  comparison={`${summary.data.activeSubscriptions} active · ${summary.data.nextSubscriptionLabel}`}
                />
              </div>
            </Card>
            <Card padding="md">
              <div className={styles.pad}>
                <Statistic
                  label="Average day"
                  value={minorToMajor(summary.data.averageDayMinor, home)}
                  format={{ style: 'currency', currency: home }}
                  comparison={`${summary.data.daysLogged} days logged`}
                />
              </div>
            </Card>
          </>
        )}
      </div>

      <div className={styles.split}>
        <div className={styles.column}>
          <Card padding="md">
            <div className={styles.pad}>
              <div className={styles.cardHead}>
                <h2 className={styles.cardTitle}>Expenses</h2>
                <div className={styles.controls}>
                  <Input
                    className={styles.search}
                    size="sm"
                    placeholder="Search notes"
                    aria-label="Search expense notes"
                    prefix={<SearchIcon size={14} />}
                    value={search}
                    onValueChange={setSearch}
                    clearable
                  />
                  <SegmentedControl size="sm" value={range} onValueChange={value => setRange(value as FinanceRange)} aria-label="Range">
                    {RANGES.map(item => (
                      <SegmentedControl.Item key={item.value} value={item.value}>
                        {item.label}
                      </SegmentedControl.Item>
                    ))}
                  </SegmentedControl>
                  <Button size="sm" variant="primary" onClick={() => setEntryOpen(true)}>
                    Add expense
                  </Button>
                </div>
              </div>

              {expenses.isLoading && <Skeleton.List rows={6} />}

              {expenses.data && expenses.data.items.length === 0 && (
                <EmptyState
                  size="inline"
                  title={search ? `Nothing matches “${search}”` : 'No expenses in this range'}
                  description={search ? 'Try a shorter word, or widen the range.' : 'Add one when you spend something. Ten seconds is the whole cost.'}
                  action={{ label: 'Add expense', onClick: () => setEntryOpen(true) }}
                />
              )}

              {expenses.data?.items.map(expense => (
                <ExpenseRow key={expense.id} expense={expense} homeCurrency={expenses.data.homeCurrency} />
              ))}

              {expenses.data && expenses.data.items.length > 0 && (
                <div className={styles.listFoot}>
                  <span className={styles.footNote}>
                    Showing {expenses.data.shown} of {expenses.data.total} in {expenses.data.periodLabel.toLowerCase()}
                  </span>
                  <Button size="sm" variant="ghost" asChild>
                    <Link to="/history">All in History</Link>
                  </Button>
                </div>
              )}
            </div>
          </Card>

          {entryOpen && <ExpenseEntryPanel today={today} onClose={() => setEntryOpen(false)} />}

          <Card padding="md">
            <div className={styles.pad}>
              <div className={styles.cardHead}>
                <h2 className={styles.cardTitle}>Where it went</h2>
                <Button size="sm" variant="ghost" asChild>
                  <Link to="/finance/categories">Manage categories</Link>
                </Button>
              </div>
              <div className={styles.breakdown}>
                {summary.data?.categories.map(slice => (
                  <div key={slice.category.id}>
                    <div className={styles.breakdownHead}>
                      <span>
                        {slice.category.name} <span className={styles.breakdownCount}>· {slice.count}</span>
                      </span>
                      <span className={styles.breakdownAmount}>{formatMinor(slice.totalMinor, home)}</span>
                    </div>
                    <div className={styles.track}>
                      <span className={styles.fill} style={{ width: `${slice.percentOfLargest}%` }} />
                    </div>
                  </div>
                ))}
                {summary.data?.categories.length === 0 && <p className={styles.railProse}>Nothing logged in this range yet.</p>}
              </div>
            </div>
          </Card>
        </div>

        <div className={styles.column}>
          {summary.data?.queuedExpense && (
            <Alert intent="warning" title="One expense is waiting to sync">
              {formatMinor(summary.data.queuedExpense.homeAmountMinor ?? summary.data.queuedExpense.amountMinor, home)} {summary.data.queuedExpense.note}, logged on this device. It
              is already counted in the totals above.
            </Alert>
          )}

          <Card padding="md">
            <div className={styles.pad}>
              <div className={styles.cardHead}>
                <h2 className={styles.railTitle}>Subscriptions</h2>
                <Button size="sm" variant="ghost" asChild>
                  <Link to="/finance/subscriptions">All {summary.data?.activeSubscriptions ?? 0}</Link>
                </Button>
              </div>
              <p className={styles.railProse}>
                {formatMinor(summary.data?.subscriptionsMonthlyMinor ?? 0, home)} a month across everything active. Nothing is ever charged for you — each cycle waits for your
                confirmation.
              </p>
            </div>
          </Card>

          <Card padding="md">
            <div className={styles.pad}>
              <h2 className={styles.railTitle}>Multi-currency</h2>
              <p className={styles.railProse}>
                Your base currency is {home}. Foreign spend is stored in the original currency and converted at the rate on the day — the original is never overwritten.
              </p>
              <ul className={styles.railList}>
                {summary.data?.fxRates.map(rate => (
                  <li key={`${rate.from}-${rate.to}`} className={styles.railRow}>
                    <span className={styles.railRowName}>
                      {rate.from} → {rate.to}
                    </span>
                    <span className={styles.mono}>{rate.rate.toFixed(4)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card padding="md">
            <div className={styles.pad}>
              <h2 className={styles.railTitle}>Receipt scans today</h2>
              <div className={styles.quota}>
                <span className={styles.quotaValue}>
                  {summary.data?.receiptScansUsed ?? 0} / {summary.data?.receiptScanLimit ?? 10}
                </span>
                <span className={styles.quotaUnit}>scans used</span>
              </div>
              <Progress value={summary.data?.receiptScansUsed ?? 0} max={summary.data?.receiptScanLimit ?? 10} aria-label="Receipt scans used today" />
              <p className={styles.railProse}>Scanning is a convenience — expenses can always be typed. The count resets {summary.data?.receiptQuotaResetsOn ?? 'tomorrow'}.</p>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
