import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Button, Card, cn, DropdownMenu, IconButton, Skeleton, toast } from '@shadow-library/ui';

import { type ExpenseCategoryId, formatMinor, useExpenseCategories, useFinanceCommand } from '@/lib/data';

import styles from './finance.module.css';

export function CategoriesScreen(): ReactElement {
  const categories = useExpenseCategories();
  const command = useFinanceCommand();

  const view = categories.data;
  const home = view?.homeCurrency ?? 'EUR';

  const setArchived = (id: ExpenseCategoryId, archived: boolean): void => {
    command.mutate({ type: 'category.setArchived', id, archived }, { onSuccess: result => toast.success(result.message) });
  };

  return (
    <section className={styles.screen} aria-labelledby="categories-title">
      <header className={styles.header}>
        <div>
          <h1 className={styles.title} id="categories-title">
            Categories
          </h1>
          <p className={styles.meta}>{view ? `${view.items.length} categories · ${view.items.filter(slice => slice.category.archived).length} archived` : 'Loading'}</p>
        </div>
      </header>

      <div className={styles.split}>
        <Card padding="md">
          <div className={styles.pad}>
            <div className={styles.cardHead}>
              <h2 className={styles.cardTitle}>Every category</h2>
            </div>

            {categories.isLoading && <Skeleton.List rows={8} />}

            {view?.items.map(slice => (
              <div key={slice.category.id} className={cn(styles.staticRow, slice.category.archived && styles.archived)}>
                <span className={styles.swatch} style={{ background: slice.category.swatch }} aria-hidden />
                <span className={styles.rowMain}>
                  <span className={styles.rowName}>{slice.category.name}</span>
                  <span className={styles.rowMeta}>
                    {slice.category.hint} · {slice.count} this month
                  </span>
                </span>
                <span className={styles.mono}>{formatMinor(slice.totalMinor, home)}</span>
                <DropdownMenu>
                  <DropdownMenu.Trigger asChild>
                    <IconButton variant="ghost" size="sm" aria-label={`Actions for ${slice.category.name}`} icon={<span aria-hidden>⋯</span>} />
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Content>
                    <DropdownMenu.Item onSelect={() => setArchived(slice.category.id, !slice.category.archived)}>
                      {slice.category.archived ? 'Restore' : 'Archive'}
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </Card>

        <div className={styles.column}>
          <Card padding="md">
            <div className={styles.pad}>
              <h2 className={styles.railTitle}>Rename and archive safely</h2>
              <p className={styles.railProse}>
                Renaming a category updates every past expense — the amounts never change. Archiving hides it from new entries and keeps its history in Insights.
              </p>
            </div>
          </Card>

          <Card padding="md">
            <div className={styles.pad}>
              <h2 className={styles.railTitle}>Uncategorised</h2>
              <p className={styles.railProse}>
                {view?.uncategorised.count ?? 0} expenses, {formatMinor(view?.uncategorised.totalMinor ?? 0, home)} this month. Categorising them takes about twenty seconds and
                improves the next guess.
              </p>
              <Button size="sm" variant="secondary" asChild>
                <Link to="/finance">Categorise now</Link>
              </Button>
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
