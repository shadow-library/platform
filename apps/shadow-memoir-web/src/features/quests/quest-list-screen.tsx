import { Link, useNavigate } from '@tanstack/react-router';
import { type ReactElement, useState } from 'react';
import { Alert, Badge, Button, Card, Input, SegmentedControl, Skeleton, Tag } from '@shadow-library/ui';

import { ChevronRightIcon } from '@/components/icons';
import { type QuestFilter, type QuestSummary, STAT_LABELS, STRICTNESS_LABELS, useQuestList } from '@/lib/data';

import { adherenceLabel, outcomeTone, questMeta } from './quest-presenters';
import styles from './quests.module.css';

const FILTER_NOTES: Record<QuestFilter, (count: number) => string> = {
  active: count => `${count} active quests`,
  inactive: count => `${count} paused or archived quests · history intact`,
  all: count => `${count} quests in total`,
};

export function QuestListScreen(): ReactElement {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<QuestFilter>('active');
  const [search, setSearch] = useState('');
  const quests = useQuestList(filter);

  const shown = (quests.data ?? []).filter(item => item.quest.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <section className={styles.screen} aria-labelledby="quests-title">
      <header className={styles.header}>
        <h1 className={styles.title} id="quests-title">
          Quests
        </h1>
        <p className={styles.subtitle}>Every promise you have made to yourself, active or kept as history.</p>
      </header>

      <div className={styles.toolbar}>
        <Input value={search} onValueChange={setSearch} placeholder="Search quests" clearable aria-label="Search quests" className={styles.search} />
        <SegmentedControl value={filter} onValueChange={value => setFilter(value as QuestFilter)}>
          <SegmentedControl.Item value="active">Active</SegmentedControl.Item>
          <SegmentedControl.Item value="all">All</SegmentedControl.Item>
          <SegmentedControl.Item value="inactive">Inactive</SegmentedControl.Item>
        </SegmentedControl>
        <span className={styles.toolbarEnd}>
          <Button variant="primary" onClick={() => void navigate({ to: '/quests/new' })}>
            New quest
          </Button>
        </span>
      </div>

      <p className={styles.filterNote}>{FILTER_NOTES[filter](shown.length)}</p>

      {quests.isPending ? <Skeleton.List rows={6} /> : null}

      {quests.data ? (
        <Card padding="sm" className={styles.listCard}>
          <ul className={styles.list}>
            {shown.map(summary => (
              <QuestListRow key={summary.quest.id} summary={summary} />
            ))}
          </ul>
        </Card>
      ) : null}

      {filter === 'active' ? null : (
        <Alert intent="info" title="Inactive quests keep their history">
          Pausing or archiving a quest never removes its XP, its streak record or its entries. Reactivating starts a new streak and leaves the old one in History as a closed
          record.
        </Alert>
      )}
    </section>
  );
}

function QuestListRow({ summary }: { summary: QuestSummary }): ReactElement {
  return (
    <li>
      <Link to="/quests/$questId" params={{ questId: summary.quest.id }} className={styles.questRow} data-inactive={!summary.quest.active}>
        <span className={styles.questBody}>
          <span className={styles.questHead}>
            <span className={styles.questName}>{summary.quest.name}</span>
            <Tag size="sm">{STAT_LABELS[summary.quest.statAffinity]}</Tag>
            <Badge variant="outline" size="sm">
              {STRICTNESS_LABELS[summary.quest.strictness]}
            </Badge>
            {summary.scheduleLocked ? (
              <Badge variant="soft" intent="neutral" size="sm">
                Locked plan
              </Badge>
            ) : null}
          </span>
          <span className={styles.questMeta}>{questMeta(summary)}</span>
        </span>
        <span className={styles.questTrailing}>
          <span className={styles.adherence}>
            <span className={styles.mono}>{adherenceLabel(summary.progress.adherence30d)}</span>
            <span className={styles.questMeta}>30-day kept</span>
          </span>
          <span className={styles.spark} aria-hidden>
            {summary.progress.recentOutcomes.slice(-14).map((state, index) => (
              <span key={index} className={styles.sparkBar} data-tone={outcomeTone(state)} />
            ))}
          </span>
          <ChevronRightIcon size={16} />
        </span>
      </Link>
    </li>
  );
}
