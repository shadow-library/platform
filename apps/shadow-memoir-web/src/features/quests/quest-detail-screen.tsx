import { Link, useNavigate } from '@tanstack/react-router';
import { type ReactElement, useEffect, useRef } from 'react';
import { Alert, Badge, Button, Card, DescriptionList, EmptyState, Skeleton, Statistic, Tag } from '@shadow-library/ui';

import { DataState } from '@/components/DataState';
import { formatShortDate, STAT_LABELS, STATE_LABELS, STRICTNESS_LABELS, STRICTNESS_RULES, useMemoirData, useQuestDetail } from '@/lib/data';
import { formatCount } from '@/lib/format';

import { useQuestActions } from './quest-actions';
import { adherenceLabel, canReschedule, outcomeTone, questThresholdLabel, rescheduleSummary, scheduleSummary, streakUnit } from './quest-presenters';
import styles from './quests.module.css';

const DEFAULT_HEALTH_THRESHOLD = { metricKey: 'steps' as const, comparison: 'gte' as const, value: 8000 };

export interface QuestEditorScreenProps {
  questId: string;
}

export function QuestEditorScreen({ questId }: QuestEditorScreenProps): ReactElement {
  const navigate = useNavigate();
  const detail = useQuestDetail(questId);
  const actions = useQuestActions();
  const showSkeleton = detail.isPending || (detail.isFetching && !detail.data);

  return (
    <section className={styles.screen} aria-labelledby="quest-title">
      <div className={styles.actionRow}>
        <Button size="sm" variant="ghost" asChild>
          <Link to="/quests">‹ Quests</Link>
        </Button>
      </div>

      <DataState skeleton={<QuestDetailSkeleton />} size="page">
        {showSkeleton ? (
          <QuestDetailSkeleton />
        ) : detail.isError || !detail.data ? (
          <EmptyState
            title={<h1 id="quest-title">This quest isn’t here</h1>}
            description="It may have been removed, or the link is wrong."
            action={{ label: 'Back to Quests', onClick: () => void navigate({ to: '/quests' }) }}
          />
        ) : (
          <QuestDetailBody data={detail.data} actions={actions} />
        )}
      </DataState>

      {actions.overlays}
    </section>
  );
}

function QuestDetailSkeleton(): ReactElement {
  return (
    <>
      <h1 className={styles.title} id="quest-title">
        Quest details
      </h1>
      <Skeleton.Card />
    </>
  );
}

interface QuestDetailBodyProps {
  data: NonNullable<ReturnType<typeof useQuestDetail>['data']>;
  actions: ReturnType<typeof useQuestActions>;
}

function QuestDetailBody({ data, actions }: QuestDetailBodyProps): ReactElement {
  const { today } = useMemoirData();
  const { quest, progress } = data;
  const occurrence = data.todayOccurrence ?? null;
  const unit = streakUnit(quest.recurrence);
  const hasHistory = progress.adherence30d !== null;
  const heading = useRef<HTMLHeadingElement>(null);
  const threshold = quest.healthThreshold;
  const duplicateThreshold =
    threshold !== null &&
    threshold.metricKey === DEFAULT_HEALTH_THRESHOLD.metricKey &&
    threshold.comparison === DEFAULT_HEALTH_THRESHOLD.comparison &&
    threshold.value === DEFAULT_HEALTH_THRESHOLD.value;

  useEffect(() => {
    heading.current?.focus();
  }, []);

  return (
    <div className={styles.grid}>
      <div className={styles.column}>
        <Card padding="md">
          <Card.Body>
            <div className={styles.detailHead}>
              <div className={styles.detailIdentity}>
                <h1 className={styles.detailTitle} id="quest-title" ref={heading} tabIndex={-1}>
                  {quest.name}
                </h1>
                <div className={styles.badgeRow}>
                  <Tag>{STAT_LABELS[quest.statAffinity]}</Tag>
                  <Badge variant="outline">{STRICTNESS_LABELS[quest.strictness]}</Badge>
                  <Badge variant="soft" intent="neutral">
                    {scheduleSummary(quest)}
                  </Badge>
                  {progress.shields > 0 ? (
                    <Badge variant="soft" intent="neutral">
                      {formatCount(progress.shields, 'shield', 'shields')}
                    </Badge>
                  ) : null}
                </div>
              </div>
              {occurrence ? (
                <div className={styles.actionRow}>
                  <Button variant="primary" onClick={() => actions.open(occurrence)}>
                    Today’s actions
                  </Button>
                </div>
              ) : null}
            </div>
            <div className={styles.stats}>
              <Statistic label="Current streak" value={progress.currentStreakDays} unit={unit} size="sm" />
              {hasHistory ? (
                <Statistic label="Kept, 30 days" value={progress.adherence30d ?? 0} size="sm" format={{ style: 'percent', maximumFractionDigits: 0 }} />
              ) : (
                <span className={styles.questMeta}>Kept, 30 days — not enough history yet</span>
              )}
              <Statistic label="XP from this quest" value={progress.xpEarned} size="sm" />
              <Statistic label="Longest streak" value={progress.longestStreakDays} unit={unit} size="sm" />
            </div>
          </Card.Body>
        </Card>

        <Card padding="md">
          <Card.Body>
            <div className={styles.railHeader}>
              <h2 className={styles.cardTitle}>Last 30 days</h2>
              <span className={styles.questMeta}>{hasHistory ? `${adherenceLabel(progress.adherence30d)} kept` : 'Not enough history yet'}</span>
            </div>
            {hasHistory ? (
              <div className={styles.monthBars} aria-hidden>
                {progress.recentOutcomes.map((state, index) => (
                  <span key={index} className={styles.monthBar} data-tone={outcomeTone(state)} />
                ))}
              </div>
            ) : (
              <p className={styles.cardBody}>Complete or skip this quest a few times and its 30-day chart fills in.</p>
            )}
            <ul className={styles.history}>
              {data.history.map(entry => (
                <li key={entry.date} className={styles.historyRow}>
                  <span className={styles.mono}>{formatShortDate(entry.date)}</span>
                  <Badge variant="outline" size="sm">
                    {STATE_LABELS[entry.state]}
                  </Badge>
                  <span className={styles.questMeta}>{entry.note}</span>
                </li>
              ))}
            </ul>
          </Card.Body>
        </Card>
      </div>

      <div className={styles.column}>
        <Card padding="md">
          <Card.Body>
            <h2 className={styles.cardTitle}>Rules on this quest</h2>
            <DescriptionList layout="row" termWidth={150}>
              <DescriptionList.Item term="Strictness">{STRICTNESS_RULES[quest.strictness]}</DescriptionList.Item>
              <DescriptionList.Item term="Reschedules">{rescheduleSummary(progress, today)}</DescriptionList.Item>
              <DescriptionList.Item term="Shields">{progress.shields} held · spent automatically on an unavoidable break</DescriptionList.Item>
              <DescriptionList.Item term="Threshold">
                {threshold ? `${questThresholdLabel(threshold)} — completion is offered, never automatic` : 'None — completion is manual'}
              </DescriptionList.Item>
              <DescriptionList.Item term="Editing">
                {data.scheduleLocked ? 'Schedule and strictness are locked today' : 'Schedule and strictness aren’t locked yet'}
              </DescriptionList.Item>
            </DescriptionList>
            <div className={styles.actionRow}>
              <Button size="sm" variant="secondary" asChild>
                <Link to="/quests/$questId/edit" params={{ questId: quest.id }}>
                  Edit quest
                </Link>
              </Button>
              <Button size="sm" variant="secondary" asChild>
                <Link
                  to="/quests/new"
                  search={{
                    duplicateName: quest.name,
                    duplicateStatAffinity: quest.statAffinity,
                    duplicateStrictness: quest.strictness,
                    duplicateStartTimeMinutes: quest.startTimeMinutes ?? undefined,
                    duplicateDurationMinutes: quest.durationMinutes,
                    duplicateFrequency: quest.recurrence.frequency,
                    duplicateInterval: quest.recurrence.interval,
                    duplicateDays: quest.recurrence.daysOfWeek,
                    duplicateThreshold: duplicateThreshold || undefined,
                  }}
                >
                  Duplicate as a new quest
                </Link>
              </Button>
              {occurrence && canReschedule(occurrence) ? (
                <Button size="sm" variant="ghost" onClick={() => actions.reschedule(occurrence)}>
                  Reschedule
                </Button>
              ) : null}
            </div>
          </Card.Body>
        </Card>

        {data.scheduleLocked ? (
          <Alert intent="info" title="Two fields are read-only today">
            Today’s plan is locked, so schedule and strictness can’t change until tomorrow.
          </Alert>
        ) : null}

        <Card padding="md">
          <Card.Body>
            <h2 className={styles.cardTitle}>Load contribution</h2>
            <p className={styles.cardBody}>{data.loadSummary}</p>
            <div className={styles.loadTrack}>
              <span className={styles.loadFill} style={{ width: `${Math.round(data.loadShare * 100)}%` }} />
            </div>
          </Card.Body>
        </Card>
      </div>
    </div>
  );
}
