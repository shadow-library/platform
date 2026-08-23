import { Link } from '@tanstack/react-router';
import { type FormEvent, type ReactElement, useState } from 'react';
import { Button, Card, EmptyState, IconButton, Input, Select, Skeleton, Statistic, Tag, toast } from '@shadow-library/ui';

import { EntryCapNote } from '@/components/EntryCapNote';
import { SearchIcon } from '@/components/icons';
import { type EntryCapAdvisory, SIDE_QUEST_DAILY_REWARD_LIMIT, STAT_LABELS, type StatAffinity, todayISODate, useQuickLogCommand, useSideQuests } from '@/lib/data';

import styles from './quick-logs.module.css';

export function SideQuestsScreen(): ReactElement {
  const date = todayISODate();
  const sideQuests = useSideQuests();
  const command = useQuickLogCommand();
  const [name, setName] = useState('');
  const [affinity, setAffinity] = useState<StatAffinity>('discipline');
  const [search, setSearch] = useState('');
  const [advisory, setAdvisory] = useState<EntryCapAdvisory | null>(null);

  const view = sideQuests.data;
  const remaining = Math.max(SIDE_QUEST_DAILY_REWARD_LIMIT - (view?.rewardedToday ?? 0), 0);

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

  if (sideQuests.isLoading || !view) return <Skeleton.Card />;

  const items = view.items.filter(item => item.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <section className={styles.screen} aria-labelledby="sidequests-title">
      <h2 className={styles.cardTitle} id="sidequests-title">
        Side quests
      </h2>

      <div className={styles.split}>
        <div className={styles.column}>
          <Card padding="lg">
            <form className={styles.padLg} onSubmit={submit}>
              <h3 className={styles.cardTitle}>Log a side quest</h3>
              <p className={styles.prose} style={{ margin: '5px 0 16px' }}>
                Something you did that no quest asked for. It earns XP once, has no schedule and no streak to protect.
              </p>

              <Input size="md" value={name} onValueChange={setName} placeholder="Fixed the bike light" aria-label="What you did" autoComplete="off" />

              <div className={styles.formRow}>
                <Select size="md" value={affinity} onValueChange={value => setAffinity(value as StatAffinity)} aria-label="Stat">
                  {(Object.keys(STAT_LABELS) as StatAffinity[]).map(key => (
                    <Select.Item key={key} value={key}>
                      {STAT_LABELS[key]}
                    </Select.Item>
                  ))}
                </Select>
                <Button type="submit" variant="primary" loading={command.isPending} disabled={!name.trim()}>
                  Log it
                </Button>
                <span className={styles.hint}>
                  {view.loggedThisWeek} logged this week ·{' '}
                  {remaining > 0 ? `${remaining} rewarded ${remaining === 1 ? 'entry' : 'entries'} left today` : 'today’s rewards are used; logging still works'}
                </span>
              </div>

              <EntryCapNote advisory={advisory} />
            </form>
          </Card>

          <Card padding="md">
            <div className={styles.pad}>
              <div className={styles.cardHead}>
                <h3 className={styles.cardTitle}>{view.totalLogged} side quests</h3>
                <Input size="sm" placeholder="Search" aria-label="Search side quests" prefix={<SearchIcon size={14} />} value={search} onValueChange={setSearch} clearable />
              </div>

              {items.length === 0 && <EmptyState size="inline" title={search ? `Nothing matches “${search}”` : 'Nothing logged yet'} description="The small things count here." />}

              {items.map(item => (
                <div key={item.id} className={styles.row}>
                  <span className={styles.rowMain}>
                    <span className={styles.rowName}>{item.name}</span>
                    <span className={styles.rowMeta}>{item.meta}</span>
                  </span>
                  <Tag size="sm">{STAT_LABELS[item.statAffinity]}</Tag>
                  <span className={styles.mono}>{item.rewarded ? `+${item.xpAwarded}` : '—'}</span>
                  <IconButton variant="ghost" size="sm" aria-label={`Edit ${item.name}`} icon={<span aria-hidden>✎</span>} />
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className={styles.column}>
          <Card padding="md">
            <div className={styles.pad}>
              <h3 className={styles.railTitle}>This month</h3>
              <Statistic label="XP from side quests" value={view.xpThisMonth} size="sm" comparison={`${view.loggedThisMonth} logged`} />
              <p className={styles.prose} style={{ marginTop: 10 }}>
                The first {SIDE_QUEST_DAILY_REWARD_LIMIT} a day carry the reward. Anything after them still records — the log is the point, not the XP.
              </p>
            </div>
          </Card>

          {view.patternHint && (
            <Card padding="md">
              <div className={styles.pad}>
                <h3 className={styles.railTitle}>Turn a pattern into a quest?</h3>
                <p className={styles.prose}>
                  You have logged “{view.patternHint.name}” {view.patternHint.occurrences} times this month. It might be worth a weekly quest.
                </p>
                <div className={styles.actions}>
                  <Button size="sm" variant="secondary" asChild>
                    <Link to="/quests/new">Create quest from this</Link>
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>
    </section>
  );
}
