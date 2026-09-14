import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Badge, Button, Card, cn, DropdownMenu, IconButton, Skeleton } from '@shadow-library/ui';

import { DataState } from '@/components/DataState';
import { type ExpenseCategoryId, formatMinor, notifyOutcome, useExpenseCategories, useFinanceCommand } from '@/lib/data';
import { useDataReadiness } from '@/lib/sync';

import styles from './finance.module.css';

const UNARCHIVABLE_CATEGORIES: ReadonlySet<ExpenseCategoryId> = new Set(['uncat', 'subs']);

export function CategoriesScreen(): ReactElement {
  const categories = useExpenseCategories();
  const command = useFinanceCommand();

  const { readiness } = useDataReadiness({ query: categories });
  const ready = readiness.kind === 'ready';
  const view = categories.data;
  const home = view?.homeCurrency ?? 'EUR';
  const meta = ready && view ? `${view.items.length} categories · ${view.items.filter(slice => slice.category.archived).length} archived` : null;
  const uncategorisedCount = view?.uncategorised.count ?? 0;

  const setArchived = async (id: ExpenseCategoryId, archived: boolean, name: string): Promise<void> => {
    const outcome = await command.run({ type: 'category.setArchived', id, archived });
    const local = outcome.status === 'applied' || outcome.status === 'queued-offline' ? outcome.local : null;
    notifyOutcome(outcome, { success: local?.message ?? '', action: archived ? 'archive' : 'restore', subject: name });
  };

  return (
    <section className={styles.screen} aria-labelledby="categories-title">
      <header className={styles.header}>
        <div>
          <h1 className={styles.title} id="categories-title">
            Categories
          </h1>
          {meta && (
            <p className={styles.meta} title={meta}>
              {meta}
            </p>
          )}
        </div>
      </header>

      <DataState query={categories} skeleton={<Skeleton.List rows={6} />}>
        <div className={styles.split}>
          <Card padding="md">
            <Card.Body>
              <div className={styles.cardHead}>
                <h2 className={styles.cardTitle}>Every category</h2>
              </div>

              {view?.items.map(slice => (
                <div key={slice.category.id} className={cn(styles.staticRow, slice.category.archived && styles.archived)}>
                  <span className={styles.swatch} style={{ background: slice.category.swatch }} aria-hidden />
                  <span className={styles.rowMain}>
                    <span className={styles.rowTitleLine}>
                      <span className={styles.rowName}>{slice.category.name}</span>
                      {slice.category.archived && (
                        <Badge variant="outline" size="sm">
                          Archived
                        </Badge>
                      )}
                    </span>
                    <span className={styles.rowMeta}>
                      {slice.category.hint} · {slice.count} this month
                    </span>
                  </span>
                  <span className={styles.mono}>{formatMinor(slice.totalMinor, home)}</span>
                  {UNARCHIVABLE_CATEGORIES.has(slice.category.id) ? (
                    <span className={styles.rowSpacer} aria-hidden />
                  ) : (
                    <DropdownMenu>
                      <DropdownMenu.Trigger asChild>
                        <IconButton
                          variant="ghost"
                          size="sm"
                          aria-label={`Actions for ${slice.category.name}`}
                          icon={<span aria-hidden>⋯</span>}
                          disabled={command.isPendingFor(c => c.type === 'category.setArchived' && c.id === slice.category.id)}
                        />
                      </DropdownMenu.Trigger>
                      <DropdownMenu.Content>
                        <DropdownMenu.Item onSelect={() => void setArchived(slice.category.id, !slice.category.archived, slice.category.name)}>
                          {slice.category.archived ? 'Restore' : 'Archive'}
                        </DropdownMenu.Item>
                      </DropdownMenu.Content>
                    </DropdownMenu>
                  )}
                </div>
              ))}
            </Card.Body>
          </Card>

          <div className={styles.column}>
            <Card padding="md">
              <Card.Body>
                <h2 className={styles.railTitle}>Rename and archive safely</h2>
                <p className={styles.railProse}>
                  Renaming a category updates every past expense — the amounts never change. Archiving hides it from new entries and keeps its history in Insights.
                </p>
              </Card.Body>
            </Card>

            {uncategorisedCount > 0 && (
              <Card padding="md">
                <Card.Body>
                  <h2 className={styles.railTitle}>Uncategorised</h2>
                  <p className={styles.railProse}>
                    {uncategorisedCount} expenses, {formatMinor(view?.uncategorised.totalMinor ?? 0, home)} this month. Categorising them takes about twenty seconds and improves
                    the next guess.
                  </p>
                  <Button size="sm" variant="secondary" className={styles.railAction} asChild>
                    <Link to="/finance" search={{ category: 'uncat' }}>
                      Categorise now
                    </Link>
                  </Button>
                </Card.Body>
              </Card>
            )}
          </div>
        </div>
      </DataState>
    </section>
  );
}
