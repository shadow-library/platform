import { Link } from '@tanstack/react-router';
import { type FormEvent, type ReactElement, useEffect, useRef, useState } from 'react';
import { Button, Card, EmptyState, Input, Select, Skeleton, Statistic, Tag, toast } from '@shadow-library/ui';

import { DataState } from '@/components/DataState';
import { EntryCapNote } from '@/components/EntryCapNote';
import { SearchIcon } from '@/components/icons';
import {
  type EntryCapAdvisory,
  SIDE_QUEST_DAILY_REWARD_LIMIT,
  type SideQuestsView,
  STAT_LABELS,
  type StatAffinity,
  todayISODate,
  useQuickLogCommand,
  useSideQuests,
} from '@/lib/data';
import { formatCount } from '@/lib/format';

import styles from './quick-logs.module.css';

const ITEMS_PAGE_SIZE = 20;

export function SideQuestsScreen(): ReactElement {
  const date = todayISODate();
  const sideQuests = useSideQuests();
  const command = useQuickLogCommand();
  const [name, setName] = useState('');
  const [affinity, setAffinity] = useState<StatAffinity>('discipline');
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(ITEMS_PAGE_SIZE);
  const [advisory, setAdvisory] = useState<EntryCapAdvisory | null>(null);

  const onSearchChange = (value: string): void => {
    setSearch(value);
    setVisibleCount(ITEMS_PAGE_SIZE);
  };

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (!name.trim()) return;
    command.mutate(
      { type: 'sidequest.log', draft: { date, name: name.trim(), statAffinity: affinity } },
      {
        onSuccess: result => {
          setAdvisory(result.advisory ?? null);
          toast.success(result.reward?.rewarded ? `${result.message} +${result.reward.xp} XP.` : `${result.message} ${result.reward?.reason ?? ''}`.trim());
          setName('');
        },
      },
    );
  };

  return (
    <section className={styles.screen} aria-labelledby="sidequests-title">
      <h2 className={styles.cardTitle} id="sidequests-title">
        Side quests
      </h2>

      <DataState query={sideQuests} skeleton={<Skeleton.Card />}>
        {view => (
          <SideQuestsContent
            view={view}
            name={name}
            affinity={affinity}
            search={search}
            visibleCount={visibleCount}
            advisory={advisory}
            submitting={command.isPending}
            onNameChange={setName}
            onAffinityChange={setAffinity}
            onSearchChange={onSearchChange}
            onShowMore={() => setVisibleCount(count => count + ITEMS_PAGE_SIZE)}
            onSubmit={submit}
          />
        )}
      </DataState>
    </section>
  );
}

interface SideQuestsContentProps {
  view: SideQuestsView;
  name: string;
  affinity: StatAffinity;
  search: string;
  visibleCount: number;
  advisory: EntryCapAdvisory | null;
  submitting: boolean;
  onNameChange: (value: string) => void;
  onAffinityChange: (value: StatAffinity) => void;
  onSearchChange: (value: string) => void;
  onShowMore: () => void;
  onSubmit: (event: FormEvent) => void;
}

function SideQuestsContent({
  view,
  name,
  affinity,
  search,
  visibleCount,
  advisory,
  submitting,
  onNameChange,
  onAffinityChange,
  onSearchChange,
  onShowMore,
  onSubmit,
}: SideQuestsContentProps): ReactElement {
  const remaining = Math.max(SIDE_QUEST_DAILY_REWARD_LIMIT - view.rewardedToday, 0);
  const items = view.items.filter(item => item.name.toLowerCase().includes(search.trim().toLowerCase()));
  const visibleItems = items.slice(0, visibleCount);
  const totalLabel = formatCount(view.totalLogged, 'side quest', 'side quests');
  const heading = search.trim() ? `${items.length} of ${totalLabel}` : totalLabel;

  const rowsRef = useRef<HTMLDivElement>(null);
  const previousVisibleCountRef = useRef(visibleCount);

  useEffect(() => {
    if (visibleCount > previousVisibleCountRef.current) {
      const target = rowsRef.current?.children[previousVisibleCountRef.current] as HTMLElement | undefined;
      target?.focus();
    }
    previousVisibleCountRef.current = visibleCount;
  }, [visibleCount]);

  return (
    <div className={styles.split}>
      <div className={styles.column}>
        <Card padding="lg">
          <Card.Body>
            <form onSubmit={onSubmit}>
              <h3 className={styles.cardTitle}>Log a side quest</h3>
              <p className={styles.prose} style={{ margin: '5px 0 16px' }}>
                Something you did that no quest asked for. It earns XP once, has no schedule and no streak to protect.
              </p>

              <Input size="md" value={name} onValueChange={onNameChange} placeholder="Fixed the bike light" aria-label="What you did" autoComplete="off" />

              <div className={styles.formRow}>
                <Select size="md" value={affinity} onValueChange={value => onAffinityChange(value as StatAffinity)} aria-label="Stat">
                  {(Object.keys(STAT_LABELS) as StatAffinity[]).map(key => (
                    <Select.Item key={key} value={key}>
                      {STAT_LABELS[key]}
                    </Select.Item>
                  ))}
                </Select>
                <Button type="submit" variant="primary" loading={submitting} disabled={!name.trim()}>
                  Log it
                </Button>
                <span className={styles.hint}>
                  {view.loggedThisWeek} logged this week ·{' '}
                  {remaining > 0 ? `${remaining} rewarded ${remaining === 1 ? 'entry' : 'entries'} left today` : 'today’s rewards are used; logging still works'}
                </span>
              </div>

              <EntryCapNote advisory={advisory} />
            </form>
          </Card.Body>
        </Card>

        <Card padding="md">
          <Card.Body>
            <div className={styles.cardHead}>
              <h3 className={styles.cardTitle}>{heading}</h3>
              <Input size="sm" placeholder="Search" aria-label="Search side quests" prefix={<SearchIcon size={14} />} value={search} onValueChange={onSearchChange} clearable />
            </div>

            {items.length === 0 && (
              <EmptyState
                size="inline"
                title={search ? `Nothing matches “${search}”` : 'Nothing logged yet'}
                description={search ? 'Try a different search.' : 'The small things count here.'}
              />
            )}

            <div ref={rowsRef}>
              {visibleItems.map(item => (
                <div key={item.id} className={styles.row} tabIndex={-1}>
                  <span className={styles.rowMain}>
                    <span className={styles.rowName}>{item.name}</span>
                    <span className={styles.rowMeta}>{item.meta}</span>
                  </span>
                  <Tag size="sm">{STAT_LABELS[item.statAffinity]}</Tag>
                  <span className={styles.mono}>{item.rewarded ? `+${item.xpAwarded}` : '—'}</span>
                </div>
              ))}
            </div>

            {items.length > visibleItems.length && (
              <div className={styles.actions}>
                <Button size="sm" variant="secondary" onClick={onShowMore}>
                  Show more
                </Button>
              </div>
            )}
          </Card.Body>
        </Card>
      </div>

      <div className={styles.column}>
        <Card padding="md">
          <Card.Body>
            <h3 className={styles.railTitle}>This month</h3>
            <Statistic label="XP from side quests" value={view.xpThisMonth} size="sm" comparison={`${view.loggedThisMonth} logged`} />
            <p className={styles.prose} style={{ marginTop: 10 }}>
              The first {SIDE_QUEST_DAILY_REWARD_LIMIT} a day carry the reward. Anything after them still records — the log is the point, not the XP.
            </p>
          </Card.Body>
        </Card>

        {view.patternHint && (
          <Card padding="md">
            <Card.Body>
              <h3 className={styles.railTitle}>Turn a pattern into a quest?</h3>
              <p className={styles.prose}>
                You have logged “{view.patternHint.name}” {view.patternHint.occurrences} times this month. It might be worth a weekly quest.
              </p>
              <div className={styles.actions}>
                <Button size="sm" variant="secondary" asChild>
                  <Link to="/quests/new">Create quest from this</Link>
                </Button>
              </div>
            </Card.Body>
          </Card>
        )}
      </div>
    </div>
  );
}
