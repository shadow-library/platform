import { Link } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Badge, Button, Card, DescriptionList, EmptyState, Input, Pagination, Skeleton } from '@shadow-library/ui';

import { Screen, ScreenColumns, screenStyles } from '@/components/ScreenLayout';
import { SearchIcon } from '@/components/icons';
import { HISTORY_KIND_LABELS, HISTORY_KINDS, type HistoryFilter, useHistory, useHistoryRecord } from '@/lib/data';

import styles from './history.module.css';

const FILTER_LABELS: Record<HistoryFilter, string> = { all: 'Everything', ...HISTORY_KIND_LABELS };

export function HistoryScreen(): ReactElement {
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState('');
  const history = useHistory(filter, query, page);
  const record = useHistoryRecord(selectedId);

  return (
    <Screen
      title="History"
      subtitle="One stream of everything you have logged, newest first. Nothing here is deleted by a later correction — it is kept beside it."
      actions={
        <Button size="sm" variant="ghost" asChild>
          <Link to="/settings/export">Export</Link>
        </Button>
      }
    >
      <ScreenColumns
        aside={
          <>
            {record.data ? (
              <Card padding="md">
                <div className={styles.detailKind}>{HISTORY_KIND_LABELS[record.data.kind]}</div>
                <p className={styles.detailTitle}>{record.data.title}</p>
                <p className={styles.detailWhen}>{record.data.when}</p>
                <DescriptionList layout="row" termWidth={120}>
                  {record.data.fields.map(field => (
                    <DescriptionList.Item key={field.label} term={field.label}>
                      {field.value}
                    </DescriptionList.Item>
                  ))}
                </DescriptionList>
                <div className={styles.detailActions}>
                  <Button size="sm" variant="secondary" asChild>
                    <Link to={record.data.to}>Open in {record.data.section}</Link>
                  </Button>
                </div>
              </Card>
            ) : (
              <Skeleton.Card />
            )}

            <Card padding="md">
              <h2 className={screenStyles.cardTitle}>This range</h2>
              <ul className={screenStyles.list}>
                {(history.data?.totals ?? []).map(line => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </Card>
          </>
        }
      >
        <Card padding="md">
          <div className={styles.filters}>
            <span className={styles.search}>
              <Input
                value={query}
                onValueChange={value => {
                  setQuery(value);
                  setPage(1);
                }}
                placeholder="Search everything you have logged"
                aria-label="Search all records"
                prefix={<SearchIcon size={15} />}
                clearable
              />
            </span>
          </div>
          <div className={styles.chips} role="group" aria-label="Record type">
            {HISTORY_KINDS.map(kind => (
              <Button
                key={kind}
                size="sm"
                variant={filter === kind ? 'secondary' : 'ghost'}
                aria-pressed={filter === kind}
                onClick={() => {
                  setFilter(kind);
                  setPage(1);
                }}
              >
                {FILTER_LABELS[kind]}
              </Button>
            ))}
          </div>
        </Card>

        <Card padding="md">
          {history.isPending || !history.data ? <Skeleton.List rows={8} /> : null}

          {history.data ? (
            <>
              <p className={styles.count}>{history.data.countLabel}</p>
              <p className={styles.countNote}>Quests, hero events, money, journal, meals, weight and health, in one place.</p>

              {history.data.groups.length === 0 ? (
                <EmptyState
                  size="inline"
                  title="Nothing matches that yet"
                  description="Try a different record type, or clear the search. Everything you have logged is still here."
                  action={{
                    label: 'Clear the filters',
                    onClick: () => {
                      setFilter('all');
                      setQuery('');
                    },
                  }}
                />
              ) : (
                <div className={styles.groups}>
                  {history.data.groups.map(group => (
                    <div key={group.date}>
                      <h2 className={styles.groupDate}>{group.label}</h2>
                      <ul className={styles.rows}>
                        {group.rows.map(row => (
                          <li key={row.id}>
                            <button type="button" className={styles.row} aria-pressed={row.id === selectedId} onClick={() => setSelectedId(row.id)}>
                              <span className={styles.time}>{row.time}</span>
                              <Badge variant="outline" size="sm">
                                {HISTORY_KIND_LABELS[row.kind]}
                              </Badge>
                              <span className={styles.text}>{row.text}</span>
                              <span className={styles.value}>{row.queued ? 'queued' : row.value}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              {history.data.pageCount > 1 ? (
                <div className={styles.pager}>
                  <Pagination page={page} total={history.data.pageCount * 20} pageSize={20} siblingCount={1} onPageChange={setPage} />
                </div>
              ) : null}
            </>
          ) : null}
        </Card>
      </ScreenColumns>
    </Screen>
  );
}
