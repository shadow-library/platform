import { Link, useNavigate, useSearch } from '@tanstack/react-router';
import { type ReactElement, type ReactNode, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, DEFAULT_LOCALE, EmptyState, Input, Progress, SegmentedControl, Skeleton, Statistic, Tag, useMediaQuery } from '@shadow-library/ui';

import { DataState } from '@/components/DataState';
import { SearchIcon } from '@/components/icons';
import {
  categoryById,
  type CurrencyCode,
  type Expense,
  type ExpenseCategory,
  type ExpenseCategoryId,
  expenseTitle,
  type FinanceRange,
  type FinanceSummary,
  formatMinor,
  homeAmountOf,
  minorToMajor,
  type RangeSpend,
  todayISODate,
  unconvertedSubscriptionsNote,
  useExpenses,
  useFinanceSummary,
  useReceiptScanQuota,
} from '@/lib/data';
import { formatLocalDate, formatLocalTime } from '@/lib/format';
import { useDataReadiness } from '@/lib/sync';

import { ExpenseEntryPanel } from './expense-entry-panel';
import { type FinanceSearch } from './finance.search';
import styles from './finance.module.css';

const RANGES: { value: FinanceRange; label: string }[] = [
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

const COMPACT_ABOVE_CHARACTERS = 12;

function moneyFormat(amountMinor: number, currency: CurrencyCode): Intl.NumberFormatOptions {
  const compact = formatMinor(amountMinor, currency).length > COMPACT_ABOVE_CHARACTERS;
  return compact ? { style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 } : { style: 'currency', currency };
}

interface ExpenseRowProps {
  expense: Expense;
  homeCurrency: CurrencyCode;
  categories: ExpenseCategory[];
}

function ExpenseRow({ expense, homeCurrency, categories }: ExpenseRowProps): ReactElement {
  const category = categoryById(expense.categoryId, categories);
  const home = homeAmountOf(expense, homeCurrency);
  const foreign = expense.currency !== homeCurrency;
  const title = expenseTitle(expense, categories);

  return (
    <Link to="/finance/expenses/$expenseId" params={{ expenseId: expense.id }} className={styles.row}>
      <span className={styles.glyph} data-tone={category.tone} aria-hidden>
        {category.glyph}
      </span>
      <span className={styles.rowMain}>
        <span className={styles.rowTitleLine}>
          <span className={styles.rowName} title={title}>
            {title}
          </span>
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
          {formatLocalDate(expense.occurredOnDate)} · {expense.source === 'ocr' ? 'receipt scanned' : 'typed'}
          {expense.receiptRef && expense.source !== 'ocr' ? ' · receipt attached' : ''}
        </span>
      </span>
      <span className={styles.rowAmount}>
        <span className={styles.amount}>{home === null ? formatMinor(expense.amountMinor, expense.currency) : formatMinor(home, homeCurrency)}</span>
        {foreign && <span className={styles.amountSub}>{home === null ? 'Rate pending' : formatMinor(expense.amountMinor, expense.currency)}</span>}
      </span>
    </Link>
  );
}

function spendComparison(spend: RangeSpend): string {
  const delta = spend.spentDeltaFraction;
  if (delta === null) return 'Nothing earlier to compare with yet';
  if (Math.round(delta * 100) === 0) return `About the same as ${spend.comparisonLabel}`;
  const percent = new Intl.NumberFormat(DEFAULT_LOCALE, { style: 'percent', maximumFractionDigits: 0 }).format(Math.abs(delta));
  return `${percent} ${delta < 0 ? 'less' : 'more'} than ${spend.comparisonLabel}`;
}

function subscriptionsKpiNote(summary: FinanceSummary): string {
  const unconverted = unconvertedSubscriptionsNote(summary.unconvertedSubscriptions);
  if (unconverted) return `${summary.activeSubscriptions} active · ${unconverted}`;
  if (summary.nextSubscription)
    return `${summary.activeSubscriptions} active · next ${summary.nextSubscription.name} on ${formatLocalDate(summary.nextSubscription.dueDate, { year: false })}`;
  return `${summary.activeSubscriptions} active`;
}

interface KpiProps {
  label: string;
  amountMinor: number;
  currency: CurrencyCode;
  note: ReactNode;
  compactLayout: boolean;
}

/** Deltas and comparisons are written into the note rather than `Statistic`'s delta row, so every card keeps one height whichever range is on screen. */
function Kpi({ label, amountMinor, currency, note, compactLayout }: KpiProps): ReactElement {
  return (
    <Card padding={compactLayout ? 'sm' : 'md'} className={styles.kpiCard}>
      <Card.Body>
        <div className={styles.kpiStat} title={formatMinor(amountMinor, currency)}>
          <Statistic size={compactLayout ? 'sm' : 'md'} label={label} value={minorToMajor(amountMinor, currency)} format={moneyFormat(amountMinor, currency)} />
        </div>
        <p className={styles.kpiNote}>{note}</p>
      </Card.Body>
    </Card>
  );
}

interface BudgetKpiProps {
  summary: FinanceSummary;
  spend: RangeSpend;
  compactLayout: boolean;
}

function BudgetKpi({ summary, spend, compactLayout }: BudgetKpiProps): ReactElement {
  const { budget } = summary;
  const home = summary.settings.homeCurrency;

  if (budget.kind === 'unset')
    return (
      <Card padding={compactLayout ? 'sm' : 'md'} className={styles.kpiCard}>
        <Card.Body>
          <p className={styles.kpiLabel}>Monthly budget</p>
          <p className={styles.kpiEmpty}>No monthly budget</p>
          <p className={styles.kpiNote}>
            <Link to="/settings" hash="day-and-money" className={styles.inlineLink}>
              Set a budget
            </Link>
          </p>
        </Card.Body>
      </Card>
    );

  const over = budget.leftMinor < 0;
  const monthly = spend.range === 'month';
  const days = `${budget.daysLeft} ${budget.daysLeft === 1 ? 'day' : 'days'} left in the month`;
  return (
    <Kpi
      label={over ? (monthly ? 'Over budget' : 'Over this month’s budget') : monthly ? 'Left of budget' : 'Left of this month’s budget'}
      amountMinor={Math.abs(budget.leftMinor)}
      currency={home}
      note={monthly ? `${formatMinor(budget.spentMinor, home)} of ${formatMinor(budget.budgetMinor, home)} · ${days}` : `Budget is monthly · ${days}`}
      compactLayout={compactLayout}
    />
  );
}

function ReceiptScansCard(): ReactElement {
  const quota = useReceiptScanQuota();

  return (
    <Card padding="md">
      <Card.Body>
        <h2 className={styles.railTitle}>Receipt scans today</h2>
        <DataState query={quota} source="server" size="inline" skeleton={<Skeleton.Card />}>
          {({ cap, used, resetAt }) => {
            const reached = used >= cap;
            const resets = `${formatLocalDate(resetAt, { year: false })}, ${formatLocalTime(resetAt)}`;
            return (
              <>
                <div className={styles.quota}>
                  <span className={styles.quotaValue}>
                    {used} / {cap}
                  </span>
                  <span className={styles.quotaUnit}>scans used</span>
                  {reached && (
                    <Badge variant="soft" intent="danger" size="sm">
                      Limit reached
                    </Badge>
                  )}
                </div>
                <Progress value={Math.min(used, cap)} max={cap} intent={reached ? 'danger' : 'accent'} aria-label="Receipt scans used today" />
                <p className={styles.quotaProse}>
                  {reached
                    ? `Today’s scans are used up — they’re back ${resets}. Typing an expense, or attaching a photo to one, always works.`
                    : `Each receipt scan uses one; typing an expense or attaching a photo doesn’t. The count resets ${resets}.`}
                </p>
              </>
            );
          }}
        </DataState>
      </Card.Body>
    </Card>
  );
}

interface QueuedExpenseAlertProps {
  expense: Expense;
  homeCurrency: CurrencyCode;
  categories: ExpenseCategory[];
}

function QueuedExpenseAlert({ expense, homeCurrency, categories }: QueuedExpenseAlertProps): ReactElement {
  const home = homeAmountOf(expense, homeCurrency);
  const logged = `${formatMinor(home ?? expense.amountMinor, home === null ? expense.currency : homeCurrency)} · ${expenseTitle(expense, categories)}, logged on this device.`;
  return (
    <Alert intent="warning" title="One expense is waiting to sync">
      {home === null ? `${logged} It joins the totals once it syncs and its rate is locked.` : `${logged} It is already counted in the totals above.`}
    </Alert>
  );
}

function MoneySkeleton(): ReactElement {
  return (
    <>
      <div className={styles.kpis}>
        <Skeleton.Card />
        <Skeleton.Card />
        <Skeleton.Card />
        <Skeleton.Card />
      </div>
      <Skeleton.List rows={6} />
    </>
  );
}

function headerMeta(summary: FinanceSummary, range: FinanceRange): string {
  const home = summary.settings.homeCurrency;
  const spend = summary.ranges[range];
  const spent = `${spend.periodLabel} · ${formatMinor(spend.spentMinor, home)}`;
  return range === 'month' && summary.budget.kind === 'set' ? `${spent} of ${formatMinor(summary.budget.budgetMinor, home)}` : spent;
}

interface MoneyOverviewProps {
  summary: FinanceSummary;
  today: string;
  range: FinanceRange;
  onRangeChange: (range: FinanceRange) => void;
  categoryId?: ExpenseCategoryId;
}

function MoneyOverview({ summary, today, range, onRangeChange, categoryId }: MoneyOverviewProps): ReactElement {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [entryOpen, setEntryOpen] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);

  const closeEntry = (): void => {
    setEntryOpen(false);
    addButton.current?.focus();
  };
  const removeCategoryFilter = (): void => {
    void navigate({ to: '/finance', search: {} });
    searchInput.current?.focus();
  };
  const compactLayout = useMediaQuery('(max-width: 619px)');
  const expenses = useExpenses({ range, search, categoryId, limit: 8 });

  const { settings, categories } = summary;
  const home = settings.homeCurrency;
  const spend = summary.ranges[range];
  const page = expenses.data;
  const filteredCategory = categoryId ? categoryById(categoryId, categories) : null;

  return (
    <>
      <div className={styles.kpis}>
        <Kpi label={`Spent ${spend.periodLabel.toLowerCase()}`} amountMinor={spend.spentMinor} currency={home} note={spendComparison(spend)} compactLayout={compactLayout} />
        <BudgetKpi summary={summary} spend={spend} compactLayout={compactLayout} />
        <Kpi label="Subscriptions a month" amountMinor={summary.subscriptionsMonthlyMinor} currency={home} note={subscriptionsKpiNote(summary)} compactLayout={compactLayout} />
        <Kpi
          label="Average day"
          amountMinor={spend.averageDayMinor}
          currency={home}
          note={`${spend.daysLogged} ${spend.daysLogged === 1 ? 'day' : 'days'} logged`}
          compactLayout={compactLayout}
        />
      </div>

      <div className={styles.split}>
        <div className={styles.column}>
          {entryOpen && <ExpenseEntryPanel today={today} settings={settings} rates={summary.latestRates} categories={categories} onClose={closeEntry} />}

          <Card padding="md">
            <Card.Body>
              <div className={styles.cardHead}>
                <h2 className={styles.cardTitle}>Expenses</h2>
                <div className={styles.controls}>
                  {filteredCategory && (
                    <Tag size="sm" onRemove={removeCategoryFilter}>
                      {filteredCategory.name}
                    </Tag>
                  )}
                  <Input
                    ref={searchInput}
                    className={styles.search}
                    size="sm"
                    placeholder="Search notes and merchants"
                    aria-label="Search expense notes and merchants"
                    prefix={<SearchIcon size={14} />}
                    value={search}
                    onValueChange={setSearch}
                    clearable
                  />
                  <SegmentedControl size="sm" value={range} onValueChange={value => onRangeChange(value as FinanceRange)} aria-label="Range">
                    {RANGES.map(item => (
                      <SegmentedControl.Item key={item.value} value={item.value}>
                        {item.label}
                      </SegmentedControl.Item>
                    ))}
                  </SegmentedControl>
                  <Button ref={addButton} size="sm" variant="primary" onClick={() => setEntryOpen(true)} aria-expanded={entryOpen}>
                    Add expense
                  </Button>
                </div>
              </div>

              {!page && <Skeleton.List rows={6} />}

              {page && page.items.length === 0 && (
                <EmptyState
                  size="inline"
                  title={
                    search ? `Nothing matches “${search}”` : filteredCategory ? `No ${filteredCategory.name.toLowerCase()} expenses in this range` : 'No expenses in this range'
                  }
                  description={search ? 'Try a shorter word, or widen the range.' : 'Add one when you spend something. Ten seconds is the whole cost.'}
                  action={{ label: 'Add expense', onClick: () => setEntryOpen(true) }}
                />
              )}

              {page?.items.map(expense => (
                <ExpenseRow key={expense.id} expense={expense} homeCurrency={page.homeCurrency} categories={categories} />
              ))}

              {page && page.items.length > 0 && (
                <div className={styles.listFoot}>
                  <span className={styles.footNote}>
                    Showing {page.shown} of {page.total} in {page.periodLabel.toLowerCase()}
                  </span>
                  <Button size="sm" variant="ghost" asChild>
                    <Link to="/history">All in History</Link>
                  </Button>
                </div>
              )}
            </Card.Body>
          </Card>

          <Card padding="md">
            <Card.Body>
              <div className={styles.cardHead}>
                <h2 className={styles.cardTitle}>Where it went</h2>
                <Button size="sm" variant="ghost" asChild>
                  <Link to="/finance/categories">Manage categories</Link>
                </Button>
              </div>
              <div className={styles.breakdown}>
                {spend.categories.map(slice => (
                  <div key={slice.category.id}>
                    <div className={styles.breakdownHead}>
                      <span className={styles.breakdownName}>
                        {slice.category.name} <span className={styles.breakdownCount}>· {slice.count}</span>
                      </span>
                      <span className={styles.breakdownAmount}>{formatMinor(slice.totalMinor, home)}</span>
                    </div>
                    <div className={styles.track}>
                      <span className={styles.fill} style={{ width: `${slice.totalMinor > 0 ? Math.max(slice.percentOfLargest, 2) : 0}%` }} />
                    </div>
                  </div>
                ))}
                {spend.categories.length === 0 && <p className={styles.railProse}>Nothing logged in this range yet.</p>}
              </div>
            </Card.Body>
          </Card>
        </div>

        <div className={styles.column}>
          {summary.queuedExpense && <QueuedExpenseAlert expense={summary.queuedExpense} homeCurrency={home} categories={categories} />}

          <Card padding="md">
            <Card.Body>
              <div className={styles.cardHead}>
                <h2 className={styles.railTitle}>Subscriptions</h2>
                <Button size="sm" variant="ghost" asChild>
                  <Link to="/finance/subscriptions">All {summary.activeSubscriptions}</Link>
                </Button>
              </div>
              <p className={styles.railProse}>
                {formatMinor(summary.subscriptionsMonthlyMinor, home)} a month across everything active. Nothing is ever charged for you — each cycle waits for your confirmation.
              </p>
            </Card.Body>
          </Card>

          <Card padding="md">
            <Card.Body>
              <h2 className={styles.railTitle}>Multi-currency</h2>
              <p className={styles.railProse}>
                Your base currency is {home}. Foreign spend is stored in the original currency and converted at the rate on the day — the original is never overwritten.
              </p>
              {spend.fxRates.length > 0 && (
                <ul className={styles.railList} aria-label={`Rates used ${spend.periodLabel.toLowerCase()}`}>
                  {spend.fxRates.map(rate => (
                    <li key={`${rate.from}-${rate.rate}`} className={styles.railRow}>
                      <span className={styles.railRowName}>
                        {rate.from} → {rate.to} <span className={styles.railRowWhen}>· {formatLocalDate(rate.date, { year: false })}</span>
                      </span>
                      <span className={styles.mono}>{rate.rate.toFixed(4)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card.Body>
          </Card>

          <ReceiptScansCard />
        </div>
      </div>
    </>
  );
}

export function ExpensesScreen(): ReactElement {
  const [range, setRange] = useState<FinanceRange>('month');
  const { category: categoryId } = useSearch({ strict: false }) as Partial<FinanceSearch>;
  const summary = useFinanceSummary();
  const { readiness } = useDataReadiness({ query: summary });
  const meta = readiness.kind === 'ready' && summary.data ? headerMeta(summary.data, range) : null;

  return (
    <section className={styles.screen} aria-labelledby="money-title">
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title} id="money-title">
            Money
          </h1>
          {meta && (
            <p className={styles.meta} title={meta}>
              {meta}
            </p>
          )}
        </div>
      </header>

      <DataState query={summary} skeleton={<MoneySkeleton />}>
        {view => <MoneyOverview summary={view} today={todayISODate()} range={range} onRangeChange={setRange} categoryId={categoryId} />}
      </DataState>
    </section>
  );
}
