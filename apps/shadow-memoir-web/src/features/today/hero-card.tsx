import { Link } from '@tanstack/react-router';
import { type ReactElement } from 'react';
import { Button, Card, Progress } from '@shadow-library/ui';

import { type CrownPeriod, type DayMode, type HeroState } from '@/lib/data';

import styles from './today.module.css';

export interface HeroCardProps {
  hero: HeroState;
  mode: DayMode;
  showCrown: boolean;
}

const MOMENTUM_LABELS = { cold: 'settling', steady: 'steady', warm: 'warm' } as const;

const PIP_LIMIT = 10;

function momentumLabel(hero: HeroState, mode: DayMode): string {
  if (mode === 'new') return 'starting';
  if (mode === 'recovery' || mode === 'returner') return 'returning';
  return MOMENTUM_LABELS[hero.momentum];
}

function crownProgress(crown: CrownPeriod): string {
  const kept = `${crown.keptPercent}% kept`;
  return crown.cadence === 'daily' ? kept : `day ${crown.dayIndex} of ${crown.dayCount} · ${kept}`;
}

function LevelProgress({ level, xpIntoLevel, xpForNextLevel }: { level: number; xpIntoLevel: number; xpForNextLevel: number }): ReactElement {
  if (xpForNextLevel === 0) {
    return (
      <>
        <div className={styles.heroProgress}>
          <Progress value={1} max={1} size="md" aria-label="Highest level reached" />
        </div>
        <div className={styles.heroFooter}>
          <span>Highest level reached</span>
        </div>
      </>
    );
  }

  return (
    <>
      <div className={styles.heroProgress}>
        <Progress value={xpIntoLevel} max={xpForNextLevel} size="md" label={`Experience towards level ${level + 1}`} />
      </div>
      <div className={styles.heroFooter}>
        <span>
          <span className={styles.mono}>
            {xpIntoLevel.toLocaleString()} / {xpForNextLevel.toLocaleString()}
          </span>{' '}
          XP
        </span>
        <span>
          {Math.max(0, xpForNextLevel - xpIntoLevel).toLocaleString()} XP to level {level + 1}
        </span>
      </div>
    </>
  );
}

function HpMeter({ hp, hpMax }: { hp: number; hpMax: number }): ReactElement {
  const shown = Math.min(Math.max(hp, 0), hpMax);
  return (
    <span className={styles.hp} role="img" aria-label={`HP ${hp} of ${hpMax}`}>
      {hpMax < PIP_LIMIT ? (
        <span className={styles.pips} aria-hidden>
          {Array.from({ length: hpMax }, (_, index) => (
            <span key={index} className={styles.pip} data-filled={index < shown} />
          ))}
        </span>
      ) : (
        <span className={styles.hpBar} data-hp-meter="bar" aria-hidden>
          <span className={styles.hpBarFill} style={{ width: `${(shown / hpMax) * 100}%` }} />
        </span>
      )}
      <span className={styles.heroMeta}>
        HP {hp} of {hpMax}
      </span>
    </span>
  );
}

export function HeroCard({ hero, mode, showCrown }: HeroCardProps): ReactElement {
  const stats = [
    ...(hero.hpMax > 0 ? [<HpMeter key="hp" hp={hero.hp} hpMax={hero.hpMax} />] : []),
    ...(showCrown
      ? [
          <span key="crown" className={styles.heroMeta}>
            Crown · {hero.crown.label} · <span className={styles.heroMetaSoft}>{crownProgress(hero.crown)}</span>
          </span>,
        ]
      : []),
    <span key="momentum" className={styles.heroMeta}>
      Momentum <strong>{momentumLabel(hero, mode)}</strong>
    </span>,
  ];

  return (
    <Card padding="md">
      <Card.Body>
        <div className={styles.heroTop}>
          <div className={styles.crest}>
            <span className={styles.crestLevel}>{hero.level}</span>
            <span className={styles.crestLabel}>lvl</span>
          </div>
          <div className={styles.heroMain}>
            <div className={styles.heroTitleRow}>
              <span className={hero.title ? styles.heroTitle : styles.heroMetaSoft}>{hero.title || 'No title displayed'}</span>
              <span className={styles.coins}>◈ {hero.coins.toLocaleString()}</span>
            </div>
            {hero.xpForNextLevel === null ? null : <LevelProgress level={hero.level} xpIntoLevel={hero.xpIntoLevel} xpForNextLevel={hero.xpForNextLevel} />}
          </div>
        </div>
        <div className={styles.heroStatsFrame}>
          <div className={styles.heroStats}>
            {stats.flatMap((stat, index) => (index === 0 ? [stat] : [<span key={`divider-${index}`} className={styles.divider} aria-hidden />, stat]))}
            <span className={styles.heroAction}>
              <Button size="sm" variant="ghost" asChild>
                <Link to="/hero">Hero</Link>
              </Button>
            </span>
          </div>
        </div>
      </Card.Body>
    </Card>
  );
}
