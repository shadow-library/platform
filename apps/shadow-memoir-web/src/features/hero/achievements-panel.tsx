import { type ReactElement, useState } from 'react';
import { Card, DescriptionList } from '@shadow-library/ui';

import { screenStyles } from '@/components/ScreenLayout';
import { type Achievement } from '@/lib/data';

import styles from './hero.module.css';

export interface AchievementsPanelProps {
  achievements: Achievement[];
}

export function AchievementsPanel({ achievements }: AchievementsPanelProps): ReactElement {
  const [selectedId, setSelectedId] = useState(achievements[0]?.id ?? '');
  const selected = achievements.find(item => item.id === selectedId) ?? achievements[0];
  const earnedCount = achievements.filter(item => item.earnedOn !== null).length;

  return (
    <div className={styles.achievementLayout}>
      <div className={styles.achievementGrid}>
        {achievements.map(achievement => {
          const locked = achievement.earnedOn === null;
          return (
            <button
              key={achievement.id}
              type="button"
              className={styles.achievement}
              data-locked={locked}
              aria-pressed={achievement.id === selected?.id}
              onClick={() => setSelectedId(achievement.id)}
            >
              <span className={styles.achievementCrest} aria-hidden>
                {locked ? '◆' : achievement.crest}
              </span>
              <span className={styles.achievementName}>{locked ? 'Locked' : achievement.name}</span>
              <span className={styles.achievementMeta}>{locked ? achievement.teaser : `Earned ${achievement.earnedOn}`}</span>
            </button>
          );
        })}
      </div>

      {selected ? (
        <Card padding="lg">
          <h2 className={screenStyles.cardTitle}>{selected.earnedOn === null ? 'Locked' : 'Earned'}</h2>
          <div className={styles.detailCrest} aria-hidden>
            {selected.earnedOn === null ? '◆' : selected.crest}
          </div>
          <div className={styles.name}>{selected.earnedOn === null ? 'Locked achievement' : selected.name}</div>
          <p className={screenStyles.cardBody}>{selected.earnedOn === null ? selected.teaser : selected.description}</p>
          <DescriptionList layout="row" termWidth={140}>
            <DescriptionList.Item term="Earned">{selected.earnedOn ?? 'Not yet'}</DescriptionList.Item>
            <DescriptionList.Item term="Reward">{selected.earnedOn === null ? 'Unknown until it happens' : selected.reward}</DescriptionList.Item>
          </DescriptionList>
          <p className={screenStyles.cardBody}>
            {selected.earnedOn === null
              ? 'Locked achievements show no counter and no progress bar. A number here would turn this into a chore, and you will know when it happens.'
              : `${earnedCount} of the catalogue is yours so far. They arrive on their own — there is nothing to claim.`}
          </p>
        </Card>
      ) : null}
    </div>
  );
}
