import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Alert, Badge, Button, Card, DescriptionList, Skeleton, Statistic, Tag } from '@shadow-library/ui';

import { formatShortDate, STAT_LABELS, STATE_LABELS, STRICTNESS_LABELS, STRICTNESS_RULES, useQuestDetail } from '@/lib/data';

import { useQuestActions } from './quest-actions';
import { adherenceLabel, outcomeTone } from './quest-presenters';
import styles from './quests.module.css';

export interface QuestEditorScreenProps {
  questId: string;
}

export function QuestEditorScreen({ questId }: QuestEditorScreenProps): ReactElement {
  const detail = useQuestDetail(questId);
  const actions = useQuestActions();
  const occurrence = detail.data?.todayOccurrence ?? null;

  if (detail.isPending || !detail.data)
    return (
      <section className={styles.screen} aria-labelledby="quest-title">
        <h1 className={styles.title} id="quest-title">
          Edit quest
        </h1>
        <Skeleton.Card />
      </section>
    );

  const { quest, progress } = detail.data;

  return (
    <section className={styles.screen} aria-labelledby="quest-title">
      <div className={styles.grid}>
        <div className={styles.column}>
          <Card padding="md">
            <div className={styles.detailHead}>
              <div className={styles.detailIdentity}>
                <h1 className={styles.detailTitle} id="quest-title">
                  {quest.name}
                </h1>
                <div className={styles.badgeRow}>
                  <Tag>{STAT_LABELS[quest.statAffinity]}</Tag>
                  <Badge variant="outline">{STRICTNESS_LABELS[quest.strictness]}</Badge>
                  <Badge variant="soft" intent="neutral">
                    {detail.data.scheduleSummary}
                  </Badge>
                  {progress.shields > 0 ? (
                    <Badge variant="soft" intent="neutral">
                      {progress.shields} shields
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
              <Statistic label="Current streak" value={progress.currentStreakDays} unit="days" size="sm" />
              <Statistic label="Kept, 30 days" value={progress.adherence30d ?? 0} size="sm" format={{ style: 'percent', maximumFractionDigits: 0 }} />
              <Statistic label="XP from this quest" value={progress.xpEarned} size="sm" />
              <Statistic label="Longest streak" value={progress.longestStreakDays} unit="days" size="sm" />
            </div>
          </Card>

          <Card padding="md">
            <div className={styles.railHeader}>
              <h2 className={styles.cardTitle}>Last 30 days</h2>
              <span className={styles.questMeta}>{adherenceLabel(progress.adherence30d)} kept</span>
            </div>
            <div className={styles.monthBars} aria-hidden>
              {progress.recentOutcomes.map((state, index) => (
                <span key={index} className={styles.monthBar} data-tone={outcomeTone(state)} />
              ))}
            </div>
            <ul className={styles.history}>
              {detail.data.history.map(entry => (
                <li key={entry.date} className={styles.historyRow}>
                  <span className={styles.mono}>{formatShortDate(entry.date)}</span>
                  <Badge variant="outline" size="sm">
                    {STATE_LABELS[entry.state]}
                  </Badge>
                  <span className={styles.questMeta}>{entry.note}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className={styles.column}>
          <Card padding="md">
            <h2 className={styles.cardTitle}>Rules on this quest</h2>
            <DescriptionList layout="row" termWidth={150}>
              <DescriptionList.Item term="Strictness">{STRICTNESS_RULES[quest.strictness]}</DescriptionList.Item>
              <DescriptionList.Item term="Reschedules">
                {progress.reschedulesUsed} of {progress.rescheduleCap} used in the last 7 days
              </DescriptionList.Item>
              <DescriptionList.Item term="Shields">{progress.shields} held · spent automatically on an unavoidable break</DescriptionList.Item>
              <DescriptionList.Item term="Threshold">
                {quest.healthThreshold
                  ? `${quest.healthThreshold.target.toLocaleString()} ${quest.healthThreshold.unit} — completion is offered, never automatic`
                  : 'None — completion is manual'}
              </DescriptionList.Item>
              <DescriptionList.Item term="Editing">
                {detail.data.scheduleLocked ? 'Schedule and strictness are locked while the plan is committed' : 'Open — changes apply to future occurrences'}
              </DescriptionList.Item>
            </DescriptionList>
            <div className={styles.actionRow}>
              <Button size="sm" variant="secondary" asChild>
                <Link to="/quests/new">Duplicate as a new quest</Link>
              </Button>
              {occurrence ? (
                <Button size="sm" variant="ghost" onClick={() => actions.open(occurrence)}>
                  Reschedule
                </Button>
              ) : null}
            </div>
          </Card>

          {detail.data.scheduleLocked ? (
            <Alert intent="info" title="Two fields are read-only this week">
              You locked this week’s plan, so the schedule and strictness cannot change until it reopens. Everything else — name, notes, category — is editable now.
            </Alert>
          ) : null}

          <Card padding="md">
            <h2 className={styles.cardTitle}>Load contribution</h2>
            <p className={styles.cardBody}>{detail.data.loadSummary}</p>
            <div className={styles.loadTrack}>
              <span className={styles.loadFill} style={{ width: `${Math.round(detail.data.loadShare * 100)}%` }} />
            </div>
          </Card>
        </div>
      </div>

      {actions.overlays}
    </section>
  );
}
