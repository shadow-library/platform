import { useNavigate } from '@tanstack/react-router';
import { type ReactElement, useRef, useState } from 'react';
import { Badge, Button, Card, ConfirmDialog, DescriptionList, EmptyState, Input, Skeleton, Tag, toast } from '@shadow-library/ui';

import { DataState } from '@/components/DataState';
import {
  categoryById,
  describeAuditEntry,
  type ExpenseDetail,
  expenseTitle,
  type ExpenseView,
  formatMinor,
  homeAmountOf,
  outcomeToast,
  sortAuditNewestFirst,
  todayISODate,
  useExpense,
  useFinanceCommand,
} from '@/lib/data';
import { formatLocalDate, formatLocalTime } from '@/lib/format';
import { useDataReadiness, uuidv7 } from '@/lib/sync';

import { ExpenseEntryPanel } from './expense-entry-panel';
import styles from './finance.module.css';
import { ReceiptViewer } from './receipt-viewer';

export interface ExpenseDetailScreenProps {
  expenseId: string;
}

function auditTime(at: string, today: string): string {
  const date = formatLocalDate(at, { year: at.slice(0, 4) !== today.slice(0, 4) });
  return date ? `${date}, ${formatLocalTime(at)}` : '';
}

interface EditHistoryProps {
  detail: ExpenseDetail;
  view: ExpenseView;
  today: string;
}

function EditHistory({ detail, view, today }: EditHistoryProps): ReactElement {
  const lines = sortAuditNewestFirst(detail.audit).flatMap(entry =>
    describeAuditEntry(entry, detail.currency, view.categories).map((text, index) => ({ key: `${entry.id}-${index}`, text, when: auditTime(entry.at, today) })),
  );

  return (
    <Card padding="md">
      <Card.Body>
        <h2 className={styles.railTitle}>Edit history</h2>
        {lines.length === 0 ? (
          <p className={styles.railProse}>No changes recorded yet. An expense saved before edit history began shows its changes from the next edit.</p>
        ) : (
          <ul className={styles.audit}>
            {lines.map(line => (
              <li key={line.key} className={styles.auditItem} title={line.text}>
                {line.text} {line.when && <span className={styles.auditWhen}>· {line.when}</span>}
              </li>
            ))}
          </ul>
        )}
      </Card.Body>
    </Card>
  );
}

function isRestorable(expense: ExpenseDetail): boolean {
  return !expense.receiptRef && !expense.linkedSubscriptionId && !expense.linkedQuestId && !expense.linkedQuestTitle && !expense.hasLineItems;
}

function rateLine(detail: ExpenseDetail, amountLabel: string): string {
  if (detail.fxRate !== null) return `${amountLabel} at ${detail.fxRate.toFixed(4)} — the rate on ${formatLocalDate(detail.occurredOnDate)}`;
  if (detail.syncState === 'queued') return `${amountLabel} — its rate is locked once it syncs.`;
  return `${amountLabel} — the rate could not be fetched, so this reconciles later. Nothing was blocked.`;
}

function deleteDescription(detail: ExpenseDetail, amountLabel: string, title: string): string {
  const removed = `${amountLabel} · ${title} on ${formatLocalDate(detail.occurredOnDate)} leaves Money, History and Insights, and its edit history goes with it.`;
  return detail.receiptRef ? `${removed} Its receipt photo is deleted too.` : removed;
}

interface ExpenseDetailContentProps {
  view: ExpenseView;
  expenseId: string;
}

function ExpenseDetailContent({ view, expenseId }: ExpenseDetailContentProps): ReactElement {
  const navigate = useNavigate();
  const command = useFinanceCommand();
  const editButton = useRef<HTMLButtonElement>(null);
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const today = todayISODate();
  const detail = view.expense;

  if (!detail) {
    if (command.isPendingFor(pending => pending.type === 'expense.delete' && pending.id === expenseId))
      return (
        <div role="status" aria-busy="true" aria-label="Deleting this expense">
          <Skeleton.Card />
        </div>
      );
    return (
      <EmptyState
        title="That expense is no longer here"
        description="It may have been deleted on another device."
        action={{ label: 'Back to Money', onClick: () => void navigate({ to: '/finance' }) }}
      />
    );
  }

  const home = view.settings.homeCurrency;
  const category = categoryById(detail.categoryId, view.categories);
  const title = expenseTitle(detail, view.categories);
  const foreign = detail.currency !== home;
  const homeMinor = homeAmountOf(detail, home);
  const amountLabel = formatMinor(detail.amountMinor, detail.currency);

  /** A fresh id: the server keeps the deleted id's tombstone, and a later pull that re-serves it would delete a row re-created under the same id. */
  const restore = (snapshot: ExpenseDetail): void => {
    const id = uuidv7();
    void command.run({
      type: 'expense.create',
      draft: {
        id,
        amountText: snapshot.amountText,
        currency: snapshot.currency,
        categoryId: snapshot.categoryId,
        occurredOnDate: snapshot.occurredOnDate,
        merchant: snapshot.merchant,
        note: snapshot.note,
        source: snapshot.source,
      },
    });
    void navigate({ to: '/finance/expenses/$expenseId', params: { expenseId: id } });
  };

  const remove = async (): Promise<void> => {
    const outcome = await command.run({ type: 'expense.delete', id: detail.id });
    const feedback = outcomeToast(outcome, { success: 'Expense deleted.', action: 'delete', subject: title });
    const deleted = outcome.status === 'applied' || outcome.status === 'queued-offline';
    const action = deleted && isRestorable(detail) ? { label: 'Undo', onClick: () => restore(detail) } : undefined;
    if (feedback) toast[feedback.intent](feedback.title, { body: feedback.body, action });
    if (deleted) void navigate({ to: '/finance' });
  };

  return (
    <>
      <div className={styles.split}>
        <div className={styles.column}>
          <Card padding="lg">
            <Card.Body>
              <div className={styles.detailHead}>
                <div className={styles.rowMain}>
                  <p className={styles.bigAmount}>{homeMinor === null ? amountLabel : formatMinor(homeMinor, home)}</p>
                  <p className={styles.bigAmountSub}>{foreign ? rateLine(detail, amountLabel) : 'Entered in your base currency.'}</p>
                  <div className={styles.detailTags}>
                    <Tag>{category.name}</Tag>
                    {detail.source === 'ocr' && <Badge variant="outline">Receipt scanned</Badge>}
                    {detail.receiptRef && detail.source !== 'ocr' && <Badge variant="outline">Receipt attached</Badge>}
                    <Badge variant="soft" intent="neutral">
                      {detail.syncState === 'queued' ? 'Queued' : 'Synced'}
                    </Badge>
                  </div>
                </div>
                <div className={styles.detailActions}>
                  {detail.receiptRef && <ReceiptViewer receiptRef={detail.receiptRef} subject={`${title} · ${formatLocalDate(detail.occurredOnDate)}`} />}
                  <Button ref={editButton} size="sm" variant="secondary" aria-expanded={editing} onClick={() => setEditing(current => !current)}>
                    {editing ? 'Stop editing' : 'Edit'}
                  </Button>
                  <Button size="sm" variant="danger" loading={command.isPendingFor({ type: 'expense.delete', id: detail.id })} onClick={() => setConfirming(true)}>
                    Delete
                  </Button>
                </div>
              </div>

              <div className={styles.formWide}>
                <DescriptionList layout="row" termWidth={160}>
                  <DescriptionList.Item term="Note">
                    <span className={styles.longText}>{detail.note ?? '—'}</span>
                  </DescriptionList.Item>
                  <DescriptionList.Item term="Merchant">
                    <span className={styles.longText}>{detail.merchant ?? '—'}</span>
                  </DescriptionList.Item>
                  <DescriptionList.Item term="Date">{formatLocalDate(detail.occurredOnDate)}</DescriptionList.Item>
                  <DescriptionList.Item term="Amount as entered" mono>
                    {detail.amountText} {detail.currency}
                  </DescriptionList.Item>
                  <DescriptionList.Item term="Converted">
                    {foreign
                      ? homeMinor === null
                        ? detail.syncState === 'queued'
                          ? 'Converted once it syncs and the rate is locked.'
                          : 'Waiting for a rate — the entry saved without one.'
                        : `${formatMinor(homeMinor, home)} · locked to the transaction date`
                      : `${formatMinor(homeMinor ?? detail.amountMinor, home)} · your base currency`}
                  </DescriptionList.Item>
                  {detail.linkedQuestNote && <DescriptionList.Item term="Linked quest">{detail.linkedQuestNote}</DescriptionList.Item>}
                </DescriptionList>
              </div>
            </Card.Body>
          </Card>

          {editing && (
            <ExpenseEntryPanel
              today={today}
              settings={view.settings}
              rates={view.rates}
              categories={view.categories}
              existing={detail}
              onClose={() => {
                setEditing(false);
                editButton.current?.focus();
              }}
            />
          )}

          {detail.receipt && (
            <Card padding="lg">
              <Card.Body>
                <div className={styles.cardHead}>
                  <h2 className={styles.cardTitle}>Receipt review</h2>
                  <Badge variant="soft" intent="info">
                    {detail.receipt.lines.length} of {detail.receipt.lines.length} lines read
                  </Badge>
                </div>
                <p className={styles.railProse}>Read from the photo, nothing saved yet. Low-confidence values are marked — correct anything and save.</p>
                <div className={styles.ocrGrid}>
                  <div className={styles.ocrPreview}>
                    <span aria-hidden>▤</span>
                    <span>
                      Receipt photo
                      <br />
                      {detail.receipt.fileName} · {(detail.receipt.sizeBytes / 1_048_576).toFixed(1)} MB
                    </span>
                  </div>
                  <div className={styles.ocrLines}>
                    {detail.receipt.lines.map(line => (
                      <div key={line.label} className={styles.ocrLine}>
                        <span className={styles.ocrLabel}>{line.label}</span>
                        <Input size="sm" defaultValue={line.value} invalid={line.lowConfidence} aria-label={line.label} />
                        {line.lowConfidence && (
                          <Badge variant="outline" size="sm">
                            check
                          </Badge>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </Card.Body>
            </Card>
          )}
        </div>

        <div className={styles.column}>
          {foreign && (
            <Card padding="md">
              <Card.Body>
                <h2 className={styles.railTitle}>The rate does not move</h2>
                <p className={styles.railProse}>
                  A foreign expense keeps the amount you entered and the rate captured when you entered it. Reports convert with that rate for good — a past month never re-prices
                  itself.
                </p>
              </Card.Body>
            </Card>
          )}

          <EditHistory detail={detail} view={view} today={today} />
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        intent="danger"
        title="Delete this expense?"
        description={deleteDescription(detail, amountLabel, title)}
        confirmLabel="Delete expense"
        onConfirm={() => void remove()}
      />
    </>
  );
}

function DetailSkeleton(): ReactElement {
  return (
    <div className={styles.split}>
      <Skeleton.Card />
      <Skeleton.Card />
    </div>
  );
}

function headerMeta(view: ExpenseView): string | null {
  const { expense } = view;
  return expense ? `${formatLocalDate(expense.occurredOnDate)} · ${expenseTitle(expense, view.categories)}` : null;
}

export function ExpenseDetailScreen({ expenseId }: ExpenseDetailScreenProps): ReactElement {
  const view = useExpense(expenseId);
  const { readiness } = useDataReadiness({ query: view });
  const meta = readiness.kind === 'ready' && view.data ? headerMeta(view.data) : null;

  return (
    <section className={styles.screen} aria-labelledby="expense-title">
      <header className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title} id="expense-title">
            Expense
          </h1>
          {meta && (
            <p className={styles.meta} title={meta}>
              {meta}
            </p>
          )}
        </div>
      </header>

      <DataState query={view} skeleton={<DetailSkeleton />}>
        {data => <ExpenseDetailContent view={data} expenseId={expenseId} />}
      </DataState>
    </section>
  );
}
