import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Button, Card, Progress } from '@shadow-library/ui';

import { type DayMode, type HeroState } from '@/lib/data';

import styles from './today.module.css';

export interface HeroCardProps {
  hero: HeroState;
  mode: DayMode;
}

const MOMENTUM_LABELS = { cold: 'settling', steady: 'steady', warm: 'warm' } as const;

function momentumLabel(hero: HeroState, mode: DayMode): string {
  if (mode === 'new') return 'starting';
  if (mode === 'recovery') return 'returning';
  return MOMENTUM_LABELS[hero.momentum];
}

export function HeroCard({ hero, mode }: HeroCardProps): ReactElement {
  const toNext = Math.max(0, hero.xpForNextLevel - hero.xpIntoLevel);

  return (
    <Card padding="md">
      <div className={styles.heroTop}>
        <div className={styles.crest}>
          <span className={styles.crestLevel}>{hero.level}</span>
          <span className={styles.crestLabel}>lvl</span>
        </div>
        <div className={styles.heroMain}>
          <div className={styles.heroTitleRow}>
            <span className={styles.heroTitle}>{hero.title}</span>
            <span className={styles.coins}>◈ {hero.coins.toLocaleString()}</span>
          </div>
          <div className={styles.heroProgress}>
            <Progress value={hero.xpIntoLevel} max={hero.xpForNextLevel} size="md" label={`Experience towards level ${hero.level + 1}`} />
          </div>
          <div className={styles.heroFooter}>
            <span>
              <span className={styles.mono}>
                {hero.xpIntoLevel.toLocaleString()} / {hero.xpForNextLevel.toLocaleString()}
              </span>{' '}
              XP
            </span>
            <span>
              {toNext.toLocaleString()} XP to level {hero.level + 1}
            </span>
          </div>
        </div>
      </div>
      <div className={styles.heroStats}>
        <span className={styles.hp} role="img" aria-label={`HP ${hero.hp} of ${hero.hpMax}`}>
          <span className={styles.pips} aria-hidden>
            {Array.from({ length: hero.hpMax }, (_, index) => (
              <span key={index} className={styles.pip} data-filled={index < hero.hp} />
            ))}
          </span>
          <span className={styles.heroMeta}>
            HP {hero.hp} of {hero.hpMax}
          </span>
        </span>
        <span className={styles.divider} aria-hidden />
        <span className={styles.heroMeta}>
          Crown · {hero.crown.label}{' '}
          <span className={styles.heroMetaSoft}>
            day {hero.crown.dayIndex} of {hero.crown.dayCount} · {hero.crown.keptPercent}% kept
          </span>
        </span>
        <span className={styles.divider} aria-hidden />
        <span className={styles.heroMeta}>
          Momentum <strong>{momentumLabel(hero, mode)}</strong>
        </span>
        <span className={styles.heroAction}>
          <Button size="sm" variant="ghost" asChild>
            <Link to="/hero">Hero</Link>
          </Button>
        </span>
      </div>
    </Card>
  );
}
