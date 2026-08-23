import { useNavigate } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Badge, Button, Card, DescriptionList, EmptyState, Input, Skeleton, Tag, toast } from '@shadow-library/ui';

import { categoryById, formatMinor, HOME_CURRENCY, todayISODate, useExpense, useFinanceCommand } from '@/lib/data';

import { ExpenseEntryPanel } from './expense-entry-panel';
import styles from './finance.module.css';

export interface ExpenseDetailScreenProps {
  expenseId: string;
}

export function ExpenseDetailScreen({ expenseId }: ExpenseDetailScreenProps): ReactElement {
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const expense = useExpense(expenseId);
  const command = useFinanceCommand();

  if (expense.isLoading) return <Skeleton.Card />;

  const detail = expense.data;
  if (!detail)
    return (
      <EmptyState
        title="That expense is no longer here"
        description="It may have been deleted on another device."
        action={{ label: 'Back to Money', onClick: () => void navigate({ to: '/finance' }) }}
      />
    );

  const category = categoryById(detail.categoryId);
  const foreign = detail.currency !== HOME_CURRENCY;
  const home = detail.homeAmountMinor;

  const remove = (): void => {
    command.mutate(
      { type: 'expense.delete', id: detail.id },
      {
        onSuccess: result => {
          toast.success(result.message);
          void navigate({ to: '/finance' });
        },
      },
    );
  };

  return (
    <section className={styles.screen} aria-labelledby="expense-title">
      <header className={styles.header}>
        <div>
          <h1 className={styles.title} id="expense-title">
            Expense
          </h1>
          <p className={styles.meta}>
            {detail.occurredOnDate} · {detail.note ?? category.name}
          </p>
        </div>
      </header>

      <div className={styles.split}>
        <div className={styles.column}>
          <Card padding="lg">
            <div className={styles.padLg}>
              <div className={styles.detailHead}>
                <div className={styles.rowMain}>
                  <p className={styles.bigAmount}>{home === null ? formatMinor(detail.amountMinor, detail.currency) : formatMinor(home, HOME_CURRENCY)}</p>
                  <p className={styles.bigAmountSub}>
                    {foreign
                      ? detail.fxRate === null
                        ? `${formatMinor(detail.amountMinor, detail.currency)} — the rate could not be fetched, so this reconciles later. Nothing was blocked.`
                        : `${formatMinor(detail.amountMinor, detail.currency)} at ${detail.fxRate.toFixed(4)} — the rate on ${detail.occurredOnDate}`
                      : 'Entered in your base currency.'}
                  </p>
                  <div className={styles.detailTags}>
                    <Tag>{category.name}</Tag>
                    {detail.source === 'ocr' && <Badge variant="outline">Receipt scanned</Badge>}
                    <Badge variant="soft" intent="neutral">
                      {detail.syncState === 'queued' ? 'Queued' : 'Synced'}
                    </Badge>
                  </div>
                </div>
                <div className={styles.detailActions}>
                  <Button size="sm" variant="secondary" onClick={() => setEditing(current => !current)}>
                    {editing ? 'Stop editing' : 'Edit'}
                  </Button>
                  <Button size="sm" variant="ghost" loading={command.isPending} onClick={remove}>
                    Delete
                  </Button>
                </div>
              </div>

              <div className={styles.formWide}>
                <DescriptionList layout="row" termWidth={160}>
                  <DescriptionList.Item term="Note">{detail.note ?? '—'}</DescriptionList.Item>
                  <DescriptionList.Item term="Merchant">{detail.merchant ?? '—'}</DescriptionList.Item>
                  <DescriptionList.Item term="Date">{detail.occurredOnDate}</DescriptionList.Item>
                  <DescriptionList.Item term="Amount as entered" mono>
                    {detail.amountText} {detail.currency}
                  </DescriptionList.Item>
                  <DescriptionList.Item term="Converted">
                    {home === null ? 'Waiting for a rate — the entry saved without one.' : `${formatMinor(home, HOME_CURRENCY)} · locked to the transaction date`}
                  </DescriptionList.Item>
                  {detail.linkedQuestNote && <DescriptionList.Item term="Linked quest">{detail.linkedQuestNote}</DescriptionList.Item>}
                </DescriptionList>
              </div>
            </div>
          </Card>

          {editing && <ExpenseEntryPanel today={todayISODate()} existing={detail} onClose={() => setEditing(false)} />}

          {detail.receipt && (
            <Card padding="lg">
              <div className={styles.padLg}>
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
              </div>
            </Card>
          )}
        </div>

        <div className={styles.column}>
          <Card padding="md">
            <div className={styles.pad}>
              <h2 className={styles.railTitle}>The rate does not move</h2>
              <p className={styles.railProse}>
                A foreign expense keeps the amount you entered and the rate captured when you entered it. Reports convert with that rate for good — a past month never re-prices
                itself.
              </p>
            </div>
          </Card>

          <Card padding="md">
            <div className={styles.pad}>
              <h2 className={styles.railTitle}>Edit history</h2>
              <ul className={styles.audit}>
                {detail.audit.map(entry => (
                  <li key={`${entry.text}-${entry.when}`} className={styles.auditItem}>
                    {entry.text} <span className={styles.auditWhen}>· {entry.when}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
