import { Link } from '@tanstack/react-router';
import { type ReactElement, useEffect, useRef, useState } from 'react';
import { Badge, Button, Card, DescriptionList, EmptyState, Input, Pagination, Skeleton, useMediaQuery } from '@shadow-library/ui';

import { DataState } from '@/components/DataState';
import { Screen, ScreenColumns, screenStyles, useRevealOnSelect } from '@/components/ScreenLayout';
import { SearchIcon } from '@/components/icons';
import { HISTORY_KIND_LABELS, HISTORY_KINDS, type HistoryFilter, useHistory, useHistoryRecord } from '@/lib/data';

import styles from './history.module.css';

const FILTER_LABELS: Record<HistoryFilter, string> = { all: 'Everything', ...HISTORY_KIND_LABELS };

export function HistoryScreen(): ReactElement {
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
      {/* No `query`: gating this on the filtered `history` query would remount it (and lose search focus) on every refetch the flash in follow-ups/P1-21 causes — P2-18 owns the real fix. */}
      <DataState skeleton={<HistorySkeleton />}>
        <HistoryContent />
      </DataState>
    </Screen>
  );
}

function HistorySkeleton(): ReactElement {
  return (
    <>
      <Skeleton.Card />
      <Skeleton.List rows={8} />
    </>
  );
}

function HistoryContent(): ReactElement {
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState('');
  const history = useHistory(filter, query, page);
  const record = useHistoryRecord(selectedId);
  const detailHeadingRef = useRevealOnSelect<HTMLHeadingElement>(selectedId, record.data?.id === selectedId);
  const firstRowRef = useRef<HTMLButtonElement>(null);
  const pendingPagerFocus = useRef(false);
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const data = history.data;

  useEffect(() => {
    if (!pendingPagerFocus.current || history.isPlaceholderData || !data) return;
    pendingPagerFocus.current = false;
    const button = firstRowRef.current;
    button?.scrollIntoView?.({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
    button?.focus({ preventScroll: true });
  }, [data, history.isPlaceholderData, reduceMotion]);

  const goToPage = (next: number): void => {
    pendingPagerFocus.current = true;
    setPage(next);
  };

  const filteredOut = selectedId !== '' && data !== undefined && !data.matchedIds.has(selectedId);

  return (
    <ScreenColumns
      aside={
        <>
          {!data ? (
            <Skeleton.Card />
          ) : data.totalRecords === 0 ? null : selectedId === '' ? (
            <Card padding="md">
              <Card.Body>
                <p className={screenStyles.cardBody}>Select a record to see its details.</p>
              </Card.Body>
            </Card>
          ) : filteredOut ? (
            <Card padding="md">
              <Card.Body>
                <p className={screenStyles.cardBody}>This record doesn&apos;t match the current filter or search.</p>
              </Card.Body>
            </Card>
          ) : record.data ? (
            <Card padding="md">
              <Card.Body>
                <div className={styles.detailKind}>{HISTORY_KIND_LABELS[record.data.kind]}</div>
                <h2 ref={detailHeadingRef} tabIndex={-1} className={`${styles.detailTitle} ${screenStyles.revealTarget}`}>
                  {record.data.title}
                </h2>
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
              </Card.Body>
            </Card>
          ) : (
            <Skeleton.Card />
          )}

          <Card padding="md">
            <Card.Body>
              <h2 className={screenStyles.cardTitle}>Totals for this view</h2>
              <ul className={screenStyles.list}>
                {(data?.totals ?? []).map(line => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </Card.Body>
          </Card>
        </>
      }
    >
      <Card padding="md">
        <Card.Body>
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
        </Card.Body>
      </Card>

      <Card padding="md">
        <Card.Body>
          {!data ? (
            history.isError ? (
              <EmptyState size="inline" title="Couldn't load this right now" description="Try again." action={{ label: 'Try again', onClick: () => void history.refetch() }} />
            ) : (
              <Skeleton.List rows={8} />
            )
          ) : data.totalRecords === 0 ? (
            <EmptyState
              size="inline"
              title="Nothing logged yet"
              description="Everything you record — quests, money, journal, meals, weight and health — will show up here as you go."
            />
          ) : (
            <>
              <p className={styles.count}>{data.countLabel}</p>
              <p className={styles.countNote}>Quests, hero events, money, journal, meals, weight and health, in one place.</p>

              {data.groups.length === 0 ? (
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
                  {data.groups.map((group, groupIndex) => (
                    <div key={group.date}>
                      <h2 className={styles.groupDate}>{group.label}</h2>
                      <ul className={styles.rows}>
                        {group.rows.map((row, rowIndex) => (
                          <li key={row.id}>
                            <button
                              type="button"
                              ref={groupIndex === 0 && rowIndex === 0 ? firstRowRef : undefined}
                              className={styles.row}
                              aria-pressed={row.id === selectedId}
                              onClick={() => setSelectedId(row.id)}
                            >
                              <span className={styles.time}>{row.time}</span>
                              <Badge variant="outline" size="sm" className={styles.rowBadge}>
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

              {data.pageCount > 1 ? (
                <div className={styles.pager}>
                  <Pagination page={page} total={data.matchedCount} pageSize={20} siblingCount={1} onPageChange={goToPage} />
                </div>
              ) : null}
            </>
          )}
        </Card.Body>
      </Card>
    </ScreenColumns>
  );
}
