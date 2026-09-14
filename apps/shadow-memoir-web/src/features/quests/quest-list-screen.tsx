import { Link, useNavigate } from '@tanstack/react-router';
import { type ReactElement, useRef, useState } from 'react';
import { Alert, Badge, Button, Card, EmptyState, Input, SegmentedControl, Skeleton, Tag } from '@shadow-library/ui';

import { DataState } from '@/components/DataState';
import { ChevronRightIcon } from '@/components/icons';
import { type QuestFilter, type QuestSummary, STAT_LABELS, STRICTNESS_LABELS, useQuestList } from '@/lib/data';
import { formatCount } from '@/lib/format';

import { adherenceLabel, outcomeTone, questMeta } from './quest-presenters';
import styles from './quests.module.css';

const FILTER_NOUNS: Record<QuestFilter, [singular: string, plural: string]> = {
  active: ['active quest', 'active quests'],
  inactive: ['paused or archived quest', 'paused or archived quests'],
  all: ['quest', 'quests'],
};

const FILTER_EMPTY: Record<QuestFilter, { title: string; description: string }> = {
  active: { title: 'No active quests', description: 'Every quest is paused or archived. Reactivate one from Inactive, or make a new promise.' },
  inactive: { title: 'No paused or archived quests', description: 'Quests you pause or archive land here with their history intact.' },
  all: { title: 'No quests yet', description: 'A quest is a promise you make to yourself, kept one day at a time.' },
};

function matchesFilter(summary: QuestSummary, filter: QuestFilter): boolean {
  if (filter === 'all') return true;
  return filter === 'active' ? summary.quest.active : !summary.quest.active;
}

function filterNote(filter: QuestFilter, total: number, shown: number, searching: boolean): string {
  const [singular, plural] = FILTER_NOUNS[filter];
  if (searching) return `${shown} of ${formatCount(total, singular, plural)}`;
  const note = formatCount(total, singular, plural);
  if (filter === 'inactive') return `${note} · history intact`;
  return filter === 'all' ? `${note} in total` : note;
}

export function QuestListScreen(): ReactElement {
  const navigate = useNavigate();
  const quests = useQuestList('all');
  const createQuest = (): void => void navigate({ to: '/quests/new' });

  return (
    <section className={styles.screen} aria-labelledby="quests-title">
      <header className={styles.header}>
        <h1 className={styles.title} id="quests-title">
          Quests
        </h1>
        <p className={styles.subtitle}>Every promise you have made to yourself, active or kept as history.</p>
      </header>

      <DataState
        query={quests}
        isEmpty={data => data.length === 0}
        skeleton={<Skeleton.List rows={6} />}
        empty={<EmptyState title={FILTER_EMPTY.all.title} description={FILTER_EMPTY.all.description} action={{ label: 'Create your first quest', onClick: createQuest }} />}
      >
        {data => <QuestLibrary quests={data} onCreate={createQuest} />}
      </DataState>
    </section>
  );
}

interface QuestLibraryProps {
  quests: QuestSummary[];
  onCreate: () => void;
}

function QuestLibrary({ quests, onCreate }: QuestLibraryProps): ReactElement {
  const [filter, setFilter] = useState<QuestFilter>('active');
  const [search, setSearch] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);

  const query = search.trim();
  const inFilter = quests.filter(summary => matchesFilter(summary, filter));
  const shown = inFilter.filter(summary => summary.quest.name.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <div className={styles.toolbar}>
        <Input ref={searchInput} value={search} onValueChange={setSearch} placeholder="Search quests" clearable aria-label="Search quests" className={styles.search} />
        <SegmentedControl value={filter} onValueChange={value => setFilter(value as QuestFilter)}>
          <SegmentedControl.Item value="active">Active</SegmentedControl.Item>
          <SegmentedControl.Item value="all">All</SegmentedControl.Item>
          <SegmentedControl.Item value="inactive">Inactive</SegmentedControl.Item>
        </SegmentedControl>
        <span className={styles.toolbarEnd}>
          <Button variant="primary" onClick={onCreate}>
            New quest
          </Button>
        </span>
      </div>

      <p className={styles.filterNote} aria-live="polite">
        {filterNote(filter, inFilter.length, shown.length, query.length > 0)}
      </p>

      {shown.length > 0 ? (
        <Card padding="sm" className={styles.listCard}>
          <Card.Body className={styles.listBody}>
            <ul className={styles.list}>
              {shown.map(summary => (
                <QuestListRow key={summary.quest.id} summary={summary} />
              ))}
            </ul>
          </Card.Body>
        </Card>
      ) : query.length > 0 ? (
        <EmptyState
          size="inline"
          title={`No quests match “${query}”`}
          description="Try a different word, or clear the search to see every quest in this view."
          action={{
            label: 'Clear search',
            onClick: () => {
              setSearch('');
              searchInput.current?.focus();
            },
          }}
        />
      ) : (
        <EmptyState size="inline" title={FILTER_EMPTY[filter].title} description={FILTER_EMPTY[filter].description} />
      )}

      {filter === 'active' ? null : (
        <Alert intent="info" title="Inactive quests keep their history">
          Pausing or archiving a quest never removes its XP, its streak record or its entries. Reactivating starts a new streak and leaves the old one in History as a closed
          record.
        </Alert>
      )}
    </>
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
          {summary.progress.adherence30d === null ? (
            <span className={styles.questMeta}>Not enough history yet</span>
          ) : (
            <>
              <span className={styles.adherence}>
                <span className={styles.mono}>{adherenceLabel(summary.progress.adherence30d)}</span>
                <span className={styles.questMeta}>30-day kept</span>
              </span>
              <span className={styles.spark} aria-hidden>
                {summary.progress.recentOutcomes.slice(-14).map((state, index) => (
                  <span key={index} className={styles.sparkBar} data-tone={outcomeTone(state)} />
                ))}
              </span>
            </>
          )}
          <ChevronRightIcon size={16} />
        </span>
      </Link>
    </li>
  );
}
